import { describe, expect, it } from "vitest";
import { dadosDoContexto, montarRoteiro, nomeBonito, resolverTemplate, type Script } from "../roteiro";
import { CONFIG_RETORNO_PADRAO, lerConfigRetorno, sugerirCaveira, sugerirRetorno } from "../retorno";
import type { ContextoAtendimento } from "../contexto";

describe("resolverTemplate", () => {
  it("substitui variáveis conhecidas e usa fallback nas que faltam — nunca deixa {x}", () => {
    const r = resolverTemplate("Bom dia, {nome}! Aqui é {atendente}. Vamos falar do {trator}.", { nome: "Laerte", atendente: "Henri" });
    expect(r.texto).toBe("Bom dia, Laerte! Aqui é Henri. Vamos falar do seu trator.");
    expect(r.faltando).toEqual(["trator"]);
    expect(r.texto).not.toMatch(/\{/);
  });
  it("remove variável desconhecida e limpa espaços/pontuação", () => {
    const r = resolverTemplate("Olá {nome} , tudo bem {xyz} ?", { nome: "Ana" });
    expect(r.texto).toBe("Olá Ana, tudo bem?");
    expect(r.desconhecidas).toEqual(["xyz"]);
  });
});

describe("nomeBonito / dadosDoContexto", () => {
  it("Title Case com preposições", () => {
    expect(nomeBonito("LAERTE PELOSINI FILHO")).toBe("Laerte Pelosini Filho");
    expect(nomeBonito("maria DE souza")).toBe("Maria de Souza");
  });
  it("monta as variáveis a partir da ficha", () => {
    const ctx = {
      nome: "LAERTE PELOSINI FILHO",
      identidade: { nome: "LAERTE PELOSINI FILHO" },
      maquinas: [{ modelo: "JIVO 245", chassi: "ABC", ultima_revisao: { rotulo: "300h", data: "2025-08-28", horimetro: 279 }, proxima_revisao: { horas: 600, data_estimada: "2028-04-22", atrasada: false } }],
      servicos: [{ data: "2024-07-27", descricao: "REVISAO 50H · troca de óleo" }],
      atendimentos: [{ data: "2026-06-12" }],
    } as unknown as ContextoAtendimento;
    const d = dadosDoContexto(ctx, "HENRI IRNEH");
    expect(d.nome).toBe("Laerte Pelosini Filho");
    expect(d.primeiro_nome).toBe("Laerte");
    expect(d.trator).toBe("JIVO 245 · ABC");
    expect(d.horimetro).toBe("279 h");
    expect(d.proxima_revisao).toBe("600 h (prevista para 22/04/2028)");
    expect(d.ultima_os_data).toBe("27/07/2024");
    expect(d.ultima_os_desc).toBe("REVISAO 50H · troca de óleo");
    expect(Number(d.dias_sem_contato)).toBeGreaterThan(0);
    expect(d.atendente).toBe("Henri");
  });
  it("ficha vazia → só o atendente", () => {
    expect(dadosDoContexto(null, "Ana")).toEqual({ atendente: "Ana" });
  });
});

describe("montarRoteiro", () => {
  const scripts: Script[] = [
    { id: 1, regra: "geral", etapa: "apresentacao", titulo: "Abertura", template: "Oi {nome}", ordem: 0, versao: 1 },
    { id: 2, regra: "R1_revisao", etapa: "argumentacao", titulo: "Revisão", template: "Revisão de {proxima_revisao}", ordem: 0, versao: 1 },
    { id: 3, regra: "R5_pecas", etapa: "argumentacao", titulo: "Peças", template: "Kit pro {trator}", ordem: 0, versao: 1 },
    { id: 4, regra: "geral", etapa: "objecao", titulo: "Sem tempo", template: "Quando ligo?", ordem: 0, versao: 1 },
  ];
  it("geral sempre; argumentação só das regras presentes", () => {
    const r = montarRoteiro(scripts, ["R5_pecas"], { nome: "Ana" });
    expect(r.map((e) => e.etapa)).toEqual(["apresentacao", "argumentacao", "objecao"]);
    expect(r[1].itens.map((i) => i.titulo)).toEqual(["Peças"]);
    expect(r[1].itens[0].texto).toBe("Kit pro seu trator");
    expect(r[1].itens[0].faltando).toEqual(["trator"]);
  });
  it("sem regra presente → todas as argumentações como referência", () => {
    const r = montarRoteiro(scripts, [], {});
    expect(r[1].itens).toHaveLength(2);
  });
});

describe("retorno por humor", () => {
  const agora = new Date(2026, 8, 10);
  it("config lê parâmetros com defaults", () => {
    expect(lerConfigRetorno(null)).toEqual(CONFIG_RETORNO_PADRAO);
    expect(lerConfigRetorno({ retorno_dias_padrao: 45, humor_baixo_max: "x" })).toMatchObject({ retorno_dias_padrao: 45, humor_baixo_max: 2 });
  });
  it("sem_resposta → padrão 30 d; retornar → 7 d, ou 90 d se humor baixo", () => {
    expect(sugerirRetorno("sem_resposta", 4, undefined, agora)).toMatchObject({ dias: 30, data: "2026-10-10", humor_baixo: false });
    expect(sugerirRetorno("retornar", 4, undefined, agora)).toMatchObject({ dias: 7, data: "2026-09-17" });
    expect(sugerirRetorno("retornar", 2, undefined, agora)).toMatchObject({ dias: 90, data: "2026-12-09", humor_baixo: true });
  });
  it("desfechos concluídos não têm retorno, mas marcam humor baixo para sugerir a tag", () => {
    expect(sugerirRetorno("vendeu", 1, undefined, agora)).toEqual({ dias: null, data: null, motivo: "", humor_baixo: true });
    expect(sugerirRetorno("recusou", 5, undefined, agora).humor_baixo).toBe(false);
  });
  it("sugerir caveira só com humor 1 duas vezes seguidas (atual + anterior)", () => {
    expect(sugerirCaveira([1, 3], 1)).toBe(true);
    expect(sugerirCaveira([3, 1], 1)).toBe(false);
    expect(sugerirCaveira([], 1)).toBe(false);
    expect(sugerirCaveira([1, 1], 2)).toBe(false);
    expect(sugerirCaveira([1, 1, 1], 1, { ...CONFIG_RETORNO_PADRAO, sugerir_caveira_apos: 3 })).toBe(true);
  });
});
