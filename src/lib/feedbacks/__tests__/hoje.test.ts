import { describe, it, expect } from "vitest";
import {
  montarClientes, cotaDoDia, planoDesfecho, pontuar, motivoDaOportunidade, motivoDoRegistro, motivoDaRevisao, contadores, feitosHoje, distribuicao,
  TETO_BONUS, PENALIDADE_SEM_TELEFONE, estadoRevisaoCliente, separarPorRevisao, type Motivo,
} from "../hoje";
import { contatoVazio, preverRevisao, avaliarRevisao, type TratorRevisao } from "../previsao-revisao";
import type { FeedbackRegistro, Oportunidade } from "../types";

const AGORA = Date.parse("2026-10-23T12:00:00-03:00");
const DIA = 86_400_000;
const atras = (n: number) => new Date(AGORA - n * DIA).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const frente = (n: number) => new Date(AGORA + n * DIA).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const reg = (x: Partial<FeedbackRegistro> & Record<string, unknown> = {}): FeedbackRegistro => ({
  id: 1, tipo: "crm", nome: "JOAO DA SILVA (FAZENDA X)", telefone: "(14) 99812-3344", email: null, trator: "6075", tecnico: "Gabriel Moraes",
  codigo_omie: "10", data_contato: null, servico: "Revisão", data_servico: atras(5), status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null,
  ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [],
  atendente_id: null, atendente_nome: null, aberto_em: null, concluido_em: null, status_atendimento: "aberto", arquivado_motivo: null, origem_dados: null,
  criado_em: atras(5), atualizado_em: atras(5), ...x,
} as FeedbackRegistro);

let opId = 100;
const op = (regra: Oportunidade["regra"], x: Partial<Oportunidade> = {}): Oportunidade => ({
  id: opId++, regra, codigo_omie: "10", cliente_nome: "JOAO DA SILVA", trator: null, chassis: null, detalhes: {}, prioridade: "Normal", status: "aberta",
  atendida_por: null, atendida_em: null, feedback_id: null, dispensada_motivo: null, computado_em: atras(0), ...x,
});

function revisao(x: { cliente?: string; codigo?: string | null; entregaDias: number; leit: [number, number, number?][] }) {
  const t: TratorRevisao = {
    id: "77", modelo: "6075", chassi: "MDI0001", cliente: x.cliente ?? "JOAO DA SILVA", cidade: "PIRAJU", vendedor: null, telefone: "(14) 99812-3344", codigo_omie: x.codigo ?? null,
    previsao: preverRevisao({ entrega: atras(x.entregaDias), pontos: x.leit.map(([d, h, r]) => ({ data: atras(d), horas: h, fonte: "revisao" as const, revisao: r ?? null, rotulo: "r" })), revisoesFeitas: x.leit.map((l) => l[2]).filter((r): r is number => !!r) }, AGORA),
  };
  return avaliarRevisao(t, contatoVazio(t.id), AGORA);
}

