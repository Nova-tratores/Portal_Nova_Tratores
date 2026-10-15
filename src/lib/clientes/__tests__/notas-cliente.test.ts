import { describe, expect, it } from "vitest";
import { chassiDoProjeto, chassisDosProjetos, mascararDoc, motivoDaNota } from "../notas-cliente";

describe("notas na Pasta Clientes", () => {
  it("mascara CNPJ e CPF como nos projetos do Omie", () => {
    expect(mascararDoc("31463139000103")).toBe("31.463.139/0001-03");
    expect(mascararDoc("47400025821")).toBe("474.000.258-21");
  });

  it("chassi vem da coluna ou do fim do nome do projeto", () => {
    expect(chassiDoProjeto({ chassis: "MDI09524CN0002490" })).toBe("MDI09524CN0002490");
    expect(chassiDoProjeto({ nome: "6075 MDI07502AN0002581" })).toBe("MDI07502AN0002581");
    expect(chassiDoProjeto({ nome: "ORION TARGET T600 23277" })).toBeNull(); // "23277" curto demais
    expect(chassiDoProjeto({ nome: "Compras Anteriores" })).toBeNull();
    expect(chassisDosProjetos([{ chassis: "ABC1234567" }, { nome: "X ABC1234567" }])).toEqual(["ABC1234567"]);
  });

  it("nota entra pelo CNPJ do cliente ou pelo chassi da máquina", () => {
    expect(motivoDaNota({ parte_doc: "31463139000103" }, "31.463.139/0001-03", [])).toEqual({ via: "cliente" });
    expect(motivoDaNota({ parte_doc: "1", maquina: "6075 | MDI07502AN0002581" }, "2", ["MDI07502AN0002581"])).toEqual({ via: "maquina", chassi: "MDI07502AN0002581" });
    expect(motivoDaNota({ parte_doc: "1", maquina: "OUTRA" }, "2", ["MDI07502AN0002581"])).toBeNull();
  });
});
