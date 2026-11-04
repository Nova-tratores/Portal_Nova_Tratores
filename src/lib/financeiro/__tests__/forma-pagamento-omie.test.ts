import { describe, it, expect } from 'vitest';
import {
  decidirFormaPagamento, entradaDoPedido, entradaDaOS, meioDeCodigo, meioDoTexto, ehAVista, dataBRparaISO,
} from '../forma-pagamento-omie';

// Pedidos reais da Castro (ConsultarPedido, 29/10/2026), reduzidos.
const PV_4135_A_VISTA = {
  cabecalho: { codigo_parcela: '000', data_previsao: '14/07/2026', numero_pedido: '4135' },
  lista_parcelas: { parcela: [{ data_vencimento: '14/07/2026', numero_parcela: 1, percentual: 100, quantidade_dias: 0, valor: 11820 }] },
  informacoes_adicionais: { dados_adicionais_nf: 'PEÇAS DO TRATOR TM - RETIRADO PELO EDUARDO MECANICO.', enviar_pix: 'N' },
};
const PV_4394_30_DIAS = {
  cabecalho: { codigo_parcela: '001', data_previsao: '28/10/2026', numero_pedido: '4394' },
  lista_parcelas: { parcela: [{ data_vencimento: '28/11/2026', numero_parcela: 1, percentual: 100, quantidade_dias: 31, valor: 488 }] },
  informacoes_adicionais: { dados_adicionais_nf: 'BOMBA ALIMENTADORA ... RETIRADO PELO EDUARDO MECANICO.' },
};
const PV_S18 = {
  cabecalho: { codigo_parcela: 'S18', data_previsao: '01/10/2026' },
  lista_parcelas: { parcela: [
    { data_vencimento: '31/10/2026', quantidade_dias: 30 },
    { data_vencimento: '30/11/2026', quantidade_dias: 60 },
    { data_vencimento: '30/12/2026', quantidade_dias: 90 },
  ] },
};

describe('meioDeCodigo', () => {
  it('códigos da NF-e (tPag) e siglas', () => {
    expect(meioDeCodigo('17')).toBe('pix');
    expect(meioDeCodigo('20')).toBe('pix');
    expect(meioDeCodigo('01')).toBe('dinheiro');
    expect(meioDeCodigo('02')).toBe('cheque');
    expect(meioDeCodigo('03')).toBe('cartao');
    expect(meioDeCodigo('04')).toBe('cartao');
    expect(meioDeCodigo('15')).toBe('boleto');
    expect(meioDeCodigo('PIX')).toBe('pix');
    expect(meioDeCodigo('BOL')).toBe('boleto');
    expect(meioDeCodigo('Cartão de Crédito')).toBe('cartao');
  });
  it('o que não diz o meio → null (99, 90, NFE, NFS, vazio)', () => {
    for (const v of ['99', '90', '99999', 'NFE', 'NFS', 'REC', '', null, undefined]) expect(meioDeCodigo(v)).toBeNull();
  });
});

describe('meioDoTexto', () => {
  it('pix sozinho vale', () => {
    expect(meioDoTexto('Cliente pagou no PIX dia 10')).toBe('pix');
  });
  it('outros meios só com contexto de pagamento', () => {
    expect(meioDoTexto('Pagamento: cartão de crédito em 3x')).toBe('cartao');
    expect(meioDoTexto('pago em dinheiro no balcão')).toBe('dinheiro');
    expect(meioDoTexto('Forma de pagamento - boleto')).toBe('boleto');
  });
  it('não confunde "cheque de revisão" nem texto qualquer', () => {
    expect(meioDoTexto('Assinou o cheque de revisão das 300 horas')).toBeNull();
    expect(meioDoTexto('PEDIDO PELO DITÃO PARA O TRATOR VALTRA BM 110.')).toBeNull();
    expect(meioDoTexto('trocado o cartão de memória')).toBeNull();
  });
  it('dois meios diferentes = ambíguo → null', () => {
    expect(meioDoTexto('metade no pix, pagamento do resto em dinheiro')).toBeNull();
  });
});

describe('dataBRparaISO / ehAVista', () => {
  it('converte data', () => {
    expect(dataBRparaISO('14/07/2026')).toBe('2026-07-14');
    expect(dataBRparaISO('2026-07-14')).toBeNull();
  });
  it('à vista por codigo_parcela 000 ou parcela única com 0 dias', () => {
    expect(ehAVista({ codigoParcela: '000', parcelas: [] })).toBe(true);
    expect(ehAVista({ codigoParcela: '999', parcelas: [{ vencimento: '2026-10-29', dias: 0 }] })).toBe(true);
    expect(ehAVista({ codigoParcela: '001', parcelas: [{ vencimento: '2026-11-28', dias: 31 }] })).toBe(false);
  });
});

