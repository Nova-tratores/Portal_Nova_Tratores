import { describe, expect, it } from "vitest";
import { DIAS_SEM_RECOBRANCA, podeRecobrar, decidirFase, mesmoCliente, nfsDoCard, situacaoOmie, somaDias, titulosDoCard, valorProprio, type CardFase, type TituloOmie } from "../fases-automaticas";

const HOJE = "2026-10-29";
const card = (p: Partial<CardFase>): CardFase => ({
  id: 1, status: "aguardando_vencimento", forma_pagamento: "Boleto à vista", vencimento_boleto: "2026-10-20",
  nom_cliente: "ADRIANO CORCOVIA", num_nf_peca: "00009404", ...p,
});
const tit = (p: Partial<TituloOmie>): TituloOmie => ({
  conta_omie: "CASTRO", numero_documento_fiscal: "00009404", data_emissao: "2026-09-28",
  status_titulo: "RECEBIDO", nome_cliente: "ADRIANO CORCOVIA", ...p,
});

describe("nfsDoCard / mesmoCliente", () => {
  it("tira zeros e junta peça e serviço", () => {
    expect(nfsDoCard(card({ num_nf_peca: "00007202", num_nf_servico: "1832" }))).toEqual(["7202", "1832"]);
  });
  it("cliente: 1ª palavra + 2 em comum; ignora parênteses e LTDA", () => {
    expect(mesmoCliente("JOSE TARCISO FAULIN ( fazenda X )", "JOSE TARCISO FAULIN")).toBe(true);
    expect(mesmoCliente("ROSAN ANTONIO AIELLO", "RUBENS FRANCISCO LIUTTI")).toBe(false);
    expect(mesmoCliente("REYNALDO", "REYNALDO")).toBe(true);
  });
});

describe("situacaoOmie", () => {
  it("mesma NF de OUTRO cliente não conta (número repete entre Nova e Castro)", () => {
    expect(situacaoOmie(card({}), [tit({ nome_cliente: "RUBENS FRANCISCO LIUTTI" })])).toBe("sem_titulo");
  });
  it("título de 2 anos antes não conta", () => {
    expect(situacaoOmie(card({}), [tit({ data_emissao: "2024-07-23" })])).toBe("sem_titulo");
  });
  it("cancelado é ignorado; parcela atrasada vence o recebido", () => {
    expect(situacaoOmie(card({}), [tit({}), tit({ status_titulo: "CANCELADO" })])).toBe("recebido");
    expect(situacaoOmie(card({}), [tit({}), tit({ status_titulo: "ATRASADO", numero_parcela: "002/002" })])).toBe("atrasado");
  });
});

describe("decidirFase", () => {
  it("recebido no Omie → Pago, inclusive saindo de Vencido", () => {
    expect(decidirFase(card({ status: "vencido" }), [tit({})], HOJE)?.para).toBe("pago");
    expect(decidirFase(card({ status: "gerar_boleto" }), [tit({})], HOJE)?.para).toBe("pago");
  });
  it("Vencido sem confirmação do Omie fica onde está", () => {
    expect(decidirFase(card({ status: "vencido" }), [tit({ status_titulo: "ATRASADO" })], HOJE)).toBeNull();
  });
  it("Boleto 30 Dias (D maiúsculo) sem título vai para Pago, não Vencido", () => {
    expect(decidirFase(card({ forma_pagamento: "Boleto 30 Dias" }), [], HOJE)?.para).toBe("pago");
  });
  it("Boleto 30 dias ATRASADO no Omie vai para Vencido", () => {
    expect(decidirFase(card({ forma_pagamento: "Boleto 30 dias" }), [tit({ status_titulo: "ATRASADO" })], HOJE)?.para).toBe("vencido");
  });
  it("título ainda A VENCER no Omie: espera", () => {
    expect(decidirFase(card({}), [tit({ status_titulo: "A VENCER" })], HOJE)).toBeNull();
  });
  it("gerar boleto vencido sem pagamento FICA em Gerar boleto (José, 29/10)", () => {
    expect(decidirFase(card({ status: "gerar_boleto" }), [], HOJE)).toBeNull();
    expect(decidirFase(card({ status: "gerar_boleto" }), [tit({ status_titulo: "ATRASADO" })], HOJE)).toBeNull();
  });
  it("PIX/cartão/cheque, parcelado, com comprovante e não vencido não vão para Vencido", () => {
    expect(decidirFase(card({ forma_pagamento: "Pix" }), [], HOJE)).toBeNull();
    expect(decidirFase(card({ forma_pagamento: "Boleto Parcelado" }), [], HOJE)).toBeNull();
    expect(decidirFase(card({ comprovante_pagamento: "x.pdf" }), [], HOJE)).toBeNull();
    expect(decidirFase(card({ vencimento_boleto: "2026-10-29" }), [], HOJE)).toBeNull();
  });
  it("filho de grupo segue o pai", () => {
    expect(decidirFase(card({ grupo_pai_id: 9 }), [tit({})], HOJE)).toBeNull();
  });
  it("grupo: pai recebido com filho ainda atrasado NÃO vai para Pago", () => {
    const filho = card({ id: 2, grupo_pai_id: 1, num_nf_peca: "9500" });
    const atrasado = tit({ numero_documento_fiscal: "00009500", status_titulo: "ATRASADO" });
    expect(decidirFase(card({ status: "vencido" }), [tit({}), atrasado], HOJE, [filho])).toBeNull();
    expect(decidirFase(card({ status: "vencido" }), [tit({}), tit({ numero_documento_fiscal: "00009500" })], HOJE, [filho])?.para).toBe("pago");
  });
  it("Enviar ao cliente e Sem boleto: só saem se o Omie confirmar o pagamento", () => {
    expect(decidirFase(card({ status: "enviar_cliente" }), [tit({})], HOJE)?.para).toBe("pago");
    expect(decidirFase(card({ status: "sem_boleto" }), [], HOJE)).toBeNull();
  });
  it("nota da outra empresa com o mesmo número não conta", () => {
    expect(situacaoOmie(card({ omie_empresa: "Nova Tratores" }), [tit({ conta_omie: "CASTRO" })])).toBe("sem_titulo");
    expect(situacaoOmie(card({ omie_empresa: "Castro Pecas" }), [tit({ conta_omie: "CASTRO" })])).toBe("recebido");
  });
});

