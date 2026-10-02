import { describe, expect, it } from "vitest";
import type { FeedbackRegistro } from "../../types";
import {
  agregarPerformance, diaDe, linhaCSVPerformance, CSV_PERFORMANCE_CABECALHO, normalizarAtendente, periodoDoPreset, porDia, totalPerformance, type ChamadaResumo,
} from "../performance";

const HOJE = new Date(2026, 8, 10, 15, 0, 0); // 10/09/2026 local

function reg(p: Partial<FeedbackRegistro>): FeedbackRegistro {
  return {
    id: 1, tipo: "rfm", nome: "X", telefone: null, email: null, trator: null, tecnico: null, codigo_omie: null, data_contato: null,
    servico: null, data_servico: null, status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null,
    ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [],
    atendente_id: null, atendente_nome: "Ana", aberto_em: "2026-09-10T12:00:00Z", concluido_em: null, status_atendimento: "aberto",
    arquivado_motivo: null, origem_dados: null, criado_em: "2026-09-10T12:00:00Z",
    ...p,
  } as FeedbackRegistro;
}

function cham(p: Partial<ChamadaResumo>): ChamadaResumo {
  return { atendente_nome: "Ana", iniciada_em: "2026-09-10T12:00:00Z", encerrada_em: "2026-09-10T12:05:00Z", duracao_seg: 300, desfecho: "retornar", humor_cliente: null, qualidade_conversa: null, feedback_id: 1, cliente_key: "omie_1", ...p };
}

