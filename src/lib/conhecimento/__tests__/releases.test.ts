import { describe, expect, it } from "vitest";
import {
  artigosAfetados, casaGlob, ehNovidade, juntarMotivo, lerCommit, lerPayloadRelease, moduloDoArquivo, modulosDoCommit, modulosDoEscopo, mudaATela, novidadeSemIA, novidadesPorModulo,
} from "../releases";

const CONHECIDOS = new Set(["pos", "ppv", "garantias", "revisoes", "feedbacks"]);

describe("commits", () => {
  it("lê tipo, escopo e descrição do padrão do portal", () => {
    expect(lerCommit({ sha: "a1", titulo: "feat(pos/ppv): cliente e técnico sincronizados" })).toMatchObject({ tipo: "feat", escopo: "pos/ppv", descricao: "cliente e técnico sincronizados", arquivos: [] });
    expect(lerCommit({ sha: "a2", titulo: "fix: corrige data" })).toMatchObject({ tipo: "fix", escopo: "", descricao: "corrige data" });
    expect(lerCommit({ sha: "a3", titulo: "Merge branch 'x'" })).toMatchObject({ tipo: "", escopo: "", descricao: "Merge branch 'x'" });
    expect(lerCommit({ sha: "a4", titulo: "feat(pos)!: muda tudo" }).tipo).toBe("feat");
  });

  it("escopo → módulos conhecidos, com apelidos", () => {
    expect(modulosDoEscopo("pos/ppv", CONHECIDOS)).toEqual(["pos", "ppv"]);
    expect(modulosDoEscopo("feedbacks/relatorios", CONHECIDOS)).toEqual(["feedbacks"]);
    expect(modulosDoEscopo("pecas", CONHECIDOS)).toEqual(["ppv"]);
    expect(modulosDoEscopo("marketing", CONHECIDOS)).toEqual([]);
    expect(modulosDoEscopo("", CONHECIDOS)).toEqual([]);
  });

  it("arquivo → módulo pelo caminho; testes e docs não mudam a tela", () => {
    expect(moduloDoArquivo("src/lib/pos/relacao.ts")).toBe("pos");
    expect(moduloDoArquivo("src/app/(portal)/(servicos)/pos/page.tsx")).toBe("pos");
    expect(moduloDoArquivo("src/app/(portal)/revisoes/page.tsx")).toBe("revisoes");
    expect(moduloDoArquivo("src/app/api/garantias/route.ts")).toBe("garantias");
    expect(moduloDoArquivo("src/components/pos/OSCard.tsx")).toBe("pos");
    expect(moduloDoArquivo("docs/x.md")).toBeNull();
    expect(mudaATela("src/lib/pos/relacao.ts")).toBe(true);
    expect(mudaATela("src/lib/pos/__tests__/relacao.test.ts")).toBe(false);
    expect(mudaATela("docs/guia.md")).toBe(false);
    expect(mudaATela("sql/x.sql")).toBe(false);
    expect(mudaATela(".github/workflows/x.yml")).toBe(false);
  });

  it("módulos do commit = escopo ∪ arquivos que mudam a tela", () => {
    const c = lerCommit({ sha: "b", titulo: "feat(revisoes): cheques atrasados", arquivos: ["src/lib/revisoes/cheque-db.ts", "src/components/pos/ChequeRevisaoBloco.tsx", "src/lib/ppv/__tests__/x.test.ts"] });
    expect(modulosDoCommit(c, CONHECIDOS).sort()).toEqual(["pos", "revisoes"]);
  });
});

