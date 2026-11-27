import { describe, it, expect } from 'vitest';
import {
  podeVenderNoCliente, bloqueiosRemessa, bloqueiosProposta, avisosProposta, chassiDoCodigo, itensDoPedido,
  etapasParaPular, propostaDaLinha, type PropostaVenda,
} from '../venda-cliente';

const prop = (o: Partial<PropostaVenda> = {}): PropostaVenda => ({
  id: 10, documento: '12345678000199', cliente: 'Fazenda X', deletada: false, pedidos: [], valor: 250000, status: 'Concluida-Vendido', ...o,
});

describe('venda no cliente — permissão', () => {
  it('exige as duas ações ou admin', () => {
    expect(podeVenderNoCliente({ isAdmin: true })).toBe(true);
    expect(podeVenderNoCliente({ modulos: ['remessas:emitir'] })).toBe(false);
    expect(podeVenderNoCliente({ modulos: ['pedidos-maquinas:faturar'] })).toBe(false);
    expect(podeVenderNoCliente({ modulos: ['remessas:emitir', 'pedidos-maquinas:faturar'] })).toBe(true);
  });
});

describe('venda no cliente — remessa', () => {
  const ok = { tipo: 'demonstracao', situacaoAberta: true, nfChave: '3526…', temVoltaViva: false };
  it('demonstração aberta com NF passa', () => expect(bloqueiosRemessa(ok)).toEqual([]));
  it('trava sem NF, encerrada, com volta ou se não é demonstração', () => {
    expect(bloqueiosRemessa({ ...ok, nfChave: null })).toHaveLength(1);
    expect(bloqueiosRemessa({ ...ok, situacaoAberta: false })).toHaveLength(1);
    expect(bloqueiosRemessa({ ...ok, temVoltaViva: true })).toHaveLength(1);
    expect(bloqueiosRemessa({ ...ok, tipo: 'os' })).toHaveLength(1);
  });
});

describe('venda no cliente — proposta', () => {
  it('obrigatória', () => expect(bloqueiosProposta(null, '1')).toEqual(['Escolha a proposta da venda.']));
  it('mesmo CPF/CNPJ (com ou sem máscara)', () => {
    expect(bloqueiosProposta(prop(), '12.345.678/0001-99')).toEqual([]);
    expect(bloqueiosProposta(prop(), '99.999.999/0001-99')[0]).toMatch(/outro cliente/);
  });
  it('lixeira, outro pedido, sem valor e sem documento travam', () => {
    expect(bloqueiosProposta(prop({ deletada: true }), '12345678000199')[0]).toMatch(/lixeira/);
    expect(bloqueiosProposta(prop({ pedidos: ['PVM-0003'] }), '12345678000199')[0]).toMatch(/PVM-0003/);
    expect(bloqueiosProposta(prop({ valor: 0 }), '12345678000199')[0]).toMatch(/valor/);
    expect(bloqueiosProposta(prop({ documento: '' }), '12345678000199')[0]).toMatch(/não tem CPF/);
  });
  it('avisa proposta ainda não vendida', () => {
    expect(avisosProposta(prop())).toEqual([]);
    expect(avisosProposta(prop({ status: 'Em negociação' }))[0]).toMatch(/Em negociação/);
  });
  it('lê a linha da v_formulario', () => {
    const p = propostaDaLinha({ id: 7, 'Cpf/Cpnj': '123.456.789-09', Cliente: ' João ', Valor_Total: '185.000,00', status: 'Aberta', deleted_at: null }, []);
    expect(p).toMatchObject({ id: 7, documento: '12345678909', cliente: 'João', valor: 185000, deletada: false });
  });
});

describe('venda no cliente — itens do pedido', () => {
  const produtos = [
    { codigo: 'MDI07513V50005756', codigo_produto: 111, descricao: 'TRATOR 6075E', familia_nome: 'Tratores', marca: 'MAHINDRA', modelo: '6075E' },
    { codigo: 'GRADE-X', codigo_produto: 222, descricao: 'GRADE', familia_nome: 'Implementos' },
  ];
  it('chassi só quando o código parece chassi', () => {
    expect(chassiDoCodigo('mdi07513v50005756')).toBe('MDI07513V50005756');
    expect(chassiDoCodigo('GRADE 14')).toBeNull();
    expect(chassiDoCodigo('20478')).toBe('20478');
    expect(chassiDoCodigo('ABC')).toBeNull();
    expect(chassiDoCodigo('GRADE')).toBeNull();
  });
  it('uma máquina: preço da proposta', () => {
    const r = itensDoPedido([{ nCodProd: 111, qtd: 1, valorUnit: 240000 }], produtos, 250000);
    expect(r.itens[0]).toMatchObject({ codigo: 'MDI07513V50005756', chassi: 'MDI07513V50005756', preco: 250000, qtde: 1 });
    expect(r.avisos).toEqual([]);
  });
  it('avisa quando a proposta e a remessa têm valores muito diferentes', () => {
    const r = itensDoPedido([{ nCodProd: 111, qtd: 1, valorUnit: 165000 }], produtos, 56800);
    expect(r.itens[0].preco).toBe(56800);
    expect(r.avisos[0]).toMatch(/confira se é a proposta certa/);
  });
  it('várias máquinas: preço da remessa e aviso da diferença; produto fora do cadastro avisa', () => {
    const r = itensDoPedido([{ nCodProd: 111, qtd: 1, valorUnit: 150000 }, { nCodProd: 222, qtd: 1, valorUnit: 30000 }, { nCodProd: 9, qtd: 1, valorUnit: 1, descricao: 'X' }], produtos, 250000);
    expect(r.itens.map((i) => i.preco)).toEqual([150000, 30000]);
    expect(r.avisos.join(' ')).toMatch(/cadastro/);
    expect(r.avisos.join(' ')).toMatch(/2 máquinas/);
    expect(r.avisos.join(' ')).toMatch(/sem chassi/);
  });
});

describe('venda no cliente — roteiro da OS', () => {
  const e = (ordem: number, nome: string, status: string) => ({ ordem, nome, status });
  it('pula as não começadas e a retirada em andamento', () => {
    const r = etapasParaPular([e(1, 'Saída da loja', 'concluida'), e(2, 'Entrega no cliente', 'concluida'), e(3, 'Retirada no cliente', 'liberada'), e(4, 'Chegada na loja', 'pendente')]);
    expect(r.map((x) => x.ordem)).toEqual([3, 4]);
  });
  it('não pula a entrega em andamento (o checklist dela ainda vale)', () => {
    const r = etapasParaPular([e(1, 'Saída da loja', 'concluida'), e(2, 'Entrega no cliente', 'liberada'), e(3, 'Retirada no cliente', 'pendente'), e(4, 'Chegada na loja', 'pendente')]);
    expect(r.map((x) => x.ordem)).toEqual([3, 4]);
  });
});
