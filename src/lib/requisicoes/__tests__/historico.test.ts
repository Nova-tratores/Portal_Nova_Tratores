import { describe, it, expect } from 'vitest';
import { registrosDaMudanca, eventoDoLog } from '../historico';

describe('registrosDaMudanca', () => {
  const antes = { status: 'pedido', valor_despeza: '100,00', fornecedor: 'Casa X', foto_nf: null, pago: false };

  it('mudança de fase vira mover_status com de/para (a data de envio não vira edição)', () => {
    const r = registrosDaMudanca(antes, { status: 'financeiro', enviado_financeiro_data: '2026-11-25' });
    expect(r).toEqual([{ acao: 'mover_status', detalhes: { de: 'pedido', para: 'financeiro' } }]);
  });

  it('edição guarda o antes e o depois, e ignora o que não mudou', () => {
    const r = registrosDaMudanca(antes, { valor_despeza: '250,00', fornecedor: 'Casa X' });
    expect(r).toEqual([{ acao: 'editar', detalhes: { mudancas: [{ campo: 'valor_despeza', rotulo: 'Valor', de: '100,00', para: '250,00' }] } }]);
    expect(registrosDaMudanca(antes, { fornecedor: 'Casa X' })).toEqual([]);
  });

  it('anexo, troca e remoção', () => {
    expect(registrosDaMudanca(antes, { foto_nf: 'a.pdf' })[0]).toEqual({ acao: 'anexar', detalhes: { campo: 'foto_nf', rotulo: 'Nota Fiscal', trocou: false } });
    expect(registrosDaMudanca({ recibo_fornecedor: 'x' }, { recibo_fornecedor: 'y' })[0].detalhes.trocou).toBe(true);
    expect(registrosDaMudanca({ boleto_fornecedor: 'x' }, { boleto_fornecedor: null })[0].acao).toBe('remover_anexo');
  });

  it('pago e pedido de autorização', () => {
    expect(registrosDaMudanca(antes, { pago: true, pago_em: 'x', pago_por: 'Ana' })).toEqual([{ acao: 'marcar_pago', detalhes: {} }]);
    const p = registrosDaMudanca(antes, { autorizacao_status: 'aguardando', autorizacao_motivo: 'urgente', status: 'completa' });
    expect(p.map((x) => x.acao)).toEqual(['mover_status', 'pedir_autorizacao']);
  });
});

describe('eventoDoLog', () => {
  it('frases das ações novas', () => {
    expect(eventoDoLog('mover_status', { de: 'pedido', para: 'financeiro' }).descricao).toBe('Enviou ao financeiro');
    expect(eventoDoLog('mover_status', { de: 'lixeira', para: 'pedido' }).descricao).toBe('Restaurou da lixeira');
    expect(eventoDoLog('editar', { mudancas: [{ campo: 'valor_despeza', rotulo: 'Valor', de: '100,00', para: '250,00' }] }))
      .toEqual({ tipo: 'editar', descricao: 'Alterou Valor', detalhe: 'de R$ 100,00 para R$ 250,00' });
    expect(eventoDoLog('recusar_requisicao', { obs: 'caro' }).descricao).toBe('NÃO AUTORIZOU a requisição');
  });

  it('linhas antigas ("editar" só com o valor novo) ainda dizem o que foi', () => {
    expect(eventoDoLog('editar', { status: 'lixeira' }).descricao).toBe('Moveu para a lixeira');
    expect(eventoDoLog('editar', { foto_nf: 'a.pdf' }).descricao).toBe('Anexou Nota Fiscal');
    expect(eventoDoLog('editar', { fornecedor: 'Casa Y' })).toEqual({ tipo: 'editar', descricao: 'Alterou Fornecedor', detalhe: 'colocou "Casa Y"' });
  });
});
