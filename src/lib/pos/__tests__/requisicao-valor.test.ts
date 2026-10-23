import { describe, it, expect } from "vitest";
import { valorRequisicaoOmie, VALOR_SIMBOLICO } from "../requisicao-valor";

describe("valorRequisicaoOmie", () => {
  it("cobrado preenchido vale", () => {
    expect(valorRequisicaoOmie("60.00", "52.00")).toBe(60);
    expect(valorRequisicaoOmie("1.234,56", "10")).toBe(1234.56);
  });
  it("cobrado 0 NÃO cai no custo (OS-0684)", () => {
    expect(valorRequisicaoOmie("0.00", "27.00")).toBe(VALOR_SIMBOLICO);
    expect(valorRequisicaoOmie("0", "27.00")).toBe(VALOR_SIMBOLICO);
  });
  it("cobrado vazio usa o custo", () => {
    expect(valorRequisicaoOmie(null, "27.00")).toBe(27);
    expect(valorRequisicaoOmie("", "50,00")).toBe(50);
  });
  it("sem nada vai simbólico", () => {
    expect(valorRequisicaoOmie(null, null)).toBe(VALOR_SIMBOLICO);
  });
});