describe("motivos de cada fonte", () => {
  it("pós-serviço na janela de 3–7 dias pesa cheio; R5 e R6 pesam pouco e nunca são urgentes", () => {
    const pos = motivoDoRegistro(reg({ os_ref: "NOVA:5395" } as never), AGORA)!;
    expect(pos.selo).toBe("Pós-serviço da OS 5395");
    expect(pos.pontos).toBeGreaterThanOrEqual(100);
    const r5 = motivoDaOportunidade(op("R5_pecas", { prioridade: "Urgente", detalhes: { meses_sem_pedido: 13 } }), AGORA)!;
    expect(r5.selo).toBe("Peças: 13 meses sem comprar");
    expect(r5.pontos).toBeLessThanOrEqual(25);
    expect(r5.urgente).toBe(false);
    const r6 = motivoDaOportunidade(op("R6_fora_garantia", { detalhes: { tipo: "Implemento" } }), AGORA)!;
    expect(r6.pontos).toBe(10);
    expect(pos.pontos).toBeGreaterThan(r5.pontos * 4);
  });
  it("cliente insatisfeito é urgente; serviço de ontem espera", () => {
    expect(motivoDoRegistro(reg({ status_cliente: "Insatisfeito" }), AGORA)!.urgente).toBe(true);
    const ontem = motivoDoRegistro(reg({ data_servico: atras(1) }), AGORA)!;
    expect(ontem.acao).toBe("aguardar");
    expect(ontem.pontos).toBe(0);
  });
  it("concluído e arquivado não viram motivo; oportunidade atendida também não", () => {
    expect(motivoDoRegistro(reg({ status_atendimento: "concluido" }), AGORA)).toBeNull();
    expect(motivoDaOportunidade(op("R1_revisao", { status: "atendida" }), AGORA)).toBeNull();
  });
  it("retorno combinado que chegou soma +70 e muda o selo; vencido há 2+ dias é urgente", () => {
    const base = motivoDoRegistro(reg({ tipo: "rfm", data_servico: null, ultimo_servico: atras(300), prioridade: "Normal" }), AGORA)!;
    const ret = motivoDoRegistro(reg({ tipo: "rfm", data_servico: null, ultimo_servico: atras(300), prioridade: "Normal", proximo_contato_em: atras(3) }), AGORA)!;
    expect(ret.pontos - base.pontos).toBe(70);
    expect(ret.selo).toMatch(/^Retorno combinado/);
    expect(ret.urgente).toBe(true);
  });
  it("R7 com o cheque vencendo em 30 dias sobe para 130 e é urgente", () => {
    const m = motivoDaOportunidade(op("R7_garantia_risco", { detalhes: { data_limite: `${frente(20)}T00:00:00.000Z`, cheque_rotulo: "300h" } }), AGORA)!;
    expect(m.pontos).toBe(130);
    expect(m.urgente).toBe(true);
    expect(m.selo).toContain("300h");
  });
  it("revisão atrasada pesa mais que 'parou de fazer na loja'; próxima longe fica de fora", () => {
    const atrasada = motivoDaRevisao(revisao({ entregaDias: 400, leit: [[390, 50, 50], [250, 300, 300]] }), AGORA)!;
    const parou = motivoDaRevisao(revisao({ entregaDias: 1500, leit: [[1460, 50, 50], [1200, 298, 300]] }), AGORA);
    const longe = motivoDaRevisao(revisao({ entregaDias: 30, leit: [[10, 52, 50]] }), AGORA);
    expect(atrasada.revisao!.trator.previsao.situacao).toBe("atrasada");
    expect(atrasada.selo).toMatch(/^Revisão 600 h atrasada há \d+ dias$/);
    // ~100 dias de atraso: ainda pesa (≥ 80), mas já não é urgente (só até 45 dias)
    expect(atrasada.pontos).toBeGreaterThanOrEqual(80);
    expect(atrasada.urgente).toBe(false);
    const recente = motivoDaRevisao(revisao({ entregaDias: 330, leit: [[320, 50, 50], [180, 300, 300]] }), AGORA)!;
    expect(recente.revisao!.trator.previsao.situacao).toBe("atrasada");
    expect(recente.urgente).toBe(true);
    expect(recente.pontos).toBeGreaterThan(atrasada.pontos);
    expect(parou!.revisao!.trator.previsao.situacao).toBe("parou");
    expect(parou!.pontos).toBeLessThanOrEqual(55);
    expect(longe).toBeNull();
  });
});

describe("pontuação do cliente", () => {
  const m = (pontos: number): Motivo => ({ id: `x${pontos}`, fonte: "oportunidade", grupo: "pecas", regra: "R5_pecas", selo: "s", porque: "p", pontos, urgente: false, acao: "ligar", aPartirDe: null, retorno: null, tentativas: [], tecnico: null });
  it("o mais forte vale inteiro, os outros somam metade, com teto", () => {
    expect(pontuar([m(100), m(40)], false).pontos).toBe(120);
    expect(pontuar([m(100), m(150), m(150)], false).pontos).toBe(150 + TETO_BONUS);
    expect(pontuar([m(100)], true).pontos).toBe(100 - PENALIDADE_SEM_TELEFONE);
    expect(pontuar([m(6)], true).pontos).toBe(1);
  });
});