describe("pago → concluído (29/10)", () => {
  const pago = (p: Partial<CardFase>) => card({ status: "pago", status_changed_at: "2026-10-20T15:00:00Z", ...p });
  it("pago há 7+ dias e recebido no Omie → concluído", () => {
    const m = decidirFase(pago({}), [tit({})], HOJE);
    expect(m?.para).toBe("concluido");
    expect(m?.tarefa).toBe("Pagamento concluído");
  });
  it("sem status_changed_at não conclui", () => {
    expect(decidirFase(pago({ status_changed_at: null }), [tit({})], HOJE)).toBeNull();
  });
  it("pago há menos de 7 dias não conclui", () => {
    expect(decidirFase(pago({ status_changed_at: "2026-10-25T12:00:00Z" }), [tit({})], HOJE)).toBeNull();
    // exatamente 7 dias (22/10 em Brasília) conclui
    expect(decidirFase(pago({ status_changed_at: "2026-10-22T12:00:00Z" }), [tit({})], HOJE)?.para).toBe("concluido");
  });
  it("pago com título ainda a vencer/atrasado ou sem título no Omie não conclui", () => {
    expect(decidirFase(pago({}), [tit({ status_titulo: "A VENCER" })], HOJE)).toBeNull();
    expect(decidirFase(pago({}), [], HOJE)).toBeNull();
  });
  it("somaDias atravessa mês", () => {
    expect(somaDias("2026-11-03", -7)).toBe("2026-10-27");
  });
});

describe("nome diferente no Omie: vale pela soma do valor (29/10)", () => {
  const casos: [string, string, number, number][] = [
    ["OLINTO BOM RETIRO", "OLINTO RODRIGUES DE ARRUDA E OUTRO ( FAZ BOM RETIRO )", 2155, 1208.8],
    ["JAPY GOLF & HOTEL LTDA", "HOTEL RESORT OLINTO", 1789, 1680],
    ["MUNICIPIO DE PIRAJU", "PIRAJU GABINETE PREFEITO", 7370, 2400],
  ];
  for (const [nome, nomeOmie, v1, v2] of casos) {
    it(`${nome} × ${nomeOmie}`, () => {
      expect(mesmoCliente(nome, nomeOmie)).toBe(false);
      const c = card({ status: "vencido", nom_cliente: nome, omie_empresa: "Nova Tratores", num_nf_peca: "00001001", num_nf_servico: "2002",
        valor_servico: String(Math.round((v1 + v2) * 100) / 100) });
      const ts = [
        tit({ conta_omie: "NOVA", numero_documento_fiscal: "00001001", nome_cliente: nomeOmie, valor_documento: v1 }),
        tit({ conta_omie: "NOVA", numero_documento_fiscal: "2002", nome_cliente: nomeOmie, valor_documento: v2 }),
      ];
      expect(situacaoOmie(c, ts)).toBe("recebido");
      expect(decidirFase(c, ts, HOJE)?.para).toBe("pago");
    });
  }
  it("valor diferente (> R$ 1) com outro nome não casa", () => {
    const c = card({ nom_cliente: "JAPY GOLF & HOTEL LTDA", valor_servico: "3500" });
    expect(titulosDoCard(c, [tit({ nome_cliente: "HOTEL RESORT OLINTO", valor_documento: 3469 })])).toEqual([]);
  });
  it("valor em formato BR e tolerância de R$ 1", () => {
    const c = card({ nom_cliente: "JAPY GOLF & HOTEL LTDA", valor_servico: "3.469,90" });
    expect(titulosDoCard(c, [tit({ nome_cliente: "HOTEL RESORT OLINTO", valor_documento: 3469 })])).toHaveLength(1);
  });
  it("valor próprio: filho usa grupo_valor_original, pai desconta os filhos", () => {
    const filho = card({ id: 2, grupo_pai_id: 1, valor_servico: "0", grupo_valor_original: "400" });
    expect(valorProprio(filho)).toBe(400);
    expect(valorProprio(card({ valor_servico: "1000" }), [filho])).toBe(600);
  });
});

