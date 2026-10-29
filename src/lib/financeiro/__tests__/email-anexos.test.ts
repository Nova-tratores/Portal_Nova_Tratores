import { describe, expect, it } from "vitest";
import { LIMITE_TOTAL_BYTES, nomeSeguro, validarAnexos } from "../email-anexos";

describe("nomeSeguro", () => {
  it("tira acento, barra e caractere estranho, mantém extensão", () => {
    expect(nomeSeguro("Apresentação Nova/Tratores.pdf")).toBe("Apresentacao Nova-Tratores.pdf");
    expect(nomeSeguro("dados#bancários?.pdf")).toBe("dados_bancarios_.pdf");
  });
  it("vazio ou só pontos vira 'arquivo'", () => {
    expect(nomeSeguro("")).toBe("arquivo");
    expect(nomeSeguro("...")).toBe("arquivo");
  });
});

describe("validarAnexos", () => {
  it("aceita dentro do limite", () => {
    expect(validarAnexos([{ nome: "a.pdf", tamanho: 1000 }])).toBeNull();
  });
  it("recusa total acima do teto", () => {
    expect(validarAnexos([{ nome: "a", tamanho: LIMITE_TOTAL_BYTES }, { nome: "b", tamanho: 1 }])).toMatch(/limite/);
  });
  it("recusa arquivo vazio e mais de 10", () => {
    expect(validarAnexos([{ nome: "x.txt", tamanho: 0 }])).toMatch(/vazio/);
    expect(validarAnexos(Array.from({ length: 11 }, (_, i) => ({ nome: `${i}`, tamanho: 1 })))).toMatch(/máximo/);
  });
});
