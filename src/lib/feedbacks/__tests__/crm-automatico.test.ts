import { describe, it, expect } from "vitest";
import {
  parseOS, lerDescricao, tecnicosDaOS, motivoInelegivel, montarLote, janelaCrmAuto, hojeSaoPaulo,
  payloadCrm, limparTelefone, temTagNaoContatar, descricaoAlertaCrm, CRM_AUTO_DIAS_MIN, CRM_AUTO_DIAS_MAX,
  type LinhaOS, type EntradaLote,
} from "../crm-automatico";

const HOJE = "2026-10-23";
const linha = (x: Partial<LinhaOS> = {}): LinhaOS => ({
  num_os: "5395", cod_os: 2547292115, empresa: "Nova Tratores", cod_cli: 2363093832,
  cliente_nome: "RICARDO SWART (FAZENDA SANTA ISABEL)", data_faturamento: "2026-10-18", valor_total: 4147.01,
  faturada: true, cancelada: false, vendedor: "Técnicos: José Antonio de Oliveira // Fernando Leonel", contrato: "",
  descricao: "Modelo: 86110|Chassis: NP7T4KC6EPMA05338|Horimetro: 3077,7||Solicitação do cliente: Troca da luva/tração |Serviço Realizado: desmontar tração para trocar coroa e pinhão",
  ...x,
});
const entrada = (linhas: LinhaOS[], x: Partial<EntradaLote> = {}): EntradaLote => ({
  linhas, hoje: HOJE, naoContatar: new Set(), osRefsExistentes: new Set(), clientesRecentes: new Set(), contatos: new Map(), ...x,
});

describe("leitura da OS", () => {
  it("técnicos, trator e serviço saem da linha do Omie", () => {
    const os = parseOS(linha());
    expect(os).toMatchObject({
      conta: "NOVA", osRef: "NOVA:5395", codCli: "2363093832", faturadoEm: "2026-10-18", valor: 4147.01,
      tecnico: "José Antonio de Oliveira // Fernando Leonel",
      trator: "86110 · Chassi MA05338",
      servico: "desmontar tração para trocar coroa e pinhão",
    });
    expect(parseOS(linha({ empresa: "Castro Pecas", num_os: 12 })).osRef).toBe("CASTRO:12");
  });
  it("sem Serviço Realizado usa a Solicitação; texto longo corta em 300", () => {
    expect(parseOS(linha({ descricao: "Modelo: 5050|Solicitação do cliente: REVISÃO DE 50 HORAS" })).servico).toBe("REVISÃO DE 50 HORAS");
    const longo = parseOS(linha({ descricao: `Serviço Realizado: ${"x".repeat(400)}` })).servico!;
    expect(longo.length).toBe(300);
    expect(longo.endsWith("…")).toBe(true);
  });
  it("texto com '|' dentro continua no mesmo campo; sem dados = null", () => {
    expect(lerDescricao("Serviço Realizado: troca do filtro|e do óleo").realizado).toBe("troca do filtro e do óleo");
    expect(parseOS(linha({ descricao: "", vendedor: "Técnicos: " }))).toMatchObject({ trator: null, servico: null, tecnico: null });
    expect(tecnicosDaOS("Gabriel Moraes")).toBe("Gabriel Moraes");
  });
});

describe("quem entra", () => {
  it("janela D+3 a D+15 no dia de Brasília", () => {
    expect(janelaCrmAuto(HOJE)).toEqual({ de: "2026-10-08", ate: "2026-10-20" });
    expect(CRM_AUTO_DIAS_MIN).toBe(3);
    expect(CRM_AUTO_DIAS_MAX).toBe(15);
    expect(hojeSaoPaulo(new Date("2026-10-24T02:30:00Z"))).toBe("2026-10-23");
    expect(motivoInelegivel(parseOS(linha({ data_faturamento: "2026-10-21" })), HOJE)).toBe("cedo");
    expect(motivoInelegivel(parseOS(linha({ data_faturamento: "2026-10-20" })), HOJE)).toBeNull();
    expect(motivoInelegivel(parseOS(linha({ data_faturamento: "2026-10-08" })), HOJE)).toBeNull();
    expect(motivoInelegivel(parseOS(linha({ data_faturamento: "2026-10-07" })), HOJE)).toBe("tarde");
  });
  it("cancelada, sem valor, cortesia/interno, não faturada ficam fora", () => {
    const m = (x: Partial<LinhaOS>) => motivoInelegivel(parseOS(linha(x)), HOJE);
    expect(m({ cancelada: true })).toBe("cancelada");
    expect(m({ faturada: false })).toBe("nao_faturada");
    expect(m({ valor_total: 0.01 })).toBe("valor_baixo");
    expect(m({ contrato: "Cortesia Comercial" })).toBe("contrato_cortesia_interno");
    expect(m({ contrato: "Interno" })).toBe("contrato_cortesia_interno");
    expect(m({ contrato: "Mahindra-pgo" })).toBeNull();
    expect(m({ cod_cli: null })).toBe("sem_cliente");
  });
});

