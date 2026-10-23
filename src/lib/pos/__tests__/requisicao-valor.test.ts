import { describe, it, expect } from "vitest";
import { valorRequisicaoOmie, VALOR_SIMBOLICO } from "../requisicao-valor";

describe("valorRequisicaoOmie", () => {
  it("cobrado preenchido vale", () => {
    expect(valorRequisicaoOmie("60.00")).toBe(60);
    expect(valorRequisicaoOmie("1.234,56")).toBe(1234.56);
  });
  it("cobrado 0 vai simbólico (OS-0684)", () => {
    expect(valorRequisicaoOmie("0.00")).toBe(VALOR_SIMBOLICO);
    expect(valorRequisicaoOmie("0")).toBe(VALOR_SIMBOLICO);
  });
  it("cobrado vazio não vai para o Omie (OS-0824)", () => {
    expect(valorRequisicaoOmie(null)).toBeNull();
    expect(valorRequisicaoOmie("")).toBeNull();
    expect(valorRequisicaoOmie("  ")).toBeNull();
  });
});
