import { describe, it, expect } from "vitest";
import { diasDoNumParcelas, rotuloNumParcelas, numParcelasDaOS, categoriaPPVPelaOS } from "../parcelas-condicao";

describe("número de parcelas do PPV", () => {
  it("opções antigas continuam iguais", () => {
    expect(diasDoNumParcelas("30 dias")).toEqual([30]);
    expect(diasDoNumParcelas("30/60/90 dias")).toEqual([30, 60, 90]);
    expect(diasDoNumParcelas("À vista (PIX ou Cartão)")).toEqual([0]);
    expect(diasDoNumParcelas("")).toEqual([30]);
  });
  it("condição do Omie vinda da OS", () => {
    expect(diasDoNumParcelas("omie:A30|Para 30 dias (C)|")).toEqual([30]);
    expect(diasDoNumParcelas("omie:000|A Vista|")).toEqual([0]);
    expect(diasDoNumParcelas("omie:999|Informar o número de parcelas|3")).toEqual([30, 60, 90]);
    expect(rotuloNumParcelas("omie:A30|Para 30 dias (C)|")).toBe("Para 30 dias (C)");
    expect(rotuloNumParcelas("omie:999|Informar|3")).toBe("Informar (3x)");
  });
  it("datas editadas na OS viram dias", () => {
    const v = numParcelasDaOS({ condicao: "A30", parcelas: [{ n: 1, dias: 15, venc: "", valor: 1 }, { n: 2, dias: 45, venc: "", valor: 1 }] });
    expect(v.startsWith("dias:15,45|")).toBe(true);
    expect(diasDoNumParcelas(v)).toEqual([15, 45]);
    expect(rotuloNumParcelas(v)).toBe("2 parcelas da OS (15/45 dias)");
  });
  it("sem datas à mão, leva a condição", () => {
    expect(numParcelasDaOS({ condicao: "999", condicaoNome: "Informar", condicaoQtd: 4, parcelas: [] })).toBe("omie:999|Informar|4");
  });
});

describe("categoria do PPV com OS", () => {
  it("revisão → Revenda de Peças Revisão; resto → Serviços Prestados", () => {
    expect(categoriaPPVPelaOS("Revisão")).toBe("1.01.94");
    expect(categoriaPPVPelaOS("revisao")).toBe("1.01.94");
    expect(categoriaPPVPelaOS("Manutenção")).toBe("1.01.99");
    expect(categoriaPPVPelaOS("")).toBe("1.01.99");
  });
});
