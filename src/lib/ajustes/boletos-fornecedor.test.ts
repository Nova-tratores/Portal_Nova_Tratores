import { describe, it, expect } from 'vitest';
import {
  dividirIgual, numeroNF, listaNFs, validarRegistro, alocar, montarObservacao, camposPorTitulo,
  planoBaixaParcela, statusPorParcelas, detectarCiclos, baixaAntecipadaSuspeita, somar, chaveFornecedor, ehManual,
  type TituloSel, type ParcelaIn, type TituloEspelho,
} from './boletos-fornecedor';

// Ciclo real da CAMBUCI (CASTRO, 14/10/2026): 8 duplicatas de 4 NFs = R$ 4.119,22
// viraram 4 parcelas de boleto (08/11, 03/12, 28/12, 22/01).
const T = (codigo: number, doc: string, valor: number, venc: string, extra: Partial<TituloSel> = {}): TituloSel => ({
  conta: 'CASTRO', codigoLancamento: codigo, numeroDoc: doc, numeroDocFiscal: doc.split('/')[0].replace(/^0+/, ''), valor, vencimento: venc, idOrigem: 'COMP', codigoFornecedor: 5234761207, contraparte: 'CAMBUCI', ...extra,
});
const TITULOS: TituloSel[] = [
  T(1, '000790183/1', 581.67, '2026-11-02'), T(2, '000790183/2', 581.66, '2026-12-02'),
  T(3, '000790210/1', 563.5, '2026-11-02'), T(4, '000790210/2', 563.5, '2026-12-02'),
  T(5, '000790920/1', 583.46, '2026-11-06'), T(6, '000790920/2', 583.45, '2026-12-06'),
  T(7, '000790967/1', 330.99, '2026-11-06'), T(8, '000790967/2', 330.99, '2026-12-06'),
];
const PARCELAS: ParcelaIn[] = [
  { numero: 1, dataVencimento: '2026-11-08', valor: 1029.81 },
  { numero: 2, dataVencimento: '2026-12-03', valor: 1029.81 },
  { numero: 3, dataVencimento: '2026-12-28', valor: 1029.80 },
  { numero: 4, dataVencimento: '2027-01-22', valor: 1029.80 },
];

describe('dividirIgual / numeroNF', () => {
  it('divide com centavos na última e vence de 30 em 30 dias', () => {
    const p = dividirIgual(4119.22, 4, '2026-11-08');
    expect(p.map((x) => x.valor)).toEqual([1029.8, 1029.8, 1029.8, 1029.82]);
    expect(p.map((x) => x.dataVencimento)).toEqual(['2026-11-08', '2026-12-08', '2027-01-07', '2027-02-06']);
    expect(somar(p.map((x) => x.valor))).toBe(4119.22);
  });
  it('tira zeros e a parcela do nº do documento', () => {
    expect(numeroNF({ numeroDoc: '000790210/1' })).toBe('790210');
    expect(numeroNF({ numeroDoc: '000790210/1', numeroDocFiscal: '790210' })).toBe('790210');
    expect(numeroNF({ numeroDoc: null })).toBeNull();
    expect(listaNFs(TITULOS)).toEqual(['790183', '790210', '790920', '790967']);
  });
});

