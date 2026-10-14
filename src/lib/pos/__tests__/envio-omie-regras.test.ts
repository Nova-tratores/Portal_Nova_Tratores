import { describe, it, expect } from "vitest";
import { faltaParaEnviarOmie, camposEnvioOmie } from "../envio-omie-regras";
import { TEXT_TEMPLATE } from "../constants";

describe("faltaParaEnviarOmie", () => {
  it("modelo vazio falta os dois", () => {
    expect(faltaParaEnviarOmie(TEXT_TEMPLATE)).toEqual(["Solicitação do cliente", "Serviço Realizado"]);
    expect(faltaParaEnviarOmie(null)).toHaveLength(2);
  });
  it("só a solicitação preenchida", () => {
    expect(faltaParaEnviarOmie("Modelo: X\n\nSolicitação do cliente: barulho\nServiço Realizado: ")).toEqual(["Serviço Realizado"]);
  });
  it("serviço em várias linhas abaixo do rótulo vale", () => {
    const t = "Modelo: 6075\r\nSolicitação do cliente: revisão\r\nServiço Realizado:\r\n- troca de óleo\r\n- filtros";
    expect(faltaParaEnviarOmie(t)).toEqual([]);
    expect(camposEnvioOmie(t).servicoRealizado).toBe("- troca de óleo\n- filtros");
  });
  it("aceita sem acento", () => {
    expect(faltaParaEnviarOmie("Solicitacao do cliente: a\nServico realizado: b")).toEqual([]);
  });
});
