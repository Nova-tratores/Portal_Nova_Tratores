import { describe, expect, it } from "vitest";
import { emailEhInterno, faltandoNoCadastro } from "@/lib/feedbacks/oportunidades/r8-puro";
import { AREAS_PADRAO, lerAreas, regrasDaFuncao } from "../areas";

describe("R8 — faltandoNoCadastro", () => {
  it("telefone vazio, e-mail vazio, e-mail interno", () => {
    expect(faltandoNoCadastro({ telefone: "", email: "" })).toEqual(["telefone", "email"]);
    expect(faltandoNoCadastro({ telefone: "( ) -", email: "cliente@fazenda.com" })).toEqual(["telefone"]);
    expect(faltandoNoCadastro({ telefone: "(14) 99999-0000", email: "rodrigo.novatratores@gmail.com" })).toEqual(["email_interno"]);
    expect(faltandoNoCadastro({ telefone: "(14) 99999-0000", email: "qualquer@novatratores.com.br" })).toEqual(["email_interno"]);
    expect(faltandoNoCadastro({ telefone: "(14) 99999-0000", email: "Cliente@Fazenda.com" })).toEqual([]);
  });
  it("lista de internos vem da config", () => {
    expect(emailEhInterno("x@y.com", { emails_internos: ["x@y.com"], dominios_internos: [] })).toBe(true);
    expect(emailEhInterno("rodrigo.novatratores@gmail.com", { emails_internos: [], dominios_internos: [] })).toBe(false);
    expect(emailEhInterno(null)).toBe(false);
  });
});

describe("Minha área", () => {
  it("casa a função por 'contém', sem acento/caixa", () => {
    expect(regrasDaFuncao("Pós-Vendas")?.area).toBe("Pós-Vendas");
    expect(regrasDaFuncao("pecas")?.regras).toEqual(["R5_pecas", "R8_cadastro"]);
    expect(regrasDaFuncao("Vendedor Comercial")?.area).toBe("Comercial");
    expect(regrasDaFuncao("Diretoria")).toBeNull();
    // "Pós-Vendas" contém "Vendas": vence a chave mais específica, em qualquer ordem
    expect(regrasDaFuncao("Pós-Vendas", { Vendas: ["R3_upsell"], "Pós-Vendas": ["R1_revisao"] })?.area).toBe("Pós-Vendas");
    expect(regrasDaFuncao("Pós-Vendas", { "Pós-Vendas": ["R1_revisao"], Vendas: ["R3_upsell"] })?.area).toBe("Pós-Vendas");
    expect(regrasDaFuncao("")).toBeNull();
  });
  it("lerAreas ignora regras inválidas e cai no padrão se vazio", () => {
    expect(lerAreas({ Peças: ["R5_pecas", "R99"] })).toEqual({ Peças: ["R5_pecas"] });
    expect(lerAreas(null)).toBe(AREAS_PADRAO);
    expect(lerAreas({})).toBe(AREAS_PADRAO);
  });
});