describe("parcelado em Vencido sem parcela atrasada no Omie (29/10)", () => {
  const parc = (p: Partial<CardFase>) => card({ status: "vencido", forma_pagamento: "Boleto Parcelado", qtd_parcelas: "3", ...p });
  const ts = [tit({ numero_parcela: "001/003" }), tit({ numero_parcela: "002/003", status_titulo: "A VENCER" }), tit({ numero_parcela: "003/003", status_titulo: "A VENCER" })];
  it("volta para Aguardando cliente (sem dar parcela como paga)", () => {
    const m = decidirFase(parc({}), ts, HOJE);
    expect(m?.para).toBe("aguardando_vencimento");
    expect(m?.tarefa).toBe("Aguardando Cliente");
    expect(m?.motivo).toBe("Parcelas vencidas pagas no Omie");
  });
  it("com parcela ATRASADA continua em Vencido", () => {
    expect(decidirFase(parc({}), [...ts.slice(0, 2), tit({ numero_parcela: "003/003", status_titulo: "ATRASADO" })], HOJE)).toBeNull();
  });
  it("à vista em Vencido com título a vencer fica; vencido sem boleto fica", () => {
    expect(decidirFase(card({ status: "vencido" }), [tit({ status_titulo: "A VENCER" })], HOJE)).toBeNull();
    expect(decidirFase(parc({ tarefa: "Cobrar Cliente (Vencido sem boleto)" }), ts, HOJE)).toBeNull();
  });
  it("de volta em Aguardando, não volta a Vencido enquanto o Omie não atrasar", () => {
    expect(decidirFase(parc({ status: "aguardando_vencimento" }), ts, HOJE)).toBeNull();
  });
});

describe("recobrança: Pix, antigo e sem boleto (José, 29/10)", () => {
  it("Pix/cartão/cheque em Vencido sem Omie recebido → volta para Aguardando", () => {
    for (const f of ["Pix", "Cartão de crédito", "Cheque"]) {
      const m = decidirFase(card({ status: "vencido", forma_pagamento: f }), [tit({ status_titulo: "ATRASADO" })], HOJE);
      expect(m?.para).toBe("aguardando_vencimento");
      expect(m?.motivo).toBe("Pix/cartão não vence");
    }
    expect(decidirFase(card({ status: "vencido", forma_pagamento: "Pix" }), [tit({})], HOJE)?.para).toBe("pago");
  });
  it("Vencido há mais de 180 dias e não recebido → tarefa Antigo no Financeiro, continua Vencido", () => {
    const velho = card({ status: "vencido", vencimento_boleto: "2026-04-01", tarefa: "Cobrar Cliente (Vencido)" });
    const m = decidirFase(velho, [], HOJE);
    expect(m?.de).toBe("vencido");
    expect(m?.para).toBe("vencido");
    expect(m?.setor).toBe("Financeiro");
    expect(m?.tarefa).toBe("Antigo (mais de 6 meses) — sem recobrança");
    // já marcado não repete
    expect(decidirFase({ ...velho, tarefa: m!.tarefa }, [], HOJE)).toBeNull();
    // 180 dias certinhos ainda não é antigo
    expect(decidirFase(card({ status: "vencido", vencimento_boleto: "2026-05-02" }), [], HOJE)).toBeNull();
  });
  it("podeRecobrar", () => {
    const ok = card({ status: "vencido", anexo_boleto: "https://x/b.pdf", vencimento_boleto: "2026-10-01" });
    expect(podeRecobrar(ok, HOJE)).toEqual({ ok: true });
    expect(podeRecobrar({ ...ok, anexo_boleto: null }, HOJE).ok).toBe(false);
    expect(podeRecobrar({ ...ok, anexo_boleto: null, anexo_boleto2: "x.pdf" }, HOJE).ok).toBe(true);
    expect(podeRecobrar({ ...ok, tarefa: "Cobrar Cliente (Vencido sem boleto)" }, HOJE).motivo).toBe("Sem boleto gerado");
    expect(podeRecobrar({ ...ok, forma_pagamento: "PIX" }, HOJE).ok).toBe(false);
    expect(podeRecobrar({ ...ok, vencimento_boleto: "2026-03-01" }, HOJE).motivo).toMatch(/Antigo/);
    expect(DIAS_SEM_RECOBRANCA).toBe(180);
  });
});
