import { describe, it, expect } from "vitest";
import { compararItens, compararCampo, compararDepartamentos, compararParcelas, textoNormal } from "../conferencia";

describe("conferência portal × Omie", () => {
  it("itens iguais não geram divergência", () => {
    const l = [{ chave: "1", rotulo: "Hora", qtde: 2, unit: 200, desconto: 0 }];
    expect(compararItens("OS-1", l, l)).toEqual([]);
  });
  it("acha quantidade, valor, desconto, falta e sobra", () => {
    const d = compararItens("OS-1",
      [{ chave: "hr", rotulo: "Hora", qtde: 3, unit: 200, desconto: 50 }, { chave: "km", rotulo: "KM", qtde: 10, unit: 3.6, desconto: 0 }],
      [{ chave: "hr", rotulo: "Hora", qtde: 2, unit: 180, desconto: 0 }, { chave: "x", rotulo: "Outro", qtde: 1, unit: 5, desconto: 0 }]);
    expect(d.map((x) => x.campo)).toEqual(["item:hr:qtde", "item:hr:unit", "item:hr:desconto", "item:km:falta", "item:x:sobra"]);
  });
  it("mesma chave repetida casa pela descrição", () => {
    const d = compararItens("OS-1",
      [{ chave: "div", rotulo: "Diversos", qtde: 1, unit: 10, desconto: 0, descricao: "B" }, { chave: "div", rotulo: "Diversos", qtde: 1, unit: 20, desconto: 0, descricao: "A" }],
      [{ chave: "div", rotulo: "Diversos", qtde: 1, unit: 20, desconto: 0, descricao: "A" }, { chave: "div", rotulo: "Diversos", qtde: 1, unit: 10, desconto: 0, descricao: "B" }]);
    expect(d).toEqual([]);
  });
  it("texto ignora quebra de linha e | do Omie", () => {
    expect(textoNormal("Modelo: 6075\nChassis: X")).toBe(textoNormal("Modelo: 6075|Chassis: X"));
  });
  it("campo vazio no portal não confere", () => {
    expect(compararCampo("OS-1", "c", "Categoria", "", "1.01.02")).toBeNull();
    expect(compararCampo("OS-1", "c", "Categoria", "1.01.02", "1.01.02")).toBeNull();
    expect(compararCampo("OS-1", "c", "Categoria", "1.01.03", "1.01.02")?.omie).toBe("1.01.02");
  });
  it("departamentos e parcelas", () => {
    expect(compararDepartamentos("OS-1", { a: 100 }, { a: 100 }, (c) => c)).toBeNull();
    expect(compararDepartamentos("OS-1", { a: 50, b: 50 }, { a: 100 }, (c) => c)?.campo).toBe("departamentos");
    expect(compararParcelas("P", [{ venc: "13/11/2026", valor: 100 }], [{ venc: "13/11/2026", valor: 100 }])).toBeNull();
    expect(compararParcelas("P", [{ venc: "13/11/2026", valor: 100 }], [{ venc: "14/11/2026", valor: 100 }])?.campo).toBe("parcelas");
  });
});