describe("lote do dia", () => {
  it("monta o payload já preenchido com o contato do cadastro", () => {
    const r = montarLote(entrada([linha()], { contatos: new Map([["NOVA:2363093832", { telefone: "() 14998001122", email: " a@b.com " }]]) }));
    expect(r.candidatas).toBe(1);
    expect(r.payloads).toHaveLength(1);
    expect(r.payloads[0]).toMatchObject({
      tipo: "crm", nome: "RICARDO SWART (FAZENDA SANTA ISABEL)", codigo_omie: "2363093832", telefone: "14998001122", email: "a@b.com",
      data_servico: "2026-10-18", faturado_em: "2026-10-18", status_atendimento: "aberto", atendente_id: null, aberto_em: null,
      origem_dados: "Omie NOVA", os_ref: "NOVA:5395", os_valor: 4147.01, origem_auto: "os_faturada", tentativas: [],
    });
  });
  it("pula OS já no CRM, cliente 'Não contatar' e cliente ligado nos últimos 30 dias", () => {
    const r = montarLote(entrada(
      [linha(), linha({ num_os: "2", cod_cli: 2 }), linha({ num_os: "3", cod_cli: 3, cliente_nome: "FULANO" }), linha({ num_os: "4", cod_cli: 4 })],
      { osRefsExistentes: new Set(["NOVA:5395"]), clientesRecentes: new Set(["2"]), naoContatar: new Set(["omie_3"]) },
    ));
    expect(r.payloads.map((p) => p.os_ref)).toEqual(["NOVA:4"]);
    expect(r.puladas).toEqual({ os_ja_no_crm: 1, cliente_ligado_30d: 1, nao_contatar: 1 });
  });
  it("uma ligação por cliente: fica a OS mais recente; OS repetida conta uma vez", () => {
    const r = montarLote(entrada([
      linha({ num_os: "10", data_faturamento: "2026-10-10", valor_total: 9000 }),
      linha({ num_os: "11", data_faturamento: "2026-10-19", valor_total: 300 }),
      linha({ num_os: "11", data_faturamento: "2026-10-19", valor_total: 300 }),
      linha({ num_os: "12", cancelada: true }),
    ]));
    expect(r.payloads.map((p) => p.os_ref)).toEqual(["NOVA:11"]);
    expect(r.puladas).toEqual({ os_repetida: 1, mesmo_cliente_no_lote: 1, cancelada: 1 });
  });
});

describe("ajudantes", () => {
  it("telefone, tags e texto do alerta", () => {
    expect(limparTelefone("() ")).toBeNull();
    expect(limparTelefone("(14) 3351-6049")).toBe("(14) 3351-6049");
    expect(temTagNaoContatar(["Ouro", "Não contatar"])).toBe(true);
    expect(temTagNaoContatar('["Não contatar"]')).toBe(true);
    expect(temTagNaoContatar(null)).toBe(false);
    expect(payloadCrm(parseOS(linha({ cliente_nome: "" })), null).nome).toBe("Cliente 2363093832");
    expect(descricaoAlertaCrm({ nota: 4, status_cliente: "Insatisfeito", tecnico: "Gabriel", feedback: "demorou" }))
      .toBe("Nota 4 · Insatisfeito · Técnico: Gabriel — “demorou”");
    expect(descricaoAlertaCrm({ nota: null, status_cliente: "Insatisfeito", tecnico: null, feedback: "x".repeat(300) }).length).toBe(200);
  });
});