describe('validarRegistro', () => {
  it('aceita o ciclo real', () => {
    expect(validarRegistro({ titulos: TITULOS, parcelas: PARCELAS, numero: '123456' })).toBeNull();
  });
  it('recusa soma fora da tolerância, título manual, empresas misturadas e parcela fora de ordem', () => {
    expect(validarRegistro({ titulos: TITULOS, parcelas: [{ numero: 1, dataVencimento: '2026-11-08', valor: 4000 }], numero: '1' })).toMatch(/difere/);
    expect(validarRegistro({ titulos: [...TITULOS, T(9, 'X', 10, '2026-11-01', { idOrigem: 'RPTP' })], parcelas: PARCELAS, numero: '1' })).toMatch(/manual/);
    expect(validarRegistro({ titulos: [TITULOS[0], { ...TITULOS[1], conta: 'NOVA' }], parcelas: PARCELAS, numero: '1' })).toMatch(/mesma empresa/);
    expect(validarRegistro({ titulos: TITULOS, parcelas: [PARCELAS[1], PARCELAS[0]], numero: '1' })).toMatch(/fora de ordem/);
    expect(validarRegistro({ titulos: TITULOS, parcelas: PARCELAS, numero: '' })).toMatch(/nº do boleto/);
    const desordem = PARCELAS.map((p, i) => (i === 1 ? { ...p, dataVencimento: '2026-11-01' } : p));
    expect(validarRegistro({ titulos: TITULOS, parcelas: desordem, numero: '1' })).toMatch(/vence antes/);
  });
  it('tolera diferença de centavos', () => {
    const p = PARCELAS.map((x, i) => (i === 3 ? { ...x, valor: 1030.3 } : x));
    expect(validarRegistro({ titulos: TITULOS, parcelas: p, numero: '1' })).toBeNull();
    expect(validarRegistro({ titulos: TITULOS, parcelas: p, numero: '1' }, 0.1)).toMatch(/difere/);
  });
});

describe('alocar', () => {
  it('enche as parcelas em ordem de vencimento; duplicata pode cair em duas', () => {
    const { alocacoes, diferenca } = alocar(TITULOS, PARCELAS);
    expect(diferenca).toBe(0);
    // cada parcela soma exatamente o valor dela
    for (const p of PARCELAS) {
      expect(somar(alocacoes.filter((a) => a.parcelaNumero === p.numero).map((a) => a.valor))).toBe(p.valor);
    }
    // cada duplicata está inteira
    for (const t of TITULOS) {
      expect(somar(alocacoes.filter((a) => a.codigoLancamento === t.codigoLancamento).map((a) => a.valor))).toBe(t.valor);
      expect(alocacoes.filter((a) => a.codigoLancamento === t.codigoLancamento && a.principal)).toHaveLength(1);
    }
    // a 1ª parcela (1.029,81) leva 581,67 + 448,14 da 2ª duplicata de 02/11
    expect(alocacoes[0]).toMatchObject({ codigoLancamento: 1, parcelaNumero: 1, valor: 581.67, principal: true });
    expect(alocacoes[1]).toMatchObject({ codigoLancamento: 3, parcelaNumero: 1, valor: 448.14, principal: true });
    expect(alocacoes[2]).toMatchObject({ codigoLancamento: 3, parcelaNumero: 2, valor: 115.36, principal: false });
  });
  it('a última parcela absorve a diferença', () => {
    const p = PARCELAS.map((x, i) => (i === 3 ? { ...x, valor: 1030.3 } : x));
    const { alocacoes, diferenca } = alocar(TITULOS, p);
    expect(diferenca).toBe(0.5);
    expect(somar(alocacoes.map((a) => a.valor))).toBe(4119.22);
  });
  it('uma parcela só = tudo nela', () => {
    const { alocacoes } = alocar(TITULOS, [{ numero: 1, dataVencimento: '2026-11-08', valor: 4119.22 }]);
    expect(alocacoes).toHaveLength(8);
    expect(alocacoes.every((a) => a.parcelaNumero === 1 && a.principal)).toBe(true);
  });
});

