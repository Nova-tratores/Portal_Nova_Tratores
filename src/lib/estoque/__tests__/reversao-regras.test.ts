import { describe, it, expect } from 'vitest';
import { pagamentosDosMovimentos, planejarRelancamento, abatimento, statusDepoisDeRelancar, observacaoRelancamento, type PagamentoGuardado, type TituloOmie } from '../reversao-regras';

// movimentos reais do título 2549736760 (NOVA), um por página como a Omie devolve
const MOVS = [
  { detalhes: { cGrupo: 'CONTA_A_PAGAR', cOrigem: 'MANP', nCodTitulo: 2549736760, dDtPagamento: '03/11/2026', nCodCC: 2127587618 }, resumo: { nValPago: 91.32 } },
  { detalhes: { cGrupo: 'CONTA_CORRENTE_PAG', cOrigem: 'BAXP', nCodTitulo: 2549736760, nCodBaixa: 2549736870, dDtPagamento: '03/11/2026', nValorMovCC: 91.32, nCodCC: 2127587618, dDtConcilia: '03/11/2026' }, resumo: { nValPago: 91.32 } },
];
const TIT = { codigo: 2549736760, numeroParcela: '001/001', valorDocumento: 91.32 };

const pag = (o: Partial<PagamentoGuardado>): PagamentoGuardado => ({
  codigoTitulo: 1, numeroParcela: '001/002', valorTitulo: 100, codigoBaixa: 9, data: '05/11/2026',
  valor: 100, juros: 0, multa: 0, desconto: 0, contaCorrente: 55, conciliadoEm: null, ...o,
});
const tit = (o: Partial<TituloOmie>): TituloOmie => ({
  codigo: 10, numeroParcela: '001/002', valorDocumento: 100, valorPago: 0, status: 'A VENCER', vencimento: '05/12/2026', documento: '000123', ...o,
});

describe('pagamentosDosMovimentos', () => {
  it('pega só o movimento de pagamento, com conciliação', () => {
    const p = pagamentosDosMovimentos(MOVS, TIT);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ codigoBaixa: 2549736870, valor: 91.32, data: '03/11/2026', contaCorrente: 2127587618, conciliadoEm: '03/11/2026', numeroParcela: '001/001' });
  });
  it('não repete a mesma baixa nem pega título de outro', () => {
    const m = [...MOVS, MOVS[1], { detalhes: { ...MOVS[1].detalhes, nCodTitulo: 1, nCodBaixa: 7 }, resumo: {} }];
    expect(pagamentosDosMovimentos(m, TIT)).toHaveLength(1);
  });
});

describe('abatimento', () => {
  it('dinheiro + desconto − juros − multa', () => {
    expect(abatimento({ valor: 102, juros: 2, multa: 0, desconto: 0 })).toBe(100);
    expect(abatimento({ valor: 0, juros: 0, multa: 0, desconto: 50 })).toBe(50);
  });
});

describe('planejarRelancamento', () => {
  it('casa pela parcela', () => {
    const { itens } = planejarRelancamento(
      [pag({ numeroParcela: '002/002', codigoTitulo: 2 }), pag({ numeroParcela: '001/002' })],
      [tit({ codigo: 10, numeroParcela: '001/002' }), tit({ codigo: 11, numeroParcela: '002/002' })],
    );
    expect(itens.map((i) => i.tituloNovo)).toEqual([11, 10]);
    expect(itens.every((i) => !i.bloqueio)).toBe(true);
  });
  it('título único recebe o pagamento mesmo com parcela diferente', () => {
    const { itens } = planejarRelancamento([pag({ numeroParcela: '001/003' })], [tit({ numeroParcela: '001/001' })]);
    expect(itens[0].tituloNovo).toBe(10);
  });
  it('bloqueia quando passa do saldo, sem valor em dinheiro ou sem título', () => {
    expect(planejarRelancamento([pag({ valor: 150 })], [tit({})]).itens[0].bloqueio).toMatch(/saldo/);
    expect(planejarRelancamento([pag({ valor: 0, desconto: 100 })], [tit({})]).itens[0].bloqueio).toMatch(/desconto/);
    const vazio = planejarRelancamento([pag({})], []);
    expect(vazio.itens[0].bloqueio).toMatch(/Nenhuma/);
    expect(vazio.avisos.join(' ')).toMatch(/dê entrada/);
  });
  it('dois pagamentos no mesmo título não passam do saldo', () => {
    const { itens } = planejarRelancamento([pag({ valor: 60, codigoBaixa: 1 }), pag({ valor: 60, codigoBaixa: 2 })], [tit({})]);
    expect(itens[0].bloqueio).toBeNull();
    expect(itens[1].bloqueio).toMatch(/saldo/);
  });
  it('avisa quando o total das contas novas mudou e pula o que já foi relançado', () => {
    const r = planejarRelancamento([pag({}), pag({ codigoBaixa: 2, codigoBaixaNova: 77 })], [tit({ valorDocumento: 120 })]);
    expect(r.itens).toHaveLength(1);
    expect(r.avisos.join(' ')).toMatch(/120\.00/);
  });
  it('ignora título cancelado', () => {
    expect(planejarRelancamento([pag({})], [tit({ status: 'CANCELADO' })]).itens[0].tituloNovo).toBeNull();
  });
});

describe('status e observação', () => {
  it('statusDepoisDeRelancar', () => {
    expect(statusDepoisDeRelancar([pag({ codigoBaixaNova: 1 })])).toBe('relancada');
    expect(statusDepoisDeRelancar([pag({ codigoBaixaNova: 1 }), pag({})])).toBe('parcial');
    expect(statusDepoisDeRelancar([pag({})])).toBe('aguardando_relancamento');
  });
  it('observacaoRelancamento tira zeros e caracteres que a Omie escapa', () => {
    const o = observacaoRelancamento('000016751', 'peça <errada>', pag({}));
    expect(o).toContain('NF 16751');
    expect(o).not.toMatch(/[<>&]/);
  });
});
