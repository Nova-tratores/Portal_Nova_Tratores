import { describe, it, expect } from "vitest";
import {
  historicoDaPessoa,
  segundaDaSemana, diasDaSemana, normalizarSemana, diaDaSemana, somarDias, diasEntre,
  situacaoDoTitulo, montarItem, somarTotais, montarAgenda, ligarCards, hrefDoCard,
  normalizarConta, normalizarTipo, type TituloAgenda,
} from "../agenda";

const t = (p: Partial<TituloAgenda>): TituloAgenda => ({
  id: 1, conta_omie: "NOVA", data_vencimento: "2026-10-29", status_titulo: "A VENCER",
  valor_documento: 100, valor_pago: 0, nome_cliente: "FULANO DE TAL", numero_documento_fiscal: "00008340",
  numero_parcela: "001/001", ...p,
});

describe("semana", () => {
  it("segunda da semana (quinta 29/10/2026 → 26/10; domingo 01/11 → 26/10)", () => {
    expect(segundaDaSemana("2026-10-29")).toBe("2026-10-26");
    expect(segundaDaSemana("2026-11-01")).toBe("2026-10-26");
    expect(segundaDaSemana("2026-10-26")).toBe("2026-10-26");
    expect(diaDaSemana("2026-11-01")).toBe(6);
  });
  it("7 dias, virando o mês e o ano", () => {
    expect(diasDaSemana("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(diasDaSemana("2026-12-28")[6]).toBe("2027-01-03");
  });
  it("parâmetro inválido cai na semana de hoje", () => {
    expect(normalizarSemana("2026-11-04", "2026-10-29")).toBe("2026-11-02");
    expect(normalizarSemana("lixo", "2026-10-29")).toBe("2026-10-26");
    expect(normalizarSemana("2026-02-31", "2026-10-29")).toBe("2026-10-26");
    expect(normalizarSemana(undefined, "2026-10-29")).toBe("2026-10-26");
  });
  it("conta dias sem fuso (horário de verão não atrapalha)", () => {
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(diasEntre("2026-10-20", "2026-10-29")).toBe(9);
  });
  it("filtros", () => {
    expect(normalizarConta("castro")).toBe("CASTRO");
    expect(normalizarConta("x")).toBe("todas");
    expect(normalizarTipo("PAGAR")).toBe("pagar");
    expect(normalizarTipo(null)).toBe("ambos");
  });
});

describe("situação", () => {
  const hoje = "2026-10-29";
  it("pago pela data de pagamento ou pelo status", () => {
    expect(situacaoDoTitulo(t({ data_pagamento: "2026-10-28", status_titulo: "ATRASADO" }), hoje)).toBe("pago");
    expect(situacaoDoTitulo(t({ status_titulo: "PAGO" }), hoje)).toBe("pago");
  });
  it("cancelado fica fora", () => {
    expect(situacaoDoTitulo(t({ status_titulo: "CANCELADO" }), hoje)).toBeNull();
  });
  it("pelo dia de Brasília, não pelo status velho do Omie", () => {
    // Omie ainda dizia "VENCE HOJE" num título de ontem
    expect(situacaoDoTitulo(t({ data_vencimento: "2026-10-28", data_previsao: "2026-10-28", status_titulo: "VENCE HOJE" }), hoje)).toBe("atrasado");
    expect(situacaoDoTitulo(t({ data_vencimento: "2026-10-29" }), hoje)).toBe("hoje");
    expect(situacaoDoTitulo(t({ data_vencimento: "2026-10-30" }), hoje)).toBe("a_vencer");
  });
  it("previsão manda no prazo (igual ao Omie)", () => {
    expect(situacaoDoTitulo(t({ data_vencimento: "2026-10-02", data_previsao: "2026-11-03" }), hoje)).toBe("a_vencer");
    expect(situacaoDoTitulo(t({ data_vencimento: "2026-11-20", data_previsao: "2026-10-20" }), hoje)).toBe("atrasado");
  });
});

describe("item e totais", () => {
  const hoje = "2026-10-29";
  it("monta a linha: NF sem zeros, previsão só se diferente, dias de atraso", () => {
    const i = montarItem(t({ data_vencimento: "2026-10-27", data_previsao: "2026-10-27" }), "receber", hoje)!;
    expect(i.nf).toBe("8340");
    expect(i.previsao).toBeNull();
    expect(i.situacao).toBe("atrasado");
    expect(i.diasAtraso).toBe(2);
    expect(i.valorAberto).toBe(100);
    const j = montarItem(t({ data_vencimento: "2026-10-31", data_previsao: "2026-11-03" }), "receber", hoje)!;
    expect(j.previsao).toBe("2026-11-03");
  });
  it("pagar usa o fornecedor", () => {
    const i = montarItem(t({ nome_cliente: null, nome_fornecedor: "REALMAQ" }), "pagar", hoje)!;
    expect(i.nome).toBe("REALMAQ");
    expect(i.chave).toBe("pagar-1");
  });
  it("totais separam pago, atraso e em aberto", () => {
    const itens = [
      montarItem(t({ id: 1, valor_documento: 100, status_titulo: "RECEBIDO", valor_pago: 100, data_pagamento: "2026-10-27" }), "receber", hoje)!,
      montarItem(t({ id: 2, valor_documento: 200, data_vencimento: "2026-10-27" }), "receber", hoje)!,
      montarItem(t({ id: 3, valor_documento: 300.1 }), "receber", hoje)!,
      montarItem(t({ id: 4, valor_documento: "50", data_vencimento: "2026-10-30" }), "pagar", hoje)!,
    ];
    const s = somarTotais(itens);
    expect(s.receber).toMatchObject({ total: 600.1, pago: 100, atraso: 200, aberto: 300.1, qtd: 3, qtdAtraso: 1 });
    expect(s.pagar).toMatchObject({ total: 50, aberto: 50, pago: 0 });
  });
});

describe("montarAgenda", () => {
  it("põe cada título no dia do vencimento e separa os atrasados de antes", () => {
    const a = montarAgenda({
      semana: "2026-10-26", hoje: "2026-10-29",
      receber: [t({ id: 1, data_vencimento: "2026-10-26" }), t({ id: 2, data_vencimento: "2026-11-01" }), t({ id: 9, status_titulo: "CANCELADO" })],
      pagar: [t({ id: 3, data_vencimento: "2026-10-29" })],
      anterioresReceber: [t({ id: 5, data_vencimento: "2026-09-10" }), t({ id: 6, data_vencimento: "2026-09-10", data_previsao: "2026-11-30" })],
    });
    expect(a.dias).toHaveLength(7);
    expect(a.dias[0].itens.map((i) => i.id)).toEqual([1]);
    expect(a.dias[0].itens[0].situacao).toBe("atrasado");
    expect(a.dias[3].itens[0].tipo).toBe("pagar");
    expect(a.dias[6].itens[0].situacao).toBe("a_vencer");
    expect(a.totais.receber.qtd).toBe(2);
    // o renegociado (previsão 30/11) não está atrasado
    expect(a.atrasadosAnteriores.itens.map((i) => i.id)).toEqual([5]);
    expect(a.atrasadosAnteriores.totais.receber.atraso).toBe(100);
  });
});

describe("ligarCards", () => {
  const tit = (p: Partial<TituloAgenda>) => ({ ...t(p), status_titulo: p.status_titulo ?? "A VENCER", conta_omie: p.conta_omie ?? "NOVA", numero_documento_fiscal: p.numero_documento_fiscal ?? "00008340", data_emissao: "2026-10-01" });
  it("liga pelo nº da NF + empresa + cliente; filho aponta para o pai", () => {
    const titulos = [tit({ id: 10 }), tit({ id: 11, conta_omie: "CASTRO" }), tit({ id: 12, numero_documento_fiscal: "00009000", nome_cliente: "BELTRANO SILVA" })];
    const cards = [
      { id: 7, status: "aguardando_vencimento", setor_destino: "oficina", omie_empresa: "Nova Tratores", num_nf_peca: "00008340", nom_cliente: "FULANO DE TAL", vencimento_boleto: "2026-10-29" },
      { id: 8, status: "aguardando_vencimento", setor_destino: "pecas", omie_empresa: "Nova Tratores", num_nf_peca: "9000", nom_cliente: "BELTRANO SILVA", vencimento_boleto: "2026-10-29", grupo_pai_id: 7 },
    ];
    const m = ligarCards(titulos, cards);
    expect(m.get("receber-10")?.href).toBe("/financeiro/kanban?id=7");
    expect(m.has("receber-11")).toBe(false); // mesma NF na Castro não é deste card
    expect(m.get("receber-12")?.id).toBe(7);
  });
  it("kanban certo pelo setor", () => {
    expect(hrefDoCard(3, "pecas")).toBe("/financeiro/kanban-pecas?id=3");
    expect(hrefDoCard(3, "oficina")).toBe("/financeiro/kanban?id=3");
  });
});

describe("historicoDaPessoa", () => {
  const hoje = "2026-10-30";
  const t = (id: number, extra: Partial<TituloAgenda>): TituloAgenda => ({ id, conta_omie: "NOVA", data_vencimento: "2026-10-10", valor_documento: 100, status_titulo: "A VENCER", ...extra });

  it("soma aberto e atraso, mede como paga e tira o título aberto das listas", () => {
    const h = historicoDaPessoa([
      t(1, { data_vencimento: "2026-10-01" }), // atrasado
      t(2, { data_vencimento: "2026-11-20", valor_documento: 50 }), // a vencer
      t(3, { data_vencimento: "2026-09-01", data_pagamento: "2026-09-05", status_titulo: "RECEBIDO" }), // 4 dias depois
      t(4, { data_vencimento: "2026-08-10", data_pagamento: "2026-08-08", status_titulo: "RECEBIDO" }), // 2 dias antes
      t(5, { data_vencimento: "2024-01-10", data_pagamento: "2024-01-10", status_titulo: "RECEBIDO" }), // fora dos 12 meses
      t(6, { status_titulo: "CANCELADO" }),
    ], "receber", hoje, "receber-1");
    expect(h.totalAberto).toBe(150);
    expect(h.qtdAberto).toBe(2);
    expect(h.totalAtraso).toBe(100);
    expect(h.qtdPago12m).toBe(2);
    expect(h.totalPago12m).toBe(200);
    expect(h.mediaDiasPagamento).toBe(1);
    expect(h.outrosAbertos.map((i) => i.id)).toEqual([2]);
    expect(h.ultimosPagos.map((i) => i.id)).toEqual([3, 4]);
  });

  it("sem pagamento no período a média fica vazia", () => {
    expect(historicoDaPessoa([t(1, {})], "pagar", hoje, "pagar-1").mediaDiasPagamento).toBeNull();
  });
});
