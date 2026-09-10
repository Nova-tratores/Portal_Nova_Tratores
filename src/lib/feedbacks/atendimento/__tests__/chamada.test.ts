import { describe, expect, it } from "vitest";
import {
  DESFECHOS, efeitosDoDesfecho, ehDataISO, hojeISO, mapearErroRpc, somarDias, validarEncerramento,
  PRAZO_RETORNO_PADRAO_DIAS,
} from "../chamada";

const agora = new Date(2026, 8, 10, 15, 0, 0); // 10/09/2026 15:00 local

describe("efeitosDoDesfecho (espelho da RPC, §5)", () => {
  it("servico_agendado / vendeu / recusou → concluido, oportunidade atendida", () => {
    for (const d of ["servico_agendado", "vendeu", "recusou"] as const) {
      const e = efeitosDoDesfecho(d, { agora });
      expect(e).toMatchObject({ status_atendimento: "concluido", proximo_contato_em: null, oportunidade: "atendida", marca_pendencia_cadastral: false });
    }
  });
  it("retornar → aberto com a data informada; oportunidade continua", () => {
    expect(efeitosDoDesfecho("retornar", { proximo_contato_em: "2026-10-01", agora })).toMatchObject({ status_atendimento: "aberto", proximo_contato_em: "2026-10-01", oportunidade: "continua_aberta" });
  });
  it("numero_errado → aberto + pendência cadastral", () => {
    expect(efeitosDoDesfecho("numero_errado", { agora })).toMatchObject({ status_atendimento: "aberto", proximo_contato_em: null, marca_pendencia_cadastral: true, oportunidade: "continua_aberta" });
  });
  it("sem_resposta → sem_resposta com retorno em +30 d por padrão", () => {
    const e = efeitosDoDesfecho("sem_resposta", { aberto_em: "2026-09-01T10:00:00Z", agora });
    expect(e.status_atendimento).toBe("sem_resposta");
    expect(e.proximo_contato_em).toBe(somarDias(hojeISO(agora), PRAZO_RETORNO_PADRAO_DIAS));
    expect(e.regra_24h_aplicada).toBe(false);
  });
  it("regra das 24 h: registro aberto há menos de 24 h NÃO vira sem_resposta (fica aberto, com retorno)", () => {
    const e = efeitosDoDesfecho("sem_resposta", { aberto_em: new Date(agora.getTime() - 3 * 3600 * 1000).toISOString(), agora });
    expect(e.status_atendimento).toBe("aberto");
    expect(e.regra_24h_aplicada).toBe(true);
    expect(e.proximo_contato_em).not.toBeNull();
  });
  it("sem_resposta respeita a data informada", () => {
    expect(efeitosDoDesfecho("sem_resposta", { proximo_contato_em: "2026-12-24", agora }).proximo_contato_em).toBe("2026-12-24");
  });
});

describe("validarEncerramento", () => {
  it("exige desfecho", () => {
    expect(validarEncerramento({})).toEqual(["Escolha como terminou a ligação."]);
  });
  it("recusou exige motivo; retornar exige data; datas inválidas acusam", () => {
    const sem = { termometros: false };
    expect(validarEncerramento({ desfecho: "recusou" }, sem)).toEqual(["Diga o motivo da recusa."]);
    expect(validarEncerramento({ desfecho: "recusou", motivo_negativa_id: 2 }, sem)).toEqual([]);
    expect(validarEncerramento({ desfecho: "retornar" }, sem)).toEqual(["Informe a data para ligar de novo."]);
    expect(validarEncerramento({ desfecho: "retornar", proximo_contato_em: "2026-13-40" }, sem)).toContain("Informe a data para ligar de novo.");
    expect(validarEncerramento({ desfecho: "servico_agendado", servico_previsto_em: "10/09/2026" }, sem)).toEqual(["Data prevista do serviço inválida."]);
    expect(validarEncerramento({ desfecho: "sem_resposta" })).toEqual([]);
  });
  it("Fase 2: termômetros obrigatórios quando houve conversa; dispensados em não atendeu / número errado", () => {
    expect(validarEncerramento({ desfecho: "vendeu" })).toEqual(["Marque como o cliente estava (humor).", "Marque como foi a conversa (qualidade)."]);
    expect(validarEncerramento({ desfecho: "vendeu", humor_cliente: 4, qualidade_conversa: 5 })).toEqual([]);
    expect(validarEncerramento({ desfecho: "vendeu", humor_cliente: 0, qualidade_conversa: 6 })).toHaveLength(2);
    expect(validarEncerramento({ desfecho: "sem_resposta" })).toEqual([]);
    expect(validarEncerramento({ desfecho: "numero_errado" })).toEqual([]);
    expect(validarEncerramento({ desfecho: "recusou", motivo_negativa_id: 1, humor_cliente: 2, qualidade_conversa: 3 })).toEqual([]);
  });
  it("catálogo tem os 6 desfechos da RPC", () => {
    expect(DESFECHOS.map((d) => d.valor).sort()).toEqual(["numero_errado", "recusou", "retornar", "sem_resposta", "servico_agendado", "vendeu"]);
  });
});

describe("datas", () => {
  it("ehDataISO / somarDias / hojeISO", () => {
    expect(ehDataISO("2026-02-28")).toBe(true);
    expect(ehDataISO("2026-2-8")).toBe(false);
    expect(somarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(somarDias("2026-12-20", 30)).toBe("2027-01-19");
    expect(hojeISO(agora)).toBe("2026-09-10");
  });
});

describe("mapearErroRpc", () => {
  it("conflito EM_ATENDIMENTO_POR → 409 com o nome", () => {
    expect(mapearErroRpc("EM_ATENDIMENTO_POR:Ana Carolina")).toEqual({ http: 409, codigo: "EM_ATENDIMENTO_POR", mensagem: "Este cliente já está em ligação com Ana Carolina.", detalhe: "Ana Carolina" });
  });
  it("idempotência: já encerrada com outro desfecho → 409; validações → 400; não achou → 404", () => {
    expect(mapearErroRpc("JA_ENCERRADA_COM_OUTRO_DESFECHO:vendeu").http).toBe(409);
    expect(mapearErroRpc("MOTIVO_OBRIGATORIO").http).toBe(400);
    expect(mapearErroRpc("PROXIMO_CONTATO_OBRIGATORIO").http).toBe(400);
    expect(mapearErroRpc("CHAMADA_NAO_ENCONTRADA").http).toBe(404);
    expect(mapearErroRpc("CHAMADA_DE_OUTRO_ATENDENTE:Zé").http).toBe(403);
    expect(mapearErroRpc("TEM_NOTAS").http).toBe(409);
  });
  it("erro desconhecido → 500 genérico com detalhe", () => {
    expect(mapearErroRpc("connection reset")).toMatchObject({ http: 500, codigo: "ERRO", detalhe: "connection reset" });
    expect(mapearErroRpc(null).http).toBe(500);
  });
});
