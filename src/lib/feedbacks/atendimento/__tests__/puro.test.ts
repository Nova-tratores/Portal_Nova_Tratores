import { describe, expect, it } from "vitest";
import { agruparFila, isoData, mesclarMaquinas, resumirAtendimentos, resumirPedidos, resumirTrator, unificarServicos } from "../puro";
import type { Trator } from "@/lib/revisoes/types";
import type { FeedbackRegistro, Oportunidade } from "@/lib/feedbacks/types";

describe("isoData", () => {
  it("aceita ISO e DD/MM/YYYY", () => {
    expect(isoData("2026-03-05T10:00:00")).toBe("2026-03-05");
    expect(isoData("05/03/2026")).toBe("2026-03-05");
    expect(isoData("")).toBeNull();
    expect(isoData("abc")).toBeNull();
  });
});

describe("unificarServicos", () => {
  it("junta Omie + Portal, traduz etapa, tira duplicata pela Ordem_Omie e ordena por data", () => {
    const r = unificarServicos(
      [
        { num_os: "4986", empresa: "NOVA", data_inclusao: "2026-01-10", data_faturamento: "2026-01-12", etapa: "60", status: null, valor_total: 1500, descricao: "Revisão 300h", servicos: null, num_nf: "77" },
        { num_os: "4000", empresa: "NOVA", data_inclusao: "2025-06-01", data_faturamento: null, etapa: "30", status: null, valor_total: 200, descricao: null, servicos: "Troca de óleo", num_nf: null },
      ],
      [
        { Id_Ordem: 1, Os_Cliente: "X", Os_Tecnico: "Gabriel", Data: "20/02/2026", Serv_Solicitado: "Vazamento", Status: "Concluída", Valor_Total: "350,50", Projeto: "JIVO-123" },
        { Id_Ordem: 2, Os_Cliente: "X", Os_Tecnico: "Gabriel", Data: "12/01/2026", Serv_Solicitado: "Revisão", Status: "Concluída", Ordem_Omie: "4986" },
      ]
    );
    expect(r.map((s) => `${s.origem}:${s.numero}`)).toEqual(["portal:1", "omie:4986", "omie:4000"]);
    expect(r[1].status).toBe("Faturada");
    expect(r[1].data).toBe("2026-01-12");
    expect(r[0].valor).toBe(350.5);
    expect(r[0].tecnico).toBe("Gabriel");
    expect(r[2].descricao).toBe("Troca de óleo");
  });
});

describe("resumirPedidos", () => {
  it("ordena por data e interpreta faturado", () => {
    const r = resumirPedidos([
      { num_pedido: "1", empresa: "NOVA", data_inclusao: "2026-01-01", etapa: "50", valor_total: 10, faturado: "N", numero_nf: null },
      { num_pedido: "2", empresa: "NOVA", data_inclusao: "2026-02-01", etapa: "60", valor_total: 20, faturado: "S", numero_nf: "9" },
    ]);
    expect(r.map((p) => p.numero)).toEqual(["2", "1"]);
    expect(r[0].faturado).toBe(true);
    expect(r[1].faturado).toBe(false);
  });
});

const trator = (extra: Partial<Trator>): Trator =>
  ({ ID: "1", Modelo: "JIVO 245", Chassis: "ABC123", Cliente: "X", Entrega: "2024-01-01", Cidade: "Piraju", Vendedor: "V", ...extra }) as Trator;

