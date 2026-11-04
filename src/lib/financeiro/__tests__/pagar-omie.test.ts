import { describe, expect, it } from "vitest";
import { candidatosDoCard, decidirPagar, type CardPagar, type TituloPagar } from "../pagar-omie";

const card = (p: Partial<CardPagar>): CardPagar => ({ id: 1, status: "aguardando_omie", fornecedor: "DUTY PAPELARIA", valor: 218.32, data_vencimento: "2026-04-25", ...p });
const tit = (p: Partial<TituloPagar>): TituloPagar => ({ codigo_lancamento: 111, nome_fornecedor: "DUTY PAPELARIA LTDA", valor_documento: 218.32, data_vencimento: "2026-04-23", data_pagamento: "2026-04-23", status_titulo: "PAGO", ...p });

describe("candidatosDoCard", () => {
  it("fornecedor + valor ± 0,50 + vencimento ± 20 dias", () => {
    expect(candidatosDoCard(card({}), [tit({})])).toHaveLength(1);
    expect(candidatosDoCard(card({}), [tit({ valor_documento: 219 })])).toHaveLength(0);
    expect(candidatosDoCard(card({}), [tit({ data_vencimento: "2026-06-01" })])).toHaveLength(0);
    expect(candidatosDoCard(card({}), [tit({ nome_fornecedor: "KADU FERRAMENTAS" })])).toHaveLength(0);
  });
});

describe("decidirPagar", () => {
  it("com código: PAGO no Omie → concluir; A VENCER → nada; fora do espelho → nada", () => {
    const m = new Map([["9", tit({ codigo_lancamento: 9 })]]);
    expect(decidirPagar(card({ omie_cod_lancamento: "9", status: "financeiro" }), m, [])).toMatchObject({ tipo: "concluir", vinculou: false });
    expect(decidirPagar(card({ omie_cod_lancamento: "9" }), new Map([["9", tit({ status_titulo: "A VENCER" })]]), [])).toBeNull();
    expect(decidirPagar(card({ omie_cod_lancamento: "8" }), m, [])).toBeNull();
  });
  it("sem código: um só candidato pago → conclui e liga; dois candidatos → não chuta", () => {
    expect(decidirPagar(card({}), new Map(), [tit({})])).toMatchObject({ tipo: "concluir", vinculou: true, codigo: "111" });
    expect(decidirPagar(card({}), new Map(), [tit({}), tit({ codigo_lancamento: 112 })])).toBeNull();
  });
  it("sem código e ainda a vencer → só liga; cancelado → só avisa", () => {
    expect(decidirPagar(card({}), new Map(), [tit({ status_titulo: "A VENCER", data_pagamento: null })])).toMatchObject({ tipo: "vincular" });
    expect(decidirPagar(card({}), new Map(), [tit({ status_titulo: "CANCELADO" })])).toMatchObject({ tipo: "cancelado" });
  });
  it("card concluído não é olhado", () => {
    expect(decidirPagar(card({ status: "concluido" }), new Map(), [tit({})])).toBeNull();
  });
});
