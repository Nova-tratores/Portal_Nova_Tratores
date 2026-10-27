import { describe, it, expect } from "vitest";
import { conferirPrecos, contaDoItemPPV, contaDaLinha, precoDifere, temAlerta, type PrecoCadastro, type CustoCadastro } from "../conferencia-precos";

// Caso real: PPV-0542 / OS-0846 (22/10/2026). Preços no PPV = os antigos; cadastro = Omie das 13h.
const cadastro: PrecoCadastro[] = [
  { codigo: "RA-1188002200611", conta: "NOVA", preco: 75 },
  { codigo: "RA-1357002700011", conta: "NOVA", preco: 850 },
  { codigo: "RA-2098310073", conta: "NOVA", preco: 3538 },
  { codigo: "RA-114921P", conta: "NOVA", preco: 380 },
  { codigo: "827265", conta: "CASTRO", preco: 60 },
  { codigo: "827265", conta: "NOVA", preco: 60 },
];
const custos: CustoCadastro[] = [
  { codigo: "RA-114921P", conta: "NOVA", cmc: 194.3686 },
  { codigo: "827265", conta: "NOVA", cmc: 35 },
  { codigo: "RA-2098310073", conta: "NOVA", cmc: 2131.32 },
];

describe("conferirPrecos", () => {
  it("acusa os itens com o preço antigo e soma a diferença", () => {
    const r = conferirPrecos([
      { codigo: "RA-1188002200611", preco: 50, quantidade: 2, conta: "NOVA" },
      { codigo: "RA-1357002700011", preco: 200, quantidade: 1, conta: "NOVA" },
      { codigo: "RA-114921P", preco: 380, quantidade: 2, conta: "NOVA" },
    ], cadastro, custos);
    expect(r.itens.map((i) => i.avisos.includes("diferente_cadastro"))).toEqual([true, true, false]);
    expect(r.resumo.diferentes).toBe(2);
    expect(r.resumo.diferencaTotal).toBe(700); // (75−50)×2 + (850−200)
    expect(temAlerta(r.resumo)).toBe(true);
  });

  it("acusa abaixo do custo e calcula o prejuízo", () => {
    const r = conferirPrecos([{ codigo: "RA-2098310073", preco: 1000, quantidade: 1, conta: "NOVA" }], cadastro, custos);
    expect(r.itens[0].avisos).toEqual(["diferente_cadastro", "abaixo_custo"]);
    expect(r.itens[0].prejuizo).toBe(1131.32);
    expect(r.resumo.prejuizo).toBe(1131.32);
  });

  it("peça sem CMC (encomenda) fica 'sem_custo', sem alerta de custo", () => {
    const r = conferirPrecos([{ codigo: "RA-1188002200611", preco: 75, quantidade: 2 }], cadastro, custos);
    expect(r.itens[0].avisos).toEqual(["sem_custo"]);
    expect(temAlerta(r.resumo)).toBe(false);
  });

  it("tolera arredondamento de centavos do orçamento (849,94 × 850)", () => {
    expect(precoDifere(849.94, 850)).toBe(false);
    expect(precoDifere(33.4, 35)).toBe(true);
    expect(precoDifere(0.5, 0.52)).toBe(false); // mínimo de R$ 0,05
  });

  it("código fora do cadastro vira 'sem_cadastro'", () => {
    const r = conferirPrecos([{ codigo: "XYZ", preco: 10, quantidade: 1 }], cadastro, custos);
    expect(r.itens[0].avisos).toContain("sem_cadastro");
    expect(r.resumo.semCadastro).toBe(1);
  });

  it("escolhe a linha da conta do item; sem conta, a NOVA", () => {
    const cad: PrecoCadastro[] = [{ codigo: "A1", conta: "CASTRO", preco: 90 }, { codigo: "A1", conta: "NOVA", preco: 100 }];
    expect(conferirPrecos([{ codigo: "a1", preco: 90, quantidade: 1, conta: "CASTRO" }], cad, []).itens[0].precoCadastro).toBe(90);
    expect(conferirPrecos([{ codigo: "A1", preco: 90, quantidade: 1 }], cad, []).itens[0].precoCadastro).toBe(100);
    // só existe na outra conta: usa a que houver em vez de "sem cadastro"
    expect(conferirPrecos([{ codigo: "827265", preco: 60, quantidade: 1, conta: "CASTRO" }], [cadastro[5]], []).itens[0].precoCadastro).toBe(60);
  });

  it("ignora linhas sem código", () => {
    expect(conferirPrecos([{ codigo: " ", preco: 1, quantidade: 1 }], cadastro, custos).itens).toHaveLength(0);
  });
});

describe("conta", () => {
  it("do item do PPV e da linha do cadastro", () => {
    expect(contaDoItemPPV("Primario")).toBe("CASTRO");
    expect(contaDoItemPPV("Nova Tratores")).toBe("NOVA");
    expect(contaDaLinha("NOVA", "")).toBe("NOVA");
    expect(contaDaLinha(null, "Castro Peças")).toBe("CASTRO");
  });
});