describe('decidirFormaPagamento', () => {
  it('pedido real à vista (Castro 4135) → Pix em Validar Recebimento, com aviso', () => {
    const r = decidirFormaPagamento(entradaDoPedido(PV_4135_A_VISTA));
    expect(r).toMatchObject({
      forma_pagamento: 'Pix', status: 'validar_pix', tarefa: 'Validar Recebimento Pix',
      qtd_parcelas: 1, vencimento_boleto: '2026-07-14', datas_parcelas: '', fonte: 'a_vista',
    });
    expect(r.aviso).toMatch(/confira/i);
  });
  it('pedido real 30 dias (Castro 4394) → Boleto 30 dias em Gerar Boleto (igual a antes)', () => {
    const r = decidirFormaPagamento(entradaDoPedido(PV_4394_30_DIAS));
    expect(r).toMatchObject({
      forma_pagamento: 'Boleto 30 dias', status: 'gerar_boleto', tarefa: 'Gerar Boleto',
      qtd_parcelas: 1, vencimento_boleto: '2026-11-28', fonte: 'parcelas', aviso: '',
    });
  });
  it('3 parcelas → Boleto Parcelado com as datas seguintes', () => {
    const r = decidirFormaPagamento(entradaDoPedido(PV_S18));
    expect(r).toMatchObject({ forma_pagamento: 'Boleto Parcelado', qtd_parcelas: 3, vencimento_boleto: '2026-10-31', datas_parcelas: '2026-11-30, 2026-12-30', status: 'gerar_boleto' });
  });
  it('meio explícito na parcela vence o resto', () => {
    const pv = { ...PV_S18, lista_parcelas: { parcela: PV_S18.lista_parcelas.parcela.map((p) => ({ ...p, meio_pagamento: '03' })) } };
    expect(decidirFormaPagamento(entradaDoPedido(pv))).toMatchObject({ forma_pagamento: 'Cartão Parcelado', status: 'validar_pix', tarefa: 'Validar Recebimento Cartão Parcelado', fonte: 'meio_pagamento' });
    const pv2 = { ...PV_4135_A_VISTA, lista_parcelas: { parcela: [{ data_vencimento: '14/07/2026', quantidade_dias: 0, tipo_documento: 'DIN' }] } };
    expect(decidirFormaPagamento(entradaDoPedido(pv2))).toMatchObject({ forma_pagamento: 'Dinheiro', status: 'validar_pix' });
    const pv3 = { ...PV_4135_A_VISTA, lista_parcelas: { parcela: [{ data_vencimento: '14/07/2026', quantidade_dias: 0, meio_pagamento: '15' }] } };
    expect(decidirFormaPagamento(entradaDoPedido(pv3))).toMatchObject({ forma_pagamento: 'Boleto 30 dias', status: 'gerar_boleto' });
  });
  it('meio no texto da nota (a prazo) → usa, com aviso de conferir', () => {
    const pv = { ...PV_4394_30_DIAS, informacoes_adicionais: { dados_adicionais_nf: 'Pagamento via cartão' } };
    expect(decidirFormaPagamento(entradaDoPedido(pv))).toMatchObject({ forma_pagamento: 'Cartão a vista', status: 'validar_pix', fonte: 'texto' });
  });
  it('sem parcela nenhuma → Boleto 30 dias com o vencimento padrão', () => {
    const r = decidirFormaPagamento({ codigoParcela: '001', parcelas: [], vencimentoPadrao: '2026-11-01' });
    expect(r).toMatchObject({ forma_pagamento: 'Boleto 30 dias', qtd_parcelas: 1, vencimento_boleto: '2026-11-01' });
    expect(decidirFormaPagamento({ parcelas: [] })).toMatchObject({ forma_pagamento: 'Boleto 30 dias', vencimento_boleto: null });
  });
});

describe('entradaDaOS', () => {
  it('lê cCodParc, Parcelas e dados adicionais (sem as observações do serviço)', () => {
    const os = {
      Cabecalho: { cCodParc: '999', nQtdeParc: 1 },
      Parcelas: [{ nParcela: 1, dDtVenc: '29/10/2026', nDias: 0, nValor: 500 }],
      InformacoesAdicionais: { cDadosAdicNF: 'PPV 123' },
      Observacoes: { cObsOS: 'Pagamento em cheque de revisão' },
    };
    const e = entradaDaOS(os);
    expect(e.codigoParcela).toBe('999');
    expect(e.parcelas).toEqual([{ vencimento: '2026-10-29', dias: 0, meio: null, tipoDocumento: null }]);
    expect(e.textos).toEqual(['PPV 123']);
    expect(decidirFormaPagamento(e)).toMatchObject({ forma_pagamento: 'Pix', status: 'validar_pix', fonte: 'a_vista' });
  });
  it('OS 30/60 → Boleto Parcelado', () => {
    const os = { Cabecalho: { cCodParc: '999' }, Parcelas: [{ dDtVenc: '28/11/2026', nDias: 30 }, { dDtVenc: '28/12/2026', nDias: 60 }] };
    expect(decidirFormaPagamento(entradaDaOS(os))).toMatchObject({ forma_pagamento: 'Boleto Parcelado', qtd_parcelas: 2, datas_parcelas: '2026-12-28' });
  });
});
