import { describe, expect, it } from "vitest";
import { abaDaRota, abasVisiveis, destinoAntigo, gruposDaUrl, podeSegmento, segmentoDaRota, urlDoGrupo, type Pode } from "../telas";

/** pode() igual ao do portal: módulo inteiro libera tudo; senão só a ação listada. */
const quem = (perms: string[]): Pode => (modulo, acao) =>
  perms.includes(modulo) || (acao ? perms.includes(`${modulo}:${acao}`) : perms.some((p) => p.startsWith(`${modulo}:`)));

describe("telas do Feedbacks", () => {
  it("segmento da rota", () => {
    expect(segmentoDaRota("/feedbacks")).toBe("");
    expect(segmentoDaRota("/feedbacks/")).toBe("");
    expect(segmentoDaRota("/feedbacks/painel")).toBe("painel");
    expect(segmentoDaRota("/feedbacks/atendimento/omie_1")).toBe("atendimento");
    expect(segmentoDaRota("/feedbacks/crm/teste/hoje")).toBe("crm");
  });

  it("Hoje abre para quem tinha CRM, RFM, Atendimento ou Agenda", () => {
    for (const p of ["feedbacks:crm", "feedbacks:rfm", "feedbacks:atendimento", "feedbacks:agenda", "feedbacks"]) {
      expect(podeSegmento(quem([p]), ""), p).toBe(true);
    }
    expect(podeSegmento(quem(["feedbacks:relatorios"]), "")).toBe(false);
  });

  it("Clientes, Painel e Robô usam as chaves antigas", () => {
    expect(podeSegmento(quem(["feedbacks:clientes"]), "clientes")).toBe(true);
    expect(podeSegmento(quem(["feedbacks:atendimento"]), "clientes")).toBe(true);
    expect(podeSegmento(quem(["feedbacks:crm"]), "clientes")).toBe(false);
    expect(podeSegmento(quem(["feedbacks:relatorios"]), "painel")).toBe(true);
    expect(podeSegmento(quem(["feedbacks:crm"]), "painel")).toBe(false);
    expect(podeSegmento(quem(["feedbacks:oportunidades"]), "robo")).toBe(true);
    expect(podeSegmento(quem(["feedbacks:rfm"]), "robo")).toBe(false);
  });

  it("o cockpit continua pedindo atendimento", () => {
    expect(podeSegmento(quem(["feedbacks:crm"]), "atendimento")).toBe(false);
    expect(podeSegmento(quem(["feedbacks:atendimento"]), "atendimento")).toBe(true);
  });

  it("segmento desconhecido cai no pode() de sempre", () => {
    expect(podeSegmento(quem(["feedbacks:outra"]), "outra")).toBe(true);
    expect(podeSegmento(quem(["feedbacks:crm"]), "outra")).toBe(false);
  });

  it("abas visíveis", () => {
    expect(abasVisiveis(quem(["feedbacks"])).map((a) => a.id)).toEqual(["hoje", "clientes", "painel", "robo"]);
    expect(abasVisiveis(quem(["feedbacks:crm", "feedbacks:oportunidades"])).map((a) => a.id)).toEqual(["hoje", "robo"]);
  });

  it("aba ativa pela URL", () => {
    expect(abaDaRota("/feedbacks")).toBe("hoje");
    expect(abaDaRota("/feedbacks/atendimento/omie_9")).toBe("hoje");
    expect(abaDaRota("/feedbacks/relatorios")).toBe("painel");
    expect(abaDaRota("/feedbacks/robo")).toBe("robo");
    expect(abaDaRota("/feedbacks/clientes")).toBe("clientes");
  });

  it("motivo pela URL", () => {
    expect(gruposDaUrl("pos")).toEqual(["pos_servico"]);
    expect(gruposDaUrl("rfm,retorno,xx,rfm")).toEqual(["reativacao", "retornos"]);
    expect(gruposDaUrl(null)).toEqual([]);
    expect(urlDoGrupo("revisoes")).toBe("/feedbacks?motivo=revisao");
  });

  it("rotas antigas levam para as novas", () => {
    expect(destinoAntigo("crm")).toBe("/feedbacks?motivo=pos");
    expect(destinoAntigo("crm", { id: "123" })).toBe("/feedbacks?motivo=pos&id=123");
    expect(destinoAntigo("rfm")).toBe("/feedbacks?motivo=rfm");
    expect(destinoAntigo("agenda")).toBe("/feedbacks?motivo=retorno");
    expect(destinoAntigo("atendimento")).toBe("/feedbacks");
    expect(destinoAntigo("atendimento", { cliente: "omie_1" })).toBe("/feedbacks?cliente=omie_1");
    expect(destinoAntigo("relatorios")).toBe("/feedbacks/painel");
    expect(destinoAntigo("oportunidades", { regra: "R5_pecas" })).toBe("/feedbacks/robo?regra=R5_pecas");
  });
});
