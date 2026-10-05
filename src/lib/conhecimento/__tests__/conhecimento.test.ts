import { describe, expect, it } from "vitest";
import { consultaTs, mdParaBlocos, normalizarBusca, sanitizarCorpo, slugify, textoDeBusca, textoPlano, trechos, urlSegura } from "../blocos";
import {
  aguardaAprovacao, artigosDaTela, casaTela, forcaDoCasamento, normalizarTela, podeEditar, podeLer, podePublicar, temModulo, validadePadrao, validarConteudo, vencido, type Quem,
} from "../artigos";
import { dividirGuia, moduloDaTela } from "../guia";

const quem = (p: Partial<Quem> = {}): Quem => ({ userId: "u1", isAdmin: false, modulos: [], categoria: null, ...p });

describe("blocos", () => {
  it("sanitiza: descarta tipo desconhecido, bloco vazio e url perigosa", () => {
    const corpo = sanitizarCorpo([
      { tipo: "p", texto: "  oi  " },
      { tipo: "p", texto: "" },
      { tipo: "script", texto: "x" },
      { tipo: "imagem", url: "javascript:alert(1)" },
      { tipo: "imagem", url: "https://x/y.png", legenda: "foto" },
      { tipo: "lista", itens: ["a", { texto: "b", sub: ["b1", ""] }, { texto: "" }] },
      { tipo: "tabela", colunas: ["A", "B"], linhas: [["1"], ["", ""], ["2", "3", "4"]] },
      { tipo: "aviso", texto: "cuidado", tom: "xpto" },
      "lixo",
    ]);
    expect(corpo).toEqual([
      { tipo: "p", texto: "oi" },
      { tipo: "imagem", url: "https://x/y.png", legenda: "foto" },
      { tipo: "lista", itens: [{ texto: "a" }, { texto: "b", sub: ["b1"] }] },
      { tipo: "tabela", colunas: ["A", "B"], linhas: [["1", ""], ["2", "3"]] },
      { tipo: "aviso", texto: "cuidado", tom: "info" },
    ]);
    expect(sanitizarCorpo("nada")).toEqual([]);
    expect(urlSegura("/manuais/a.pdf")).toBe("/manuais/a.pdf");
    expect(urlSegura("data:text/html,x")).toBe("");
  });

  it("texto plano e busca sem acento", () => {
    const corpo = sanitizarCorpo([{ tipo: "p", texto: "**Orçamento** enviado" }, { tipo: "passos", itens: [{ titulo: "Abrir a OS", dica: "use `F2`" }] }]);
    expect(textoPlano(corpo)).toBe("Orçamento enviado Abrir a OS use F2");
    expect(normalizarBusca("Orçamento  Enviado!")).toBe("orcamento enviado");
    expect(textoDeBusca("Fases", "Resumo", corpo, ["OS"])).toBe("fases resumo os orcamento enviado abrir a os use f2");
    expect(consultaTs("orç  env a")).toBe("orc:* & env:*");
    expect(consultaTs("  ")).toBe("");
    expect(slugify("Como a OS muda de fase?")).toBe("como-a-os-muda-de-fase");
  });

  it("trechos: negrito e código", () => {
    expect(trechos("a **b** c `d`")).toEqual([{ t: "txt", v: "a " }, { t: "b", v: "b" }, { t: "txt", v: " c " }, { t: "code", v: "d" }]);
    expect(trechos("simples")).toEqual([{ t: "txt", v: "simples" }]);
  });

  it("markdown → blocos: títulos, listas com sub-item, tabela, citação, código", () => {
    const md = [
      "## Título", "", "Um parágrafo", "em duas linhas.", "",
      "1. primeiro", "2. segundo", "",
      "- item A", "  - sub A1", "  - sub A2", "- item B", "  continua B", "",
      "| Col | Val |", "|---|---|", "| a | 1 |", "",
      "> atenção aqui", "",
      "```", "x = 1", "```",
    ].join("\n");
    expect(mdParaBlocos(md)).toEqual([
      { tipo: "titulo", texto: "Título" },
      { tipo: "p", texto: "Um parágrafo em duas linhas." },
      { tipo: "lista", itens: [{ texto: "primeiro" }, { texto: "segundo" }], ordenada: true },
      { tipo: "lista", itens: [{ texto: "item A", sub: ["sub A1", "sub A2"] }, { texto: "item B continua B" }] },
      { tipo: "tabela", colunas: ["Col", "Val"], linhas: [["a", "1"]] },
      { tipo: "aviso", texto: "atenção aqui", tom: "info" },
      { tipo: "codigo", texto: "x = 1" },
    ]);
  });
});