describe("fontes × arquivos", () => {
  it("glob: ** atravessa pastas, * não", () => {
    expect(casaGlob("src/lib/pos/**", "src/lib/pos/a/b.ts")).toBe(true);
    expect(casaGlob("src/lib/pos/**", "src/lib/posto/a.ts")).toBe(false);
    expect(casaGlob("src/app/(portal)/(servicos)/pos/**", "src/app/(portal)/(servicos)/pos/page.tsx")).toBe(true);
    expect(casaGlob("src/lib/pos/*.ts", "src/lib/pos/a.ts")).toBe(true);
    expect(casaGlob("src/lib/pos/*.ts", "src/lib/pos/a/b.ts")).toBe(false);
    expect(casaGlob("src/**/pos/**", "src/components/pos/OSCard.tsx")).toBe(true);
    expect(casaGlob("", "x")).toBe(false);
  });

  it("artigo é afetado só por arquivo que muda a tela e casa com suas fontes", () => {
    const artigos = [
      { id: "1", modulo: "pos", fontes: ["src/lib/pos/**", "src/components/pos/**"] },
      { id: "2", modulo: "ppv", fontes: ["src/lib/ppv/**"] },
      { id: "3", modulo: "geral", fontes: [] },
    ];
    const arquivos = ["src/lib/pos/relacao.ts", "src/lib/pos/__tests__/relacao.test.ts", "docs/x.md", "src/lib/pos/relacao.ts"];
    expect(artigosAfetados(artigos, arquivos)).toEqual([{ id: "1", modulo: "pos", arquivos: ["src/lib/pos/relacao.ts"] }]);
  });
});

describe("novidades", () => {
  const commits = [
    lerCommit({ sha: "1", titulo: "feat(pos): aba única Requisições & Alimentação", arquivos: ["src/components/pos/OSDrawer.tsx"] }),
    lerCommit({ sha: "2", titulo: "fix(pos/ppv): checkbox de reserva discreto" }),
    lerCommit({ sha: "3", titulo: "docs(pos): atualiza guia" }),
    lerCommit({ sha: "4", titulo: "feat(marketing): leads declarados" }),
    lerCommit({ sha: "5", titulo: "chore: limpeza", arquivos: ["src/lib/garantias/x.ts"] }),
  ];

  it("só feat/fix/perf, agrupados por módulo conhecido", () => {
    expect(commits.map(ehNovidade)).toEqual([true, true, false, true, false]);
    const m = novidadesPorModulo(commits, CONHECIDOS);
    expect(Array.from(m.keys()).sort()).toEqual(["pos", "ppv"]);
    expect(m.get("pos")!.map((c) => c.sha)).toEqual(["1", "2"]);
    expect(m.get("ppv")!.map((c) => c.sha)).toEqual(["2"]);
  });

  it("texto de reserva sem IA", () => {
    expect(novidadeSemIA(commits.slice(0, 2))).toBe("- Aba única Requisições & Alimentação\n- Correção: Checkbox de reserva discreto");
  });
});

describe("motivo da revisão e payload", () => {
  it("junta sem repetir commit e mantém a versão mais nova", () => {
    const a = { release: "r1", commits: [{ sha: "1", titulo: "a" }], arquivos: ["x"] };
    const r = juntarMotivo(a, { release: "r2", commits: [{ sha: "1", titulo: "a" }, { sha: "2", titulo: "b" }], arquivos: ["x", "y"] });
    expect(r).toEqual({ release: "r2", commits: [{ sha: "1", titulo: "a" }, { sha: "2", titulo: "b" }], arquivos: ["x", "y"] });
    expect(juntarMotivo(null, { release: "r", commits: [], arquivos: [] })).toEqual({ release: "r", commits: [], arquivos: [] });
  });

  it("payload: exige sha; une arquivos soltos e por commit; ignora lixo", () => {
    expect(lerPayloadRelease({})).toBeNull();
    expect(lerPayloadRelease({ sha: "não é sha" })).toBeNull();
    const p = lerPayloadRelease({
      sha: "47b3581b", sha_anterior: "8e4047f6", arquivos: ["a.ts"],
      commits: [{ sha: "47b3581b", titulo: "feat(pos): x", arquivos: ["b.ts", "a.ts"] }, { titulo: "sem sha" }, "lixo"],
    })!;
    expect(p.sha).toBe("47b3581b");
    expect(p.sha_anterior).toBe("8e4047f6");
    expect(p.commits).toHaveLength(1);
    expect(p.arquivos.sort()).toEqual(["a.ts", "b.ts"]);
  });
});
