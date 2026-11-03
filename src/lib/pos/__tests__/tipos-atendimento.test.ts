import { describe, it, expect } from "vitest";
import { montarLista, validarNomeTipo, opcoesComAtual, ehFixo, chaveTipo } from "../tipos-atendimento";

describe("tipos de atendimento", () => {
  it("fixos primeiro, sem repetir, ordem do banco depois", () => {
    const l = montarLista([
      { id: "a", nome: "Entrega Técnica" }, { id: "b", nome: "revisão" },
      { id: "c", nome: "Inspeção Pré-Entrega" }, { id: "d", nome: " entrega  tecnica " },
    ]);
    expect(l.map((t) => t.nome)).toEqual(["Manutenção", "Revisão", "Entrega Técnica", "Inspeção Pré-Entrega"]);
    expect(l[1]).toEqual({ id: "b", nome: "Revisão", fixo: true });
    expect(l[0].id).toBeNull();
  });
  it("valida nome vazio, longo e duplicado sem acento/caixa", () => {
    expect(validarNomeTipo("  ", [])).toMatch(/Informe/);
    expect(validarNomeTipo("x".repeat(41), [])).toMatch(/máximo/);
    expect(validarNomeTipo("inspecao pre-entrega", ["Inspeção Pré-Entrega"])).toMatch(/já existe/);
    expect(validarNomeTipo("Garantia", ["Manutenção"])).toBeNull();
  });
  it("mantém o valor atual da OS se saiu da lista", () => {
    expect(opcoesComAtual(["Manutenção", "Revisão"], "Garantia Trator")).toEqual(["Manutenção", "Revisão", "Garantia Trator"]);
    expect(opcoesComAtual(["Manutenção", "Revisão"], "revisao")).toEqual(["Manutenção", "Revisão"]);
    expect(opcoesComAtual(["Manutenção"], "")).toEqual(["Manutenção"]);
  });
  it("fixos", () => {
    expect(ehFixo("REVISAO")).toBe(true);
    expect(ehFixo("Entrega Técnica")).toBe(false);
    expect(chaveTipo(" Pré  Entrega ")).toBe("pre entrega");
  });
});
