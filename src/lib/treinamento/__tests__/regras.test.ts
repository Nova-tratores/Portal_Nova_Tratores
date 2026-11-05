import { describe, expect, it } from "vitest";
import {
  corrigir, diasParaPrazo, embaralharDeterministico, etapasDaAtribuicao, perguntasDaAtribuicao, podeFazerProva, prazoDaTrilha, progresso, recebeSozinho, resumoPainel, situacaoEfetiva, validarPergunta, validarTrilha,
  type Atribuicao, type Etapa, type Pergunta,
} from "../regras";

const etapas: Etapa[] = [
  { id: "e2", trilha_id: "t", ordem: 20, artigo_id: "a2" },
  { id: "e1", trilha_id: "t", ordem: 10, artigo_id: "a1" },
  { id: "e3", trilha_id: "t", ordem: 30, artigo_id: "a3" },
];
const perguntas: Pergunta[] = [
  { id: "p1", trilha_id: "t", artigo_id: "a1", ordem: 1, enunciado: "?", opcoes: ["a", "b"], correta: 1, explicacao: null, ativa: true },
  { id: "p2", trilha_id: "t", artigo_id: "a2", ordem: 2, enunciado: "?", opcoes: ["a", "b", "c"], correta: 0, explicacao: null, ativa: true },
  { id: "p3", trilha_id: "t", artigo_id: null, ordem: 3, enunciado: "?", opcoes: ["a", "b"], correta: 0, explicacao: null, ativa: true },
  { id: "p4", trilha_id: "t", artigo_id: "a3", ordem: 4, enunciado: "?", opcoes: ["a", "b"], correta: 0, explicacao: null, ativa: false },
];
const atrib = (p: Partial<Atribuicao> = {}): Atribuicao => ({ id: "x", trilha_id: "t", user_id: "u", user_nome: null, ciclo: 1, origem: "categoria", etapas: null, prazo: "2026-11-12", situacao: "pendente", nota: null, tentativas: 0, concluida_em: null, motivo: null, criado_em: "", ...p });

describe("datas e situação", () => {
  it("prazo = hoje + prazo_dias (dia local)", () => {
    expect(prazoDaTrilha({ prazo_dias: 7 }, new Date(2026, 10, 5))).toBe("2026-11-12");
    expect(prazoDaTrilha({ prazo_dias: 30 }, new Date(2026, 11, 20))).toBe("2027-01-19");
    expect(diasParaPrazo("2026-11-12", "2026-11-05")).toBe(7);
    expect(diasParaPrazo("2026-11-01", "2026-11-05")).toBe(-4);
  });
  it("vencida é calculada; concluída nunca vence", () => {
    expect(situacaoEfetiva(atrib(), "2026-11-05")).toBe("pendente");
    expect(situacaoEfetiva(atrib(), "2026-11-13")).toBe("vencida");
    expect(situacaoEfetiva(atrib({ situacao: "concluida" }), "2026-12-01")).toBe("concluida");
    expect(situacaoEfetiva(atrib({ situacao: "em_andamento" }), "2026-11-12")).toBe("em_andamento");
  });
});