describe('observação e campos por duplicata', () => {
  it('monta a marca e substitui uma anterior sem perder o resto', () => {
    const obs = montarObservacao({ obsAtual: 'frete incluso', fornecedor: 'CAMBUCI', numero: '77', parcelaNumero: 1, parcelaTotal: 4, dataVencimento: '2026-11-08', nfs: ['790183', '790210'] });
    expect(obs).toBe('frete incluso [Boleto CAMBUCI nº 77 parc 1/4 venc 08/11/2026 · NFs 790183, 790210]');
    const de = montarObservacao({ obsAtual: obs, fornecedor: 'CAMBUCI', numero: '78', parcelaNumero: 2, parcelaTotal: 4, dataVencimento: '2026-12-03', nfs: ['790183'] });
    expect(de).toBe('frete incluso [Boleto CAMBUCI nº 78 parc 2/4 venc 03/12/2026 · NFs 790183]');
    expect(montarObservacao({ obsAtual: 'x'.repeat(1200), fornecedor: 'A', numero: '1', parcelaNumero: 1, parcelaTotal: 1, dataVencimento: '2026-11-08', nfs: [] }).length).toBe(1000);
  });
  it('previsão (e vencimento, se alinhar) = parcela principal', () => {
    const { alocacoes } = alocar(TITULOS, PARCELAS);
    const campos = camposPorTitulo(TITULOS, alocacoes, PARCELAS, { fornecedor: 'CAMBUCI', numero: '77', alinharVencimento: true });
    expect(campos).toHaveLength(8);
    const t3 = campos.find((c) => c.codigoLancamento === 3)!; // 448,14 na parc 1 e 115,36 na 2 → principal = 1
    expect(t3.parcelaNumero).toBe(1);
    expect(t3.campos).toEqual({ dataPrevisao: '2026-11-08', dataVencimento: '2026-11-08', observacao: '[Boleto CAMBUCI nº 77 parc 1/4 venc 08/11/2026 · NFs 790183, 790210, 790920, 790967]' });
    const semVenc = camposPorTitulo(TITULOS, alocacoes, PARCELAS, { fornecedor: 'CAMBUCI', numero: '77', alinharVencimento: false });
    expect(semVenc[0].campos.dataVencimento).toBeUndefined();
  });
});

describe('planoBaixaParcela', () => {
  const { alocacoes } = alocar(TITULOS, PARCELAS);
  it('baixa cada duplicata pelo alocado, teto = aberto; diferença vira juros/desconto na última', () => {
    const abertos = new Map(TITULOS.map((t) => [t.codigoLancamento, t.valor]));
    const plano = planoBaixaParcela(PARCELAS[0], alocacoes, abertos);
    expect(plano.erro).toBeUndefined();
    expect(plano.baixas).toEqual([{ codigoLancamento: 1, valor: 581.67 }, { codigoLancamento: 3, valor: 448.14 }]);
    expect(plano.diferenca).toBe(0);
    const maior = planoBaixaParcela({ ...PARCELAS[0], valor: 1035.0 }, alocacoes, abertos);
    expect(maior.baixas[1]).toEqual({ codigoLancamento: 3, valor: 448.14, juros: 5.19 });
    const menor = planoBaixaParcela({ ...PARCELAS[0], valor: 1000.0 }, alocacoes, abertos);
    expect(menor.baixas[1]).toEqual({ codigoLancamento: 3, valor: 448.14, desconto: 29.81 });
  });
  it('pula duplicata já baixada e avisa quando nenhuma sobra', () => {
    const abertos = new Map(TITULOS.map((t) => [t.codigoLancamento, t.codigoLancamento === 1 ? 0 : t.valor]));
    const plano = planoBaixaParcela(PARCELAS[0], alocacoes, abertos);
    expect(plano.jaPagos).toEqual([1]);
    expect(plano.baixas.map((b) => b.codigoLancamento)).toEqual([3]);
    const nada = planoBaixaParcela(PARCELAS[0], alocacoes, new Map([[1, 0], [3, 0]]));
    expect(nada.erro).toMatch(/já estão baixadas/);
    expect(planoBaixaParcela(PARCELAS[0], alocacoes, new Map()).erro).toMatch(/não encontrada/);
  });
  it('status do boleto segue as parcelas', () => {
    expect(statusPorParcelas([{ status: 'aberta' }, { status: 'aberta' }], 'registrado')).toBe('registrado');
    expect(statusPorParcelas([{ status: 'paga' }, { status: 'aberta' }], 'registrado')).toBe('parcial');
    expect(statusPorParcelas([{ status: 'paga' }, { status: 'paga' }], 'parcial')).toBe('pago');
    expect(statusPorParcelas([{ status: 'paga' }], 'cancelado')).toBe('cancelado');
  });
});

