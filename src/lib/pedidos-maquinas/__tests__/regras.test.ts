import { describe, it, expect } from 'vitest';
import {
  importarDaProposta, validarParaOmie, parcelasParaOmie, podeMoverPara, totalItens, arrumarParcelas,
  type ParcelaPedidoMaquina, type ItemPedidoMaquina,
} from '../regras';

const item = (o: Partial<ItemPedidoMaquina> = {}): ItemPedidoMaquina => ({
  codigo: 'MDI-123', codigo_produto: 99, descricao: 'Trator 6075', qtde: 1, preco: 300000, desconto: 0, ...o,
});
const parc = (o: Partial<ParcelaPedidoMaquina>): ParcelaPedidoMaquina => ({
  n: 0, vencimento: '2026-12-01', valor: 0, percentual: 0, meio: 'boleto', entrada: false, origem_proposta_parcela: null, ...o,
});

describe('importarDaProposta', () => {
  it('traz entrada e parcelas com a origem', () => {
    const r = importarDaProposta(
      { id: 7, Cliente: ' João ', 'Cpf/Cpnj': '123.456.789-09', Valor_Total: '300.000,00', status: 'Concluida-Vendido', vendedor_id: 3, Marca: 'Mahindra', Modelo: '6075' },
      { forma: 'misto', entrada_valor: 100000, entrada_data: '2026-11-20', parcelas: [
        { vencimento: '2027-11-20', valor: 100000 }, { vencimento: '2028-11-20', valor: 100000 },
      ], banco: 'BB' },
      300000,
    );
    expect(r.cliente).toEqual({ nome: 'João', documento: '12345678909' });
    expect(r.vendedor_id).toBe(3);
    expect(r.parcelas.map((p) => [p.n, p.origem_proposta_parcela, p.entrada])).toEqual([[1, 0, true], [2, 1, false], [3, 2, false]]);
    expect(r.parcelas.map((p) => p.percentual)).toEqual([33.33, 33.33, 33.33]);
    expect(r.avisos).toEqual([]);
  });
  it('sem pagamento estruturado avisa com o texto', () => {
    const r = importarDaProposta({ id: 1, Cliente: 'X', Condicoes: '30/60/90', status: 'AGUARDANDO RESPOSTA CLIENTE' }, null, 0);
    expect(r.parcelas).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/30\/60\/90/);
    expect(r.avisos.join(' ')).toMatch(/não marcada como vendida/);
  });
  it('avisa valor diferente', () => {
    const r = importarDaProposta({ id: 1, Valor_Total: 1000, status: 'Concluida-Vendido' }, { parcelas: [{ vencimento: '2026-12-01', valor: 1000 }] }, 1200);
    expect(r.avisos.length).toBe(2);
  });
});

describe('validarParaOmie', () => {
  const ok = {
    status: 'em_montagem', cliente: 'J', cliente_documento: '12345678909', vendedor_id: 1,
    itens: [item()], parcelas: [parc({ valor: 300000 })],
  };
  it('passa o pedido completo', () => {
    expect(validarParaOmie(ok, '2026-11-13')).toEqual([]);
  });
  it('acusa os furos', () => {
    const e = validarParaOmie({ ...ok, cliente_documento: '1', itens: [item({ codigo_produto: null })], parcelas: [parc({ valor: 10, vencimento: '2026-01-01' })] }, '2026-11-13');
    expect(e.join(' ')).toMatch(/CPF\/CNPJ/);
    expect(e.join(' ')).toMatch(/sem cadastro/);
    expect(e.join(' ')).toMatch(/somam/);
    expect(e.join(' ')).toMatch(/vencida/);
  });
});

describe('parcelasParaOmie', () => {
  it('à vista hoje = 000', () => {
    expect(parcelasParaOmie([parc({ vencimento: '2026-11-13', valor: 10 })], 10, '2026-11-13')).toEqual({ codigo_parcela: '000', qtde_parcelas: 1 });
  });
  it('lista exata fechando 100%', () => {
    const r = parcelasParaOmie([parc({ vencimento: '2026-12-13', valor: 33.33 }), parc({ vencimento: '2027-01-12', valor: 33.33 }), parc({ vencimento: '2027-02-11', valor: 33.34 })], 100, '2026-11-13');
    expect(r.codigo_parcela).toBe('999');
    const l = r.lista_parcelas!.parcela;
    expect(l.map((x) => x.percentual)).toEqual([33.33, 33.33, 33.34]);
    expect(l[0]).toMatchObject({ numero_parcela: 1, data_vencimento: '13/12/2026', quantidade_dias: 30 });
  });
});

describe('fases e totais', () => {
  it('trava os movimentos automáticos', () => {
    expect(podeMoverPara('em_montagem', 'aguardando_credito', { enviado: false })).toBeNull();
    expect(podeMoverPara('em_montagem', 'faturado', { enviado: false })).toMatch(/Faturar/);
    expect(podeMoverPara('enviado_omie', 'em_montagem', { enviado: true })).toMatch(/Omie/);
  });
  it('soma itens e ordena parcelas com a entrada primeiro', () => {
    expect(totalItens([item({ qtde: 2, preco: 10.005, desconto: 1 }), item({ preco: 5 })])).toBe(24.01);
    const a = arrumarParcelas([parc({ vencimento: '2027-01-01', valor: 50 }), parc({ vencimento: '2026-12-01', valor: 50, entrada: true })], 100);
    expect(a.map((x) => [x.n, x.entrada])).toEqual([[1, true], [2, false]]);
  });
});
