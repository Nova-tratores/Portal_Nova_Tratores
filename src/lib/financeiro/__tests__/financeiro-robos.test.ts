import { describe, expect, it } from "vitest";
import type { TituloOmie } from "../fases-automaticas";
import {
  diasEntre, etapaCobranca, htmlCobranca, parcelaParaCobranca, parcelasParaLembrete, quandoVence, situacaoDaParcela, type CardEmail,
} from "../emails-vencimento";
import { cardsParados, diasUteisEntre, linhaRobo, linhaSemana, linhasParados, maisRecente, setorDoCard } from "../vigia";
import { conferir, textoConferencia, type CardConf } from "../conferencia";
import { deveMoverAposEnvio } from "../mover-card";

const HOJE = "2026-10-29"; // quinta
const card = (p: Partial<CardEmail>): CardEmail => ({
  id: 1, status: "aguardando_vencimento", forma_pagamento: "Boleto à vista", vencimento_boleto: "2026-11-02",
  nom_cliente: "ADRIANO CORCOVIA", num_nf_peca: "00009404", qtd_parcelas: "1", anexo_boleto: "b.pdf", ...p,
});
const tit = (p: Partial<TituloOmie>): TituloOmie => ({
  conta_omie: "CASTRO", numero_documento_fiscal: "00009404", data_emissao: "2026-10-01",
  status_titulo: "A VENCER", nome_cliente: "ADRIANO CORCOVIA", data_vencimento: "2026-11-02", ...p,
});

describe("lembrete: janela 0–5 dias", () => {
  it("vence daqui a 4 dias → lembra; antes só pegava o dia exato +5", () => {
    expect(parcelasParaLembrete(card({}), HOJE, new Set(), [tit({})])).toEqual([{ n: 1, iso: "2026-11-02", dias: 4 }]);
  });
  it("vence hoje entra; daqui a 6 dias e já vencido não", () => {
    expect(parcelasParaLembrete(card({ vencimento_boleto: HOJE }), HOJE, new Set(), [])).toHaveLength(1);
    expect(parcelasParaLembrete(card({ vencimento_boleto: "2026-11-04" }), HOJE, new Set(), [])).toHaveLength(0);
    expect(parcelasParaLembrete(card({ vencimento_boleto: "2026-10-28" }), HOJE, new Set(), [])).toHaveLength(0);
  });
  it("já lembrado daquele vencimento, com comprovante ou RECEBIDO no Omie: não lembra", () => {
    expect(parcelasParaLembrete(card({}), HOJE, new Set(["2026-11-02"]), [])).toHaveLength(0);
    expect(parcelasParaLembrete(card({ comprovante_pagamento: "c.pdf" }), HOJE, new Set(), [])).toHaveLength(0);
    expect(parcelasParaLembrete(card({}), HOJE, new Set(), [tit({ status_titulo: "RECEBIDO" })])).toHaveLength(0);
  });
  it("parcelado: só a parcela da janela; parcela recebida (pelo vencimento) é pulada", () => {
    const c = card({ qtd_parcelas: "2", vencimento_boleto: "2026-10-30", datas_parcelas: "2026-11-03" });
    const ts = [tit({ data_vencimento: "2026-10-30", status_titulo: "RECEBIDO", numero_parcela: "001/002" }), tit({ data_vencimento: "2026-11-03", numero_parcela: "002/002" })];
    expect(parcelasParaLembrete(c, HOJE, new Set(), ts).map((p) => p.n)).toEqual([2]);
  });
  it("texto do prazo", () => {
    expect(quandoVence(0)).toContain("hoje");
    expect(quandoVence(1)).toContain("amanhã");
    expect(quandoVence(4)).toContain("4 dias");
  });
});