describe('detecção do padrão antigo', () => {
  const E = (codigo: number, extra: Partial<TituloEspelho>): TituloEspelho => ({ codigoLancamento: codigo, valorDocumento: 100, nomeFornecedor: 'CAMBUCI METALURGICA LTDA', status: 'PAGO', ...extra });
  it('regra A: duplicatas pagas ≥ 7 d antes + manuais emitidos no mesmo dia com a mesma soma', () => {
    const titulos: TituloEspelho[] = [
      E(1, { idOrigem: 'COMP', dataVencimento: '2026-11-02', dataPagamento: '2026-10-14', valorDocumento: 563.5, desconto: 563.5 }),
      E(2, { idOrigem: 'COMP', dataVencimento: '2026-11-02', dataPagamento: '2026-10-14', valorDocumento: 581.67, desconto: 581.67 }),
      E(3, { idOrigem: 'COMP', dataVencimento: '2026-10-16', dataPagamento: '2026-10-14', valorDocumento: 50 }), // 2 dias antes: normal
      // manual: data_emissao é a da parcela (30 d antes do venc.); o que casa com o ciclo é a INCLUSÃO
      // 1ª parcela manual nasce MANP, as seguintes RPTP
      E(10, { idOrigem: 'MANP', dataInclusao: '2026-10-14T16:49:34', dataEmissao: '2026-10-09', valorDocumento: 600, status: 'A VENCER', nomeFornecedor: 'CAMBUCI' }),
      E(11, { idOrigem: 'RPTP', dataInclusao: '2026-10-15', dataEmissao: '2026-12-03', valorDocumento: 545.17, status: 'PAGO' }),
      E(12, { idOrigem: 'RPTP', dataInclusao: '2026-10-20', dataEmissao: '2026-10-20', valorDocumento: 999, status: 'A VENCER' }),
    ];
    const ciclos = detectarCiclos(titulos);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]).toMatchObject({ data: '2026-10-14', somaComp: 1145.17, somaRptp: 1145.17, bate: true, rptpAbertos: 1, desconto100: 2 });
    expect(ciclos[0].comp.map((t) => t.codigoLancamento)).toEqual([1, 2]);
    expect(ciclos[0].rptp.map((t) => t.codigoLancamento)).toEqual([10, 11]);
  });
  it('antecipada sem manual = ciclo sem par (bate=false); fornecedor sem antecipada = nada', () => {
    const ciclos = detectarCiclos([E(1, { idOrigem: 'COMP', dataVencimento: '2026-11-02', dataPagamento: '2026-10-01' }), E(2, { idOrigem: 'COMP', dataVencimento: '2026-11-02', dataPagamento: '2026-11-02' })]);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]).toMatchObject({ data: '2026-10-01', rptp: [], bate: false });
  });
  it('ehManual: MANP e RPTP são manuais; COMP e sem origem não', () => {
    expect(ehManual({ idOrigem: 'MANP' })).toBe(true);
    expect(ehManual({ idOrigem: 'RPTP' })).toBe(true);
    expect(ehManual({ idOrigem: 'COMP' })).toBe(false);
    expect(ehManual({ idOrigem: null })).toBe(false);
  });
  it('chaveFornecedor junta os dois cadastros da CAMBUCI', () => {
    expect(chaveFornecedor('CAMBUCI METALURGICA LTDA')).toBe('CAMBUCI');
    expect(chaveFornecedor('CAMBUCI')).toBe('CAMBUCI');
    expect(chaveFornecedor('A B INDUSTRIA')).toBe('A B INDUSTRIA');
  });
  it('baixaAntecipadaSuspeita', () => {
    expect(baixaAntecipadaSuspeita('2026-10-14', '2026-11-02', 'COMP')).toBe(true);
    expect(baixaAntecipadaSuspeita('2026-10-30', '2026-11-02', 'COMP')).toBe(false);
    expect(baixaAntecipadaSuspeita('2026-10-14', '2026-11-02', 'RPTP')).toBe(false);
    expect(baixaAntecipadaSuspeita('2026-10-14', null)).toBe(false);
  });
});