describe("resumirTrator / mesclarMaquinas", () => {
  it("acha a última revisão registrada e calcula a próxima", () => {
    const m = resumirTrator(trator({ "50h Data": "2024-03-01", "50h Horimetro": "52", "300h Data": "2025-01-10", "300h Horimetro": "310" }));
    expect(m.ultima_revisao).toEqual({ rotulo: "300h", data: "2025-01-10", horimetro: 310 });
    expect(m.proxima_revisao?.horas).toBe(600);
    expect(m.proxima_revisao?.data_estimada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("sem entrega não estima; equipamento da pasta entra sem duplicar chassi", () => {
    const r = mesclarMaquinas([trator({ Entrega: "" })], ["Grade GA 20", "Jivo 245 — ABC123", "grade ga 20"]);
    expect(r).toHaveLength(2);
    expect(r.find((m) => m.fonte === "tratores")?.proxima_revisao).toBeNull();
    expect(r.find((m) => m.fonte === "pasta")?.modelo).toBe("Grade GA 20");
  });
  it("atrasadas vêm primeiro", () => {
    // A: entregue há 2 dias, 1ª revisão (50h) ainda longe. B: entregue em 2019
    // e nunca fez a 1ª revisão → estimativa no passado → atrasada.
    const hoje = new Date();
    hoje.setDate(hoje.getDate() - 2);
    const entregaA = hoje.toISOString().slice(0, 10);
    const r = mesclarMaquinas([trator({ Chassis: "A", Entrega: entregaA }), trator({ Chassis: "B", Entrega: "2019-01-01" })], []);
    expect(r[0].chassi).toBe("B");
    expect(r[0].proxima_revisao?.atrasada).toBe(true);
    expect(r[1].proxima_revisao?.atrasada).toBe(false);
  });
});

const reg = (p: Partial<FeedbackRegistro>): FeedbackRegistro =>
  ({ id: 1, tipo: "crm", nome: "X", telefone: null, email: null, trator: null, tecnico: null, codigo_omie: null, data_contato: null, servico: null, data_servico: null, status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null, ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [], atendente_id: null, atendente_nome: null, aberto_em: null, concluido_em: null, status_atendimento: "concluido", arquivado_motivo: null, origem_dados: null, criado_em: "2026-01-01T00:00:00Z", atualizado_em: "2026-01-01T00:00:00Z", ...p }) as FeedbackRegistro;

describe("resumirAtendimentos", () => {
  it("ordena do mais recente e escolhe o resumo", () => {
    const r = resumirAtendimentos([
      reg({ id: 1, data_contato: "2026-01-05", feedback: "Satisfeito com a revisão" }),
      reg({ id: 2, tipo: "rfm", ultimo_servico: "2026-03-01", acao: "Vai agendar" }),
      reg({ id: 3 }),
    ]);
    expect(r.map((a) => a.id)).toEqual([2, 1, 3]);
    expect(r[0].resumo).toBe("Vai agendar");
    expect(r[2].data).toBe("2026-01-01");
  });
});

const op = (p: Partial<Oportunidade>): Oportunidade =>
  ({ id: 1, regra: "R2_sem_os", codigo_omie: "10", cliente_nome: "ANA", trator: null, chassis: null, detalhes: {}, prioridade: "Normal", status: "aberta", atendida_por: null, atendida_em: null, feedback_id: null, dispensada_motivo: null, computado_em: "2026-09-01T06:00:00Z", ...p }) as Oportunidade;

describe("agruparFila", () => {
  it("uma linha por cliente, prioridade máxima, caveira no fim, telefone do cadastro", () => {
    const linhas = agruparFila({
      oportunidades: [
        op({ id: 1, codigo_omie: "10", cliente_nome: "ANA", prioridade: "Normal" }),
        op({ id: 2, codigo_omie: "10", cliente_nome: "ANA", regra: "R1_revisao", prioridade: "Urgente" }),
        op({ id: 3, codigo_omie: null, cliente_nome: "BETO", prioridade: "Urgente" }),
        op({ id: 4, codigo_omie: "30", cliente_nome: "CARLA", prioridade: "Baixa", status: "atendida" }),
      ],
      registros: [
        reg({ id: 7, nome: "Beto", codigo_omie: null, status_atendimento: "em_andamento", atendente_nome: "Zé", aberto_em: "2026-08-20T10:00:00Z", data_contato: "2026-08-20" }),
        reg({ id: 8, nome: "DORA", codigo_omie: "40", status_atendimento: "aberto", telefone: "14 99999-0000", aberto_em: "2026-08-01T10:00:00Z" }),
        reg({ id: 9, nome: "ANA", codigo_omie: "10", status_atendimento: "concluido", data_contato: "2026-07-01" }),
      ],
      tagsPorCliente: new Map([["nome_BETO", ["Não contatar"]]]),
      telefonePorCodigo: new Map([["10", "(14) 3351-0000"]]),
    });
    expect(linhas.map((l) => l.cliente_key)).toEqual(["omie_10", "omie_40", "nome_BETO"]);
    const ana = linhas[0];
    expect(ana.prioridade).toBe("Urgente");
    expect(ana.regras).toEqual(["R2_sem_os", "R1_revisao"]);
    expect(ana.telefone).toBe("(14) 3351-0000");
    expect(ana.ultimo_contato).toBe("2026-07-01");
    expect(ana.registros_abertos).toBe(0);
    const beto = linhas[2];
    expect(beto.caveira).toBe(true);
    expect(beto.em_atendimento_por).toBe("Zé");
    expect(linhas[1].prioridade).toBe("Normal");
  });
});

describe("tagsDoCadastro", () => {
  it("aceita array, JSON string de objetos, lista separada e vazio", async () => {
    const { tagsDoCadastro } = await import("../puro");
    expect(tagsDoCadastro('[{"tag":"Cliente"},{"tag":"Ouro"}]')).toEqual(["Cliente", "Ouro"]);
    expect(tagsDoCadastro(["A", { tag: "B" }])).toEqual(["A", "B"]);
    expect(tagsDoCadastro("Cliente, Agricultor;Ouro")).toEqual(["Cliente", "Agricultor", "Ouro"]);
    expect(tagsDoCadastro(null)).toEqual([]);
    expect(tagsDoCadastro("")).toEqual([]);
  });
});

describe("descricaoServicoOmie / datas DD/MM no trator", () => {
  it("transforma o JSON de serviços em texto legível, sem o cabeçalho MODELO|CHASSI|HOR", async () => {
    const { descricaoServicoOmie } = await import("../puro");
    const raw = '[{"cod":0,"qtd":1,"valor":0.001,"desc":"MODELO: JIVO 2025|CHASSI: MBN1KG|HOR: 57.7|REVISAO 50H|*O TÉCNICO REALIZOU A TROCA DE OLEO."},{"cod":1979758762,"qtd":2,"valor":110,"desc":"Hora Trabalhada"}]';
    expect(descricaoServicoOmie({ servicos: raw, descricao: null })).toBe("REVISAO 50H · *O TÉCNICO REALIZOU A TROCA DE OLEO. · Hora Trabalhada");
    expect(descricaoServicoOmie({ servicos: null, descricao: "Troca de óleo" })).toBe("Troca de óleo");
    expect(descricaoServicoOmie({ servicos: "", descricao: null })).toBeNull();
  });
  it("estima a próxima revisão mesmo com Entrega e revisões em DD/MM/YYYY", () => {
    const m = resumirTrator(trator({ Entrega: "22/05/2024", "50h Data": "28/08/2024", "50h Horimetro": "52", "300h Data": "28/08/2025", "300h Horimetro": "279" }));
    expect(m.entrega).toBe("2024-05-22");
    expect(m.ultima_revisao?.data).toBe("2025-08-28");
    expect(m.proxima_revisao?.horas).toBe(600);
    expect(m.proxima_revisao?.data_estimada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("agruparFila com chamadas abertas", () => {
  it("chamada aberta em feedback_chamada manda sobre o registro em_andamento e traz o id do atendente", () => {
    const linhas = agruparFila({
      oportunidades: [op({ id: 1, codigo_omie: "10", cliente_nome: "ANA" })],
      registros: [reg({ id: 7, nome: "ANA", codigo_omie: "10", status_atendimento: "em_andamento", atendente_nome: "Registro Antigo" })],
      tagsPorCliente: new Map(),
      telefonePorCodigo: new Map(),
      chamadasAbertas: new Map([["omie_10", { atendente_id: "u-1", atendente_nome: "Zé" }]]),
    });
    expect(linhas[0].em_atendimento_por).toBe("Zé");
    expect(linhas[0].em_atendimento_id).toBe("u-1");
  });
});

describe("agruparFila com último humor", () => {
  it("traz o humor da última ligação encerrada", () => {
    const linhas = agruparFila({
      oportunidades: [op({ id: 1, codigo_omie: "10", cliente_nome: "ANA" })],
      registros: [],
      tagsPorCliente: new Map(),
      telefonePorCodigo: new Map(),
      humorPorCliente: new Map([["omie_10", 2]]),
    });
    expect(linhas[0].ultimo_humor).toBe(2);
  });
});
