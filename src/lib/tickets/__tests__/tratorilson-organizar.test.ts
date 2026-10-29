import { describe, expect, it } from "vitest";
import { aplicarResposta, diasDoPlano, entraNoPlano, lerRespostaIA, planejar } from "../tratorilson-organizar";

const HOJE = "2026-10-29"; // quinta

describe("Tratorilson organiza a semana dos tickets", () => {
  it("dias: hoje + 6, sem domingo", () => {
    expect(diasDoPlano(HOJE)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("só entra ticket sem prazo ou com o dia do próprio robô já passado", () => {
    expect(entraNoPlano({ prazo: null, prazoMarcado: null }, HOJE)).toBe(true);
    expect(entraNoPlano({ prazo: "2026-10-27", prazoMarcado: "2026-10-27" }, HOJE)).toBe(true);
    // prazo de pessoa (mesmo vencido) nunca
    expect(entraNoPlano({ prazo: "2026-10-27", prazoMarcado: null }, HOJE)).toBe(false);
    // robô marcou, mas a pessoa trocou o dia
    expect(entraNoPlano({ prazo: "2026-10-28", prazoMarcado: "2026-10-27" }, HOJE)).toBe(false);
    // dia do robô ainda não chegou: fica
    expect(entraNoPlano({ prazo: "2026-10-30", prazoMarcado: "2026-10-30" }, HOJE)).toBe(false);
  });
  it("alta hoje, média amanhã, baixa depois de amanhã", () => {
    const m = planejar([
      { id: "b", criadoEm: "2026-10-01", prioridade: 3 },
      { id: "a", criadoEm: "2026-10-02", prioridade: 1 },
      { id: "m", criadoEm: "2026-10-03", prioridade: 2 },
    ], {}, HOJE);
    expect(Object.fromEntries(m.map((x) => [x.ticketId, x.dia]))).toEqual({ a: "2026-10-29", m: "2026-10-30", b: "2026-10-31" });
  });
  it("dia cheio passa para o próximo (a agenda já conta)", () => {
    const m = planejar([{ id: "a", criadoEm: "x", prioridade: 1 }, { id: "a2", criadoEm: "y", prioridade: 1 }], { "2026-10-29": 3 }, HOJE, 4);
    expect(m.map((x) => x.dia)).toEqual(["2026-10-29", "2026-10-30"]);
  });
  it("tudo cheio: vai para o dia mais vazio", () => {
    const carga = { "2026-10-29": 9, "2026-10-30": 9, "2026-10-31": 5, "2026-11-02": 9, "2026-11-03": 9, "2026-11-04": 9 };
    expect(planejar([{ id: "x", criadoEm: "x", prioridade: 1 }], carga, HOJE, 4)[0].dia).toBe("2026-10-31");
  });
  it("lê a resposta da IA e a dúvida", () => {
    const r = lerRespostaIA('{"itens":[{"n":1,"prioridade":"alta"},{"n":2,"prioridade":"baixa"}],"duvida":[1,3]}', ["t1", "t2", "t3"]);
    expect(r.prioridades).toEqual({ t1: 1, t2: 3, t3: 2 });
    expect(r.duvida).toEqual(["t1", "t3"]);
    expect(lerRespostaIA("lixo", ["t1"])).toEqual({ prioridades: { t1: 2 }, duvida: [] });
    expect(lerRespostaIA('{"itens":[],"duvida":[1]}', ["t1"]).duvida).toEqual([]); // 1 só não é dúvida
  });
  it("resposta da pessoa: escolhido alta, os outros média", () => {
    expect(aplicarResposta(["a", "b"], "b")).toEqual({ a: 2, b: 1 });
  });
});