describe("tela ↔ artigo", () => {
  it("normaliza e casa por prefixo de segmento", () => {
    expect(normalizarTela("/pos/?x=1#y")).toBe("/pos");
    expect(normalizarTela("pos")).toBe("/pos");
    expect(forcaDoCasamento("/pos", "/pos")).toBeGreaterThan(forcaDoCasamento("/pos", "/pos/123"));
    expect(forcaDoCasamento("/pos", "/postos")).toBe(0);
    expect(casaTela(["/garantias", "/pos"], "/pos/abc")).toBe(true);
    expect(casaTela([], "/pos")).toBe(false);
  });

  it("ordena do mais específico ao mais geral, depois por ordem", () => {
    const arts = [
      { titulo: "Geral do POS 2", telas: ["/pos"], ordem: 20 },
      { titulo: "Geral do POS 1", telas: ["/pos"], ordem: 10 },
      { titulo: "Só do dashboard", telas: ["/pos/dashboard"], ordem: 99 },
      { titulo: "Outra tela", telas: ["/ppv"], ordem: 0 },
    ];
    expect(artigosDaTela(arts, "/pos/dashboard").map((a) => a.titulo)).toEqual(["Só do dashboard", "Geral do POS 1", "Geral do POS 2"]);
    expect(artigosDaTela(arts, "/pos").map((a) => a.titulo)).toEqual(["Geral do POS 1", "Geral do POS 2"]);
  });
});

describe("permissões", () => {
  const resp = { pos: "henri" };
  it("módulo: puro, ação granular, geral e admin", () => {
    expect(temModulo(quem({ modulos: ["pos"] }), "pos")).toBe(true);
    expect(temModulo(quem({ modulos: ["pos:mover_fase"] }), "pos")).toBe(true);
    expect(temModulo(quem({ modulos: ["postos"] }), "pos")).toBe(false);
    expect(temModulo(quem(), "geral")).toBe(true);
    expect(temModulo(quem({ isAdmin: true }), "qualquer")).toBe(true);
  });

  it("ler: só publicado, do módulo, e da categoria quando o artigo restringe", () => {
    const a = { status: "publicado" as const, modulo: "pos", publico: [] as string[] };
    expect(podeLer(a, quem({ modulos: ["pos"] }))).toBe(true);
    expect(podeLer(a, quem({ modulos: ["ppv"] }))).toBe(false);
    expect(podeLer({ ...a, status: "rascunho" }, quem({ isAdmin: true }))).toBe(false);
    const restrito = { ...a, publico: ["Pós Vendas"] };
    expect(podeLer(restrito, quem({ modulos: ["pos"], categoria: "Peças" }))).toBe(false);
    expect(podeLer(restrito, quem({ modulos: ["pos"], categoria: "Pós Vendas" }))).toBe(true);
    expect(podeLer(restrito, quem({ isAdmin: true }))).toBe(true);
  });

  it("editar e publicar: admin, ação do módulo conhecimento ou responsável do módulo", () => {
    expect(podeEditar(quem(), "pos", resp)).toBe(false);
    expect(podeEditar(quem({ userId: "henri" }), "pos", resp)).toBe(true);
    expect(podePublicar(quem({ userId: "henri" }), "pos", resp)).toBe(true);
    expect(podePublicar(quem({ userId: "henri" }), "ppv", resp)).toBe(false);
    expect(podeEditar(quem({ modulos: ["conhecimento:editar"] }), "ppv", resp)).toBe(true);
    expect(podePublicar(quem({ modulos: ["conhecimento:editar"] }), "ppv", resp)).toBe(false);
    expect(podePublicar(quem({ modulos: ["conhecimento"] }), "ppv", resp)).toBe(true);
    expect(podePublicar(quem({ isAdmin: true }), "ppv", {})).toBe(true);
  });
});