describe("cobrança D+1 / D+7", () => {
  it("etapas", () => {
    expect(etapaCobranca("2026-10-28", HOJE, [])).toBe(1);
    expect(etapaCobranca("2026-10-29", HOJE, [])).toBeNull(); // vence hoje
    expect(etapaCobranca("2026-10-27", HOJE, ["2026-10-28"])).toBeNull(); // D+1 já foi
    expect(etapaCobranca("2026-10-22", HOJE, ["2026-10-23"])).toBe(2);
    expect(etapaCobranca("2026-10-22", HOJE, ["2026-10-23", "2026-10-29"])).toBeNull(); // D+7 já foi
    expect(etapaCobranca("2026-10-10", HOJE, [])).toBeNull(); // velho demais
    expect(diasEntre("2026-10-22", HOJE)).toBe(7);
  });
  it("só cobra título ATRASADO no Omie", () => {
    const c = card({ status: "vencido", vencimento_boleto: "2026-10-28" });
    expect(parcelaParaCobranca(c, HOJE, new Map(), [tit({ data_vencimento: "2026-10-28", status_titulo: "ATRASADO" })])).toMatchObject({ n: 1, etapa: 1 });
    expect(parcelaParaCobranca(c, HOJE, new Map(), [tit({ data_vencimento: "2026-10-28", status_titulo: "RECEBIDO" })])).toBeNull();
    expect(parcelaParaCobranca(c, HOJE, new Map(), [])).toBeNull();
  });
  it("situação da parcela pelo número quando a data não bate", () => {
    const c = card({ qtd_parcelas: "2", vencimento_boleto: "2026-10-20", datas_parcelas: "2026-11-20" });
    expect(situacaoDaParcela(c, [tit({ data_vencimento: "2026-10-21", numero_parcela: "001/002", status_titulo: "ATRASADO" })], [], 1, "2026-10-20")).toBe("atrasado");
  });
  it("texto educado e sem placeholder", () => {
    const h = htmlCobranca({ saudacao: "Bom dia", cliente: "FULANO", etapa: 2, vencBR: "22/10/2026", valor: "R$ 10,00", nf: "P 9404" });
    expect(h).toContain("desconsidere");
    expect(h).toContain("segunda via");
    expect(h).not.toMatch(/undefined|\{/);
  });
});

describe("vigia de card parado", () => {
  it("dias úteis pulam o fim de semana", () => {
    expect(diasUteisEntre("2026-10-23", "2026-10-26")).toBe(1); // sex → seg
    expect(diasUteisEntre("2026-10-27", HOJE)).toBe(2);
  });
  it("limites por fase e setor pelo setor_destino", () => {
    const r = cardsParados([
      { id: 1, status: "gerar_boleto", desde: "2026-10-27T12:00:00Z" },            // 2 d.ú. > 1
      { id: 2, status: "gerar_boleto", desde: "2026-10-28T12:00:00Z" },            // 1 d.ú. — ok
      { id: 3, status: "enviar_cliente", setor_destino: "pecas", desde: "2026-10-23" }, // 4 > 2
      { id: 4, status: "sem_boleto", desde: "2026-10-23" },                        // 4 ≤ 7
      { id: 5, status: "vencido", desde: "2026-10-23" },                           // 4 > 3
      { id: 6, status: "vencido", desde: "2026-10-01", recobravel: false },         // não se recobra
      { id: 7, status: "enviar_cliente", desde: null },                            // sem data
      { id: 8, status: "gerar_boleto", desde: null, venceuSemBoleto: true },        // destaque
    ], HOJE);
    expect(r.porSetor.financeiro.map((i) => i.id).sort()).toEqual([1, 8]);
    expect(r.porSetor.pecas.map((i) => i.id)).toEqual([3]);
    expect(r.porSetor.posvendas.map((i) => i.id)).toEqual([5]);
    expect(r.semData).toBe(1);
    expect(linhasParados(r.porSetor.financeiro)[0]).toMatch(/VENCEU SEM BOLETO GERADO: 1/);
  });
  it("setor, data mais recente, teto e linhas do resumo", () => {
    expect(setorDoCard({ status: "vencido", setor_destino: "oficina" })).toBe("posvendas");
    expect(maisRecente(null, "2026-10-01", "2026-10-20T10:00:00Z")).toBe("2026-10-20T10:00:00Z");
    const muitos = Array.from({ length: 9 }, (_, i) => ({ id: i, status: "vencido", cliente: `C${i}`, diasUteis: 5 }));
    expect(linhasParados(muitos, 6)[0]).toMatch(/e mais 3$/);
    expect(linhaRobo([{ de: "vencido", para: "pago" }, { de: "vencido", para: "pago" }])).toContain("2 vencido→pago");
    expect(linhaSemana([{ conta_omie: "NOVA", valor_documento: 100, status_titulo: "A VENCER" }, { conta_omie: "CASTRO", valor_documento: "50.5", status_titulo: "ATRASADO" }, { conta_omie: "NOVA", valor_documento: 999, status_titulo: "RECEBIDO" }]))
      .toMatch(/150,50/);
  });
});

describe("conferência card × Omie", () => {
  const c = (p: Partial<CardConf>): CardConf => ({ id: 1, status: "aguardando_vencimento", nom_cliente: "ADRIANO CORCOVIA", num_nf_peca: "9404", omie_empresa: "Castro Pecas", valor_servico: "1000", vencimento_boleto: "2026-11-02", ...p });
  const t = (p: Partial<TituloOmie>): TituloOmie => tit({ valor_documento: 1000, ...p });
  it("tudo batendo = nada", () => {
    expect(conferir([c({})], [t({})])).toEqual([]);
  });
  it("título a receber sem card; recebido sem card não conta", () => {
    const a = conferir([c({})], [t({}), t({ numero_documento_fiscal: "9500", nome_cliente: "OUTRO CLIENTE" }), t({ numero_documento_fiscal: "9600", status_titulo: "RECEBIDO" })]);
    expect(a).toEqual([expect.objectContaining({ tipo: "sem_card", nf: "9500" })]);
  });
  it("valor (tolerância R$ 1) e vencimento diferentes", () => {
    expect(conferir([c({ valor_servico: "1000.80" })], [t({})])).toEqual([]);
    const a = conferir([c({ valor_servico: "1100", vencimento_boleto: "2026-11-05" })], [t({})]);
    expect(a.map((x) => x.tipo).sort()).toEqual(["valor", "vencimento"]);
  });
  it("NF em card de cliente e valor diferentes vira 'não casa'; card pago não é conferido", () => {
    const a = conferir([c({ nom_cliente: "RUBENS LIUTTI", valor_servico: "50" })], [t({})]);
    expect(a).toEqual([expect.objectContaining({ tipo: "nao_casa", cardIds: [1] })]);
    expect(conferir([c({ status: "pago", valor_servico: "1100" })], [t({})])).toEqual([]);
  });
  it("texto com teto", () => {
    const achados = conferir([], Array.from({ length: 10 }, (_, i) => t({ numero_documento_fiscal: String(100 + i) })));
    expect(textoConferencia(achados, 3)).toMatch(/A receber no Omie sem card \(10\).*e mais 7/);
  });
});

describe("mover após envio", () => {
  it("só fases pré-envio", () => {
    for (const s of ["gerar_boleto", "validar_pix", "enviar_cliente", "sem_boleto"]) expect(deveMoverAposEnvio(s)).toBe(true);
    for (const s of ["aguardando_vencimento", "vencido", "pago", null]) expect(deveMoverAposEnvio(s)).toBe(false);
  });
});

describe("conferência: venda de máquina fica fora", () => {
  it("Venda de Implementos/Tratores sem card não aparece", () => {
    const t = { ...tit({ numero_documento_fiscal: "8270", nome_cliente: "JOAO" }), descricao_categoria: "Venda de Implementos" };
    expect(conferir([], [t])).toEqual([]);
    expect(conferir([], [{ ...t, descricao_categoria: "10. @Revenda de Peças Balcão" }])).toHaveLength(1);
  });
});
