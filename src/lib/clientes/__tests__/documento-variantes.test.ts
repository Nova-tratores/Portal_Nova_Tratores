import { describe, it, expect } from "vitest";
import { variantesDocumento } from "../documento-variantes";

describe("variantesDocumento", () => {
  it("CPF: formatado + dígitos", () => {
    expect(variantesDocumento("07869892971")).toEqual(["078.698.929-71", "07869892971"]);
    expect(variantesDocumento("078.698.929-71")).toEqual(["078.698.929-71", "07869892971"]);
  });
  it("CNPJ: formatado + dígitos", () => {
    expect(variantesDocumento("08000359000170")).toEqual(["08.000.359/0001-70", "08000359000170"]);
  });
  it("tamanho estranho ou vazio", () => {
    expect(variantesDocumento("1234")).toEqual(["1234"]);
    expect(variantesDocumento("")).toEqual([]);
    expect(variantesDocumento(null)).toEqual([]);
  });
});
