import { describe, expect, it } from "vitest";
import { grupoProntoParaConcluir } from "../grupos";

describe("grupoProntoParaConcluir", () => {
  it("todas no financeiro → pronto", () => expect(grupoProntoParaConcluir(["financeiro", "financeiro"])).toBe(true));
  it("alguma em aberto → não", () => expect(grupoProntoParaConcluir(["financeiro", "aguardando"])).toBe(false));
  it("lixeira não conta e FINANCEIRO maiúsculo vale", () => expect(grupoProntoParaConcluir(["FINANCEIRO", "lixeira"])).toBe(true));
  it("vazio ou só lixeira → não", () => {
    expect(grupoProntoParaConcluir([])).toBe(false);
    expect(grupoProntoParaConcluir(["lixeira"])).toBe(false);
  });
});

import { resumoGrupo } from "../grupos";
import { cnpjValido, cpfValido, extrairCnpjs, ordenarCandidatos, parecenca, type CandidatoCnpj } from "../cnpj-busca";

describe("resumoGrupo", () => {
  const num = (v: unknown) => Number(String(v ?? "").replace(".", "").replace(",", "."));
  it("soma valor, conta fases e ignora lixeira", () => {
    const r = resumoGrupo([
      { id: 1, status: "financeiro", valor_despeza: "100,50" },
      { id: 2, status: "pedido", valor_despeza: "1.000,00" },
      { id: 3, status: "lixeira", valor_despeza: "999,00" },
    ], num);
    expect(r.qtd).toBe(2);
    expect(r.naLixeira).toBe(1);
    expect(r.total).toBeCloseTo(1100.5);
    expect(r.porFase).toEqual({ financeiro: 1, pedido: 1 });
    expect(r.pct).toBe(50);
    expect(r.pronto).toBe(false);
  });
  it("grupo vazio", () => expect(resumoGrupo([], num)).toMatchObject({ qtd: 0, pct: 0, pronto: false }));
});

describe("cnpj-busca", () => {
  it("valida dígito do CNPJ e do CPF", () => {
    expect(cnpjValido("21.632.057/0001-83")).toBe(true);
    expect(cnpjValido("21.632.057/0001-84")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
  });
  it("tira os CNPJs do texto, o mais citado primeiro, sem os inválidos", () => {
    const t = "cnpj.biz/61038683000160 ... 21.632.057/0001-83 x 21632057000183 y 21.632.057/0001-83 z 12345678000100 tel 1433511234";
    expect(extrairCnpjs(t)).toEqual(["21632057000183", "61038683000160"]);
  });
  it("parecença e ordem: ativa e parecida primeiro", () => {
    expect(parecenca("Auto Peças Martins", "AUTO PECAS MARTINS DE PIRAJU LTDA")).toBe(1);
    const base = { nome_fantasia: "", cidade: "", uf: "", atividade: "", abertura: "", telefone: "", email: "", cep: "", endereco: "", numero: "", bairro: "" };
    const l: CandidatoCnpj[] = [
      { ...base, cnpj: "1", razao_social: "SERGIO AUTO PECAS", situacao: "ATIVA" },
      { ...base, cnpj: "2", razao_social: "AUTO PECAS MARTINS", situacao: "BAIXADA" },
      { ...base, cnpj: "3", razao_social: "AUTO PECAS MARTINS DE PIRAJU", situacao: "ATIVA" },
    ];
    expect(ordenarCandidatos("auto pecas martins", l).map((c) => c.cnpj)).toEqual(["3", "1", "2"]);
  });
});