describe("etapas e progresso", () => {
  it("ordena pela trilha; reciclagem restringe", () => {
    expect(etapasDaAtribuicao(etapas, atrib()).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(etapasDaAtribuicao(etapas, atrib({ etapas: ["e3"] })).map((e) => e.id)).toEqual(["e3"]);
  });
  it("progresso conta a prova como último passo", () => {
    const ord = etapasDaAtribuicao(etapas, atrib());
    const p0 = progresso(ord, new Set(), true, false);
    expect(p0).toMatchObject({ lidas: 0, total: 3, pct: 0, faltaProva: true });
    expect(p0.proxima?.id).toBe("e1");
    const p2 = progresso(ord, new Set(["e1", "e2"]), true, false);
    expect(p2.pct).toBe(50);
    expect(p2.proxima?.id).toBe("e3");
    expect(podeFazerProva(p2)).toBe(false);
    const p3 = progresso(ord, new Set(["e1", "e2", "e3"]), true, false);
    expect(podeFazerProva(p3)).toBe(true);
    expect(p3.pct).toBe(75);
    expect(progresso(ord, new Set(["e1", "e2", "e3"]), true, true).pct).toBe(100);
    expect(progresso(ord, new Set(["e1", "e2", "e3"]), false, false).pct).toBe(100);
  });
});

describe("prova", () => {
  it("perguntas da atribuição: ativas; reciclagem só do artigo que mudou", () => {
    expect(perguntasDaAtribuicao(perguntas, etapas, atrib()).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(perguntasDaAtribuicao(perguntas, etapas, atrib({ etapas: ["e2"] })).map((p) => p.id)).toEqual(["p2"]);
    // reciclagem de artigo sem pergunta própria → cai na prova toda
    expect(perguntasDaAtribuicao(perguntas, etapas, atrib({ etapas: ["e3"] })).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
  it("corrige, calcula a nota e aprova pela nota mínima", () => {
    const ps = perguntasDaAtribuicao(perguntas, etapas, atrib());
    expect(corrigir(ps, { p1: 1, p2: 0, p3: 0 }, 70)).toMatchObject({ acertos: 3, total: 3, nota: 100, aprovado: true });
    const c = corrigir(ps, { p1: 1, p2: 2 }, 70);
    expect(c).toMatchObject({ acertos: 1, total: 3, nota: 33, aprovado: false, erradas: ["p2"], semResposta: ["p3"] });
    expect(corrigir(ps, { p1: 1, p2: 0, p3: 1 }, 70).aprovado).toBe(false); // 67 < 70
    expect(corrigir(ps, { p1: 1, p2: 0, p3: 1 }, 60).aprovado).toBe(true);
    expect(corrigir([], {}, 70)).toMatchObject({ nota: 100, aprovado: true });
  });
  it("embaralha igual para a mesma pessoa e diferente para outra", () => {
    const a = embaralharDeterministico(["1", "2", "3", "4", "5"], "u1");
    expect(a).toEqual(embaralharDeterministico(["1", "2", "3", "4", "5"], "u1"));
    expect([...a].sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(embaralharDeterministico(["1", "2", "3", "4", "5"], "u2")).not.toEqual(a);
  });
});

describe("validação", () => {
  it("pergunta: enunciado, opções, correta, repetidas", () => {
    expect(validarPergunta({ enunciado: "Qual a primeira fase?", opcoes: ["Orçamento", "Execução"], correta: 0 }).erros).toEqual([]);
    expect(validarPergunta({ enunciado: "x", opcoes: ["a"], correta: 3 }).erros).toHaveLength(3);
    expect(validarPergunta({ enunciado: "pergunta ok", opcoes: ["a", "A"], correta: 0 }).erros).toEqual(["Há opções repetidas."]);
    expect(validarPergunta({ enunciado: "pergunta ok", opcoes: ["a", " ", "b"], correta: "1" }).pergunta.opcoes).toEqual(["a", "b"]);
  });
  it("trilha: título, módulo, etapas, limites de nota e prazo", () => {
    const r = validarTrilha({ titulo: "Trilha", modulo: "pos", etapas: ["e1", "e1", "e2"], nota_minima: 250, prazo_dias: 0, publico: ["Pós Vendas"] });
    expect(r.erros).toEqual([]);
    expect(r.trilha).toMatchObject({ etapas: ["e1", "e2"], nota_minima: 100, prazo_dias: 1, obrigatoria: true });
    expect(validarTrilha({}).erros).toHaveLength(3);
    expect(validarTrilha({ titulo: "ok", modulo: "pos", etapas: ["e"] }).trilha).toMatchObject({ nota_minima: 70, prazo_dias: 7 });
  });
});

describe("público e painel", () => {
  it("recebe sozinho só trilha ativa da categoria", () => {
    expect(recebeSozinho({ status: "ativa", publico: ["Pós Vendas"] }, "Pós Vendas")).toBe(true);
    expect(recebeSozinho({ status: "rascunho", publico: ["Pós Vendas"] }, "Pós Vendas")).toBe(false);
    expect(recebeSozinho({ status: "ativa", publico: ["Pós Vendas"] }, "Peças")).toBe(false);
    expect(recebeSozinho({ status: "ativa", publico: [] }, null)).toBe(false);
  });
  it("resumo do painel", () => {
    const r = resumoPainel([
      { atribuicao: atrib({ nota: 80 }), situacao: "concluida", dias: 3, pct: 100 },
      { atribuicao: atrib({ nota: 40 }), situacao: "vencida", dias: -2, pct: 50 },
      { atribuicao: atrib(), situacao: "pendente", dias: 5, pct: 0 },
    ]);
    expect(r).toEqual({ total: 3, concluidas: 1, atrasadas: 1, emAndamento: 0, pendentes: 1, notaMedia: 60 });
  });
});