describe("um cliente só, com todos os motivos", () => {
  it("junta registro, oportunidade e revisão do mesmo cliente (código ou nome)", () => {
    const rev = revisao({ cliente: "JOÃO DA SILVA", codigo: null, entregaDias: 400, leit: [[380, 50, 50], [200, 290, 300]] });
    const clientes = montarClientes({
      registros: [reg({ os_ref: "NOVA:5395" } as never)],
      oportunidades: [op("R5_pecas", { detalhes: { meses_sem_pedido: 13 } }), op("R6_fora_garantia")],
      revisoes: [rev],
    }, AGORA);
    expect(clientes).toHaveLength(1);
    const c = clientes[0];
    expect(c.motivos.length).toBeGreaterThanOrEqual(3);
    expect(c.grupos).toEqual(expect.arrayContaining(["pos_servico", "pecas", "reativacao"]));
    expect(c.acao).toBe("ligar");
    expect(c.explicacao[0].pts).toBe(c.motivos[0].pontos);
  });
  it("retorno combinado para outro dia segura o cliente inteiro; tentou hoje volta amanhã", () => {
    const [espera] = montarClientes({ registros: [reg({ proximo_contato_em: frente(4) })], oportunidades: [op("R5_pecas")], revisoes: [] }, AGORA);
    expect(espera.acao).toBe("aguardar");
    expect(espera.aPartirDe).toBe(frente(4));
    const [tentou] = montarClientes({ registros: [reg({ tentativas: [{ data: new Date(AGORA - 3600_000).toISOString(), canal: "telefone" }] })], oportunidades: [], revisoes: [] }, AGORA);
    expect(tentou.acao).toBe("retentar");
  });
  it("tira quem é 'Não contatar' e usa o telefone do cadastro", () => {
    const e = { registros: [], oportunidades: [op("R5_pecas"), op("R5_pecas", { codigo_omie: "20", cliente_nome: "OUTRO" })], revisoes: [], tags: { omie_20: ["Não contatar"] }, cadastro: { "10": { telefone: "14999990000", email: null, cidade: "PIRAJU" } } };
    const cs = montarClientes(e, AGORA);
    expect(cs.map((c) => c.key)).toEqual(["omie_10"]);
    expect(cs[0].telefone).toBe("14999990000");
  });
  it("cota do dia: os N melhores; o resto vai para depois", () => {
    const ops = Array.from({ length: 30 }, (_, i) => op("R5_pecas", { codigo_omie: String(1000 + i), cliente_nome: `C${i}`, detalhes: { meses_sem_pedido: i } }));
    const cs = montarClientes({ registros: [reg({ codigo_omie: "1", nome: "TOP" })], oportunidades: ops, revisoes: [] }, AGORA);
    const { hoje, depois } = cotaDoDia(cs, 25);
    expect(hoje).toHaveLength(25);
    expect(depois).toHaveLength(6);
    expect(hoje[0].nome).toBe("TOP");
  });
});

describe("desfecho fecha o que faz sentido", () => {
  const cliente = () => montarClientes({
    registros: [reg({ os_ref: "NOVA:5395" } as never)],
    oportunidades: [op("R1_revisao"), op("R5_pecas"), op("R8_cadastro")],
    revisoes: [],
  }, AGORA)[0];
  it("serviço agendado com pesquisa: fecha pós-serviço e revisão; peças e cadastro desmarcados", () => {
    const p = planoDesfecho(cliente(), "servico_agendado", true);
    const por = (r: string) => p.find((x) => x.motivo.regra === r || (r === "crm" && x.motivo.fonte === "registro"))!;
    expect(por("crm")).toMatchObject({ efeito: "fecha", padrao: true });
    expect(por("R1_revisao")).toMatchObject({ efeito: "fecha", padrao: true });
    expect(por("R5_pecas")).toMatchObject({ efeito: "fecha", padrao: false });
    expect(por("R8_cadastro").padrao).toBe(false);
  });
  it("sem a pesquisa o pós-serviço não fecha; não atendeu só anota tentativa", () => {
    expect(planoDesfecho(cliente(), "vendeu", false).find((x) => x.motivo.fonte === "registro")!.efeito).toBe("mantem");
    const nao = planoDesfecho(cliente(), "sem_resposta", false);
    expect(nao.find((x) => x.motivo.fonte === "registro")!.efeito).toBe("tentativa");
    expect(nao.filter((x) => x.motivo.fonte === "oportunidade").every((x) => x.efeito === "mantem")).toBe(true);
  });
  it("retornar guarda a data no registro e deixa as oportunidades abertas; recusou fecha tudo menos cadastro", () => {
    const r = planoDesfecho(cliente(), "retornar", false);
    expect(r.find((x) => x.motivo.fonte === "registro")!.efeito).toBe("retorno");
    expect(r.find((x) => x.motivo.regra === "R1_revisao")!.efeito).toBe("mantem");
    const rec = planoDesfecho(cliente(), "recusou", true);
    expect(rec.filter((x) => x.padrao).map((x) => x.motivo.regra ?? "crm").sort()).toEqual(["R1_revisao", "R5_pecas", "crm"]);
  });
});