describe("conteúdo", () => {
  it("valida: título e corpo obrigatórios; normaliza telas, tags e ordem", () => {
    const r = validarConteudo({ titulo: " Fases ", resumo: " ", corpo: [{ tipo: "p", texto: "x" }], tipo: "nada", telas: ["pos/", "/pos", ""], tags: ["a", "a", " b "], ordem: "7.9" });
    expect(r.erros).toEqual([]);
    expect(r.conteudo).toMatchObject({ titulo: "Fases", resumo: null, tipo: "tela", telas: ["/pos"], tags: ["a", "b"], ordem: 7 });
    expect(validarConteudo({ titulo: "x", corpo: [] }).erros).toHaveLength(2);
    expect(validarConteudo(null).erros).toHaveLength(2);
  });

  it("aprovação pendente, validade", () => {
    expect(aguardaAprovacao({ status: "rascunho" })).toBe(true);
    expect(aguardaAprovacao({ status: "publicado", rascunho: null })).toBe(false);
    expect(aguardaAprovacao({ status: "publicado", tem_rascunho: true })).toBe(true);
    expect(vencido("2026-10-01", "2026-10-02")).toBe(true);
    expect(vencido("2026-10-02", "2026-10-02")).toBe(false);
    expect(vencido(null, "2026-10-02")).toBe(false);
    expect(validadePadrao(new Date(2026, 9, 2), 6)).toBe("2027-04-02");
  });
});

describe("dividirGuia", () => {
  const md = [
    "# Guia do Pós-Venda",
    "> intro que não entra",
    "",
    "## 1. OS — Ordem de Serviço (/pos)",
    "",
    "Texto solto antes do primeiro negrito.",
    "",
    "**Fases, na ordem do quadro** (nome exato do grupo):",
    "1. Orçamento",
    "2. Execução",
    "",
    "**Como a OS muda de fase**",
    "- Manual: pelo seletor.",
    "  - sub regra",
    "",
    "## 2. PPV — Pedido de Venda de peças (/ppv)",
    "**NFS-e**",
    "- O portal não emite.",
    "",
    "## Seção sem rota",
    "**Ignorado**",
    "- não entra",
  ].join("\n");

  it("uma tela por seção com rota; um artigo por linha em negrito", () => {
    const arts = dividirGuia(md);
    expect(arts.map((a) => [a.modulo, a.tela, a.titulo, a.ordem])).toEqual([
      ["pos", "/pos", "Visão geral", 10],
      ["pos", "/pos", "Fases, na ordem do quadro", 20],
      ["pos", "/pos", "Como a OS muda de fase", 30],
      ["ppv", "/ppv", "NFS-e", 10],
    ]);
    expect(arts[1].corpo).toEqual([
      { tipo: "p", texto: "(nome exato do grupo)" },
      { tipo: "lista", itens: [{ texto: "Orçamento" }, { texto: "Execução" }], ordenada: true },
    ]);
    expect(arts[2].corpo).toEqual([{ tipo: "lista", itens: [{ texto: "Manual: pelo seletor.", sub: ["sub regra"] }] }]);
    expect(arts[0].secao).toBe("OS — Ordem de Serviço");
  });

  it("módulo vem do primeiro segmento da rota", () => {
    expect(moduloDaTela("/dre-financeiro/vendas-modelo")).toBe("dre-financeiro");
    expect(moduloDaTela("")).toBe("geral");
  });
});
