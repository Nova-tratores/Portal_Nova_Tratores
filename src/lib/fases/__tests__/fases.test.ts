import { describe, expect, it } from "vitest";
import { FASES, faseDoPPVNaTela, faseParaGravarNoPPV, podeRenomearFases, rotuloDaFase, validarRotulo } from "../fases";
import { PHASES } from "@/lib/pos/constants";

describe("fases do POS e do PPV (29/10/2026)", () => {
  it("o PPV tem exatamente as fases do POS, na mesma ordem", () => {
    expect(FASES).toEqual(PHASES);
  });
  it("PPV de uma OS fica na fase atual da OS", () => {
    expect(faseDoPPVNaTela({ status: "Enviado Omie", osId: "OS-0842" }, "Cobrando Cliente")).toBe("Cobrando Cliente");
    // faturado antes da OS: continua na fase da OS (o cartão mostra o selo NF-e)
    expect(faseDoPPVNaTela({ status: "Concluída", osId: "OS-0842" }, "Cobrando Cliente")).toBe("Cobrando Cliente");
    expect(faseDoPPVNaTela({ status: "Orçamento", osId: "OS-0900" }, "Execução")).toBe("Execução");
  });
  it("PPV cancelado fica em Cancelada mesmo com a OS aberta", () => {
    expect(faseDoPPVNaTela({ status: "Cancelada", osId: "OS-1" }, "Execução")).toBe("Cancelada");
  });
  it("sem a fase da OS (ou balcão), usa a do PPV — 'Enviado Omie' vira a coluna do POS", () => {
    expect(faseDoPPVNaTela({ status: "Enviado Omie" }, null)).toBe("Enviado Para Omie");
    expect(faseDoPPVNaTela({ status: "Execução", osId: "OS-1" }, "")).toBe("Execução");
    expect(faseDoPPVNaTela({ status: "Cobrando Cliente" }, null)).toBe("Cobrando Cliente");
    expect(FASES).toContain(faseDoPPVNaTela({ status: "Enviado Omie" }, null));
  });
  it("balcão arrastado para 'Enviado Para Omie' grava o valor de sempre do PPV", () => {
    expect(faseParaGravarNoPPV("Enviado Para Omie")).toBe("Enviado Omie");
    expect(faseParaGravarNoPPV("Execução")).toBe("Execução");
  });
  it("nome do lápis vale nos dois quadros; sem nome, a própria fase", () => {
    expect(rotuloDaFase("Cobrando Cliente", { "Cobrando Cliente": "Aguardando pagamento" })).toBe("Aguardando pagamento");
    expect(rotuloDaFase("Execução", {})).toBe("Execução");
    expect(rotuloDaFase("Execução", { "Execução": "  " })).toBe("Execução");
  });
  it("validação do nome", () => {
    expect(validarRotulo("Execução", "Em campo")).toBeNull();
    expect(validarRotulo("Inventada", "x")).toMatch(/desconhecida/);
    expect(validarRotulo("Execução", "  ")).toMatch(/Escreva/);
    expect(validarRotulo("Execução", "x".repeat(61))).toMatch(/60/);
  });
  it("quem renomeia: pós-vendas ou admin", () => {
    expect(podeRenomearFases({ categoria: "Pós Vendas" })).toBe(true);
    expect(podeRenomearFases({ modulos: ["pos"] })).toBe(true);
    expect(podeRenomearFases({ isAdmin: true })).toBe(true);
    expect(podeRenomearFases({ categoria: "Comercial", modulos: ["ppv"] })).toBe(false);
  });
});