describe("números", () => {
  it("contadores e feitos hoje", () => {
    const regs = [
      reg({ id: 2, codigo_omie: "30", nome: "FEITO", status_atendimento: "concluido", concluido_em: new Date(AGORA - 3600_000).toISOString(), nota: 4 }),
      reg({ id: 3, codigo_omie: "40", nome: "SEM", status_atendimento: "sem_resposta", tentativas: [1, 2, 3].map((d) => ({ data: new Date(AGORA - d * DIA).toISOString(), canal: "telefone" as const })) }),
    ];
    const f = feitosHoje({ registros: regs, oportunidades: [op("R5_pecas", { status: "atendida", atendida_em: new Date(AGORA - 60_000).toISOString(), codigo_omie: "50", cliente_nome: "OP" })], revisoes: [] }, AGORA);
    expect([...f].sort()).toEqual(["omie_30", "omie_50"]);
    const cs = montarClientes({ registros: regs, oportunidades: [], revisoes: [] }, AGORA);
    const k = contadores(cs, 25, { registros: regs, feitosHojeKeys: f }, AGORA);
    expect(k).toMatchObject({ feitosHoje: 2, semResposta: 1, notasBaixas: 1, paraHoje: 1 });
    expect(distribuicao(cs).porGrupo.pos_servico).toBe(1);
  });
});

describe("painel do gerente", () => {
  it("em ligação, esquecida, feitos por pessoa, notas baixas, parados e conversão", async () => {
    const { montarPainel } = await import("../hoje-painel");
    const c = (x: Record<string, unknown>) => ({ id: String(Math.random()), atendente_id: "u", atendente_nome: "Vinicius Correa ", cliente_key: "omie_10", feedback_id: null, oportunidade_id: null, iniciada_em: new Date(AGORA - 3600_000).toISOString(), encerrada_em: null, duracao_seg: null, desfecho: null, humor_cliente: null, qualidade_conversa: null, ...x });
    const p = montarPainel({
      registros: [
        reg({ id: 5, status_atendimento: "concluido", concluido_em: new Date(AGORA - 3600_000).toISOString(), atendente_nome: "Vinicius Correa", nota: 5 }),
        reg({ id: 6, tipo: "rfm", atualizado_em: new Date(AGORA - 20 * DIA).toISOString() }),
        reg({ id: 7, tipo: "rfm", atualizado_em: new Date(AGORA - 20 * DIA).toISOString(), proximo_contato_em: frente(3) }),
      ],
      oportunidades: [op("R5_pecas", { status: "atendida", atendida_em: new Date(AGORA - 60_000).toISOString(), atendida_por: "u1" })],
      chamadas: [
        c({}), c({ iniciada_em: new Date(AGORA - 3 * 3600_000).toISOString() }),
        c({ encerrada_em: new Date(AGORA - 1800_000).toISOString(), desfecho: "servico_agendado" }),
        c({ encerrada_em: new Date(AGORA - 1800_000).toISOString(), desfecho: "sem_resposta" }),
      ] as never,
      nomes: { u1: "Larissa" },
    }, AGORA);
    expect(p.emLigacao).toHaveLength(2);
    expect(p.emLigacao[0].esquecida).toBe(true);
    expect(p.feitosHoje.find((x) => x.pessoa === "Vinicius Correa")).toMatchObject({ ligacoes: 2, concluidos: 1, total: 3 });
    expect(p.feitosHoje.find((x) => x.pessoa === "Larissa")?.oportunidades).toBe(1);
    expect(p.notasBaixas.map((n) => n.id)).toEqual([5]);
    expect(p.parados.map((x) => x.id)).toEqual(["cha:" + p.emLigacao[0].id, "reg:6"]);
    expect(p.semana.total).toMatchObject({ ligacoes: 2, contato: 1, conversoes: 1, taxa: 100 });
  });
});

describe("revisão vencida × vai vencer", () => {
  const cli = (...sits: (string | null)[]) => ({
    motivos: sits.map((s) => (s ? { revisao: { trator: { previsao: { situacao: s } } } } : {})),
  }) as unknown as Pick<import("../hoje").ClienteHoje, "motivos">;
  it("a pior situação manda", () => {
    expect(estadoRevisaoCliente(cli("vence_30", "atrasada"))).toBe("vencida");
    expect(estadoRevisaoCliente(cli("parou"))).toBe("vencida");
    expect(estadoRevisaoCliente(cli("proxima", null))).toBe("vai_vencer");
    expect(estadoRevisaoCliente(cli(null))).toBeNull();
    expect(estadoRevisaoCliente(cli("sem_entrega"))).toBeNull();
  });
  it("separa mantendo a ordem", () => {
    const a = cli("atrasada"), b = cli("vence_30"), c = cli(null), d = cli("parou");
    const r = separarPorRevisao([a, b, c, d]);
    expect(r.vencida).toEqual([a, d]);
    expect(r.vai_vencer).toEqual([b]);
    expect(r.outros).toEqual([c]);
  });
});