describe("períodos", () => {
  it("presets em dia local", () => {
    expect(periodoDoPreset("hoje", HOJE)).toEqual({ de: "2026-09-10", ate: "2026-09-10" });
    expect(periodoDoPreset("ontem", HOJE)).toEqual({ de: "2026-09-09", ate: "2026-09-09" });
    expect(periodoDoPreset("7d", HOJE)).toEqual({ de: "2026-09-04", ate: "2026-09-10" });
    expect(periodoDoPreset("30d", HOJE)).toEqual({ de: "2026-08-12", ate: "2026-09-10" });
    expect(periodoDoPreset("mes", HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-10" });
    expect(periodoDoPreset("mes_anterior", HOJE)).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(periodoDoPreset("tudo", HOJE)).toEqual({ de: null, ate: null });
    expect(periodoDoPreset("custom", HOJE, { de: "2026-01-01", ate: "" })).toEqual({ de: "2026-01-01", ate: null });
  });
  it("diaDe lê YYYY-MM-DD como local e timestamptz no fuso local", () => {
    expect(diaDe("2026-09-10")).toBe("2026-09-10");
    expect(diaDe(null)).toBe("");
    expect(diaDe("lixo")).toBe("");
    const d = new Date(2026, 8, 10, 23, 30);
    expect(diaDe(d.toISOString())).toBe("2026-09-10");
  });
});

describe("agregarPerformance", () => {
  it("junta 'Vinicius Correa ' e 'Vinicius Correa' como UMA pessoa", () => {
    const lista = agregarPerformance([reg({ id: 1, atendente_nome: "Vinicius Correa " }), reg({ id: 2, atendente_nome: "Vinicius  Correa" })], [], { de: null, ate: null });
    expect(lista).toHaveLength(1);
    expect(lista[0].atendente).toBe("Vinicius Correa");
    expect(lista[0].atendimentos.total).toBe(2);
    expect(normalizarAtendente("  a   b ")).toBe("a b");
  });

  it("conta atendimentos por status, serviço gerado e satisfação CRM (só concluídos)", () => {
    const regs = [
      reg({ id: 1, status_atendimento: "concluido", concluido_em: "2026-09-10T13:00:00Z", revisao_confirmada: "Revisão 300h", tipo: "crm", status_cliente: "Satisfeito" }),
      reg({ id: 2, status_atendimento: "sem_resposta" }),
      reg({ id: 3, status_atendimento: "em_andamento" }),
      reg({ id: 4, status_atendimento: "aberto", tipo: "crm", status_cliente: "Insatisfeito" }), // não concluído → não conta negativa
    ];
    const [ana] = agregarPerformance(regs, [], { de: null, ate: null });
    expect(ana.atendimentos).toMatchObject({ total: 4, concluidos: 1, semResposta: 1, emAberto: 2, gerouServico: 1, positiva: 1, negativa: 0, pctConclusao: 25 });
  });

  it("ligações: tempo, desfechos, contato efetivo, conversão, humor e qualidade; abertas ficam fora das contas", () => {
    const chamadas = [
      cham({ desfecho: "servico_agendado", duracao_seg: 120, humor_cliente: 5, qualidade_conversa: 4 }),
      cham({ desfecho: "vendeu", duracao_seg: 240, humor_cliente: 4, qualidade_conversa: 5 }),
      cham({ desfecho: "sem_resposta", duracao_seg: 30 }),
      cham({ desfecho: "numero_errado", duracao_seg: 10 }),
      cham({ desfecho: "recusou", duracao_seg: 100, humor_cliente: 1, qualidade_conversa: 3 }),
      cham({ encerrada_em: null, duracao_seg: null, desfecho: null }), // em andamento
    ];
    const [ana] = agregarPerformance([], chamadas, { de: null, ate: null });
    const l = ana.ligacoes;
    expect(l.total).toBe(5);
    expect(l.abertas).toBe(1);
    expect(l.tempoTotalSeg).toBe(500);
    expect(l.tempoMedioSeg).toBe(100);
    expect(l.desfechos).toMatchObject({ servico_agendado: 1, vendeu: 1, sem_resposta: 1, numero_errado: 1, recusou: 1, retornar: 0 });
    expect(l.contatoEfetivo).toBe(3);
    expect(l.taxaContato).toBe(60);
    expect(l.conversoes).toBe(2);
    expect(l.taxaConversao).toBe(67);
    expect(l.humorMedio).toBe(3.3);
    expect(l.qualidadeMedia).toBe(4);
  });

  it("respeita o período (dia local) e a fonte", () => {
    const regs = [
      reg({ id: 1, tipo: "crm", aberto_em: "2026-09-01T12:00:00Z" }),
      reg({ id: 2, tipo: "rfm", aberto_em: "2026-09-10T12:00:00Z" }),
    ];
    const chamadas = [cham({ iniciada_em: "2026-08-20T12:00:00Z", encerrada_em: "2026-08-20T12:01:00Z" }), cham({})];
    const hoje = agregarPerformance(regs, chamadas, periodoDoPreset("hoje", HOJE));
    expect(hoje[0].atendimentos.total).toBe(1);
    expect(hoje[0].ligacoes.total).toBe(1);
    const soCrm = agregarPerformance(regs, chamadas, { de: null, ate: null }, "crm");
    expect(soCrm[0].atendimentos.total).toBe(1);
    expect(soCrm[0].ligacoes.total).toBe(2); // ligação não tem fonte
  });

  it("ranking: conversões, depois concluídos, depois ligações", () => {
    const regs = [reg({ id: 1, atendente_nome: "Bia", status_atendimento: "concluido" }), reg({ id: 2, atendente_nome: "Bia", status_atendimento: "concluido" })];
    const chamadas = [cham({ atendente_nome: "Ana", desfecho: "vendeu" }), cham({ atendente_nome: "Caio" }), cham({ atendente_nome: "Caio" })];
    const nomes = agregarPerformance(regs, chamadas, { de: null, ate: null }).map((s) => s.atendente);
    expect(nomes).toEqual(["Ana", "Bia", "Caio"]);
  });

  it("sem atendente → ignora; taxas ficam null sem base", () => {
    const lista = agregarPerformance([reg({ atendente_nome: null })], [cham({ atendente_nome: "  " })], { de: null, ate: null });
    expect(lista).toEqual([]);
    const [a] = agregarPerformance([reg({})], [], { de: null, ate: null });
    expect(a.ligacoes.taxaContato).toBeNull();
    expect(a.ligacoes.tempoMedioSeg).toBeNull();
  });
});

describe("totalPerformance / porDia / CSV", () => {
  it("total soma e pondera as médias pelo nº de ligações", () => {
    const lista = agregarPerformance(
      [reg({ id: 1, atendente_nome: "Ana", status_atendimento: "concluido" }), reg({ id: 2, atendente_nome: "Bia" })],
      [cham({ atendente_nome: "Ana", desfecho: "vendeu", humor_cliente: 5 }), cham({ atendente_nome: "Bia", humor_cliente: 3 }), cham({ atendente_nome: "Bia", humor_cliente: 3 })],
      { de: null, ate: null }
    );
    const t = totalPerformance(lista);
    expect(t.atendente).toBe("Equipe");
    expect(t.atendimentos.total).toBe(2);
    expect(t.atendimentos.pctConclusao).toBe(50);
    expect(t.ligacoes.total).toBe(3);
    expect(t.ligacoes.conversoes).toBe(1);
    expect(t.ligacoes.humorMedio).toBe(3.7);
  });

  it("porDia devolve só dias com algo, mais recente primeiro, por atendente", () => {
    const regs = [reg({ id: 1, atendente_nome: "Ana", aberto_em: "2026-09-09T12:00:00Z" })];
    const chamadas = [cham({ atendente_nome: "Bia" }), cham({ atendente_nome: "Bia" }), cham({ atendente_nome: "Ana", encerrada_em: null })];
    const dias = porDia(regs, chamadas, periodoDoPreset("7d", HOJE));
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-10", "2026-09-09"]);
    expect(dias[0].porAtendente).toEqual({ Bia: { atendimentos: 0, ligacoes: 2 } });
    expect(dias[1].porAtendente).toEqual({ Ana: { atendimentos: 1, ligacoes: 0 } });
  });

  it("CSV tem uma coluna por valor", () => {
    const [ana] = agregarPerformance([reg({})], [cham({})], { de: null, ate: null });
    expect(linhaCSVPerformance(ana)).toHaveLength(CSV_PERFORMANCE_CABECALHO.length);
  });
});
