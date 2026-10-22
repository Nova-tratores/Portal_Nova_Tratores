import { describe, it, expect } from "vitest";
import { lerCommit, moduloDoArquivo } from "../releases";
import { agruparPorModulo, inicioDoDiaBR, temAcessoModulo, textoDaIA, textoSemIA, entradaIA } from "../novidades-diarias";

const c = (sha: string, titulo: string, arquivos: string[] = [], corpo?: string) => lerCommit({ sha, titulo, arquivos, corpo });

describe("novidades do dia", () => {
  it("acha o módulo pelo escopo e pelo caminho (inclusive as abas do Opa)", () => {
    expect(moduloDoArquivo("src/components/opa/pecas/DetalheItem.tsx")).toBe("opa-pecas");
    expect(moduloDoArquivo("src/app/(portal)/opa/patrimonio/page.tsx")).toBe("patrimonio");
    expect(moduloDoArquivo("src/app/(portal)/frota/veiculos/page.tsx")).toBe("frota");
    expect(moduloDoArquivo("src/app/(portal)/agenda/page.tsx")).toBe("geral");
  });
  it("agrupa por módulo e ignora bastidor (docs, test, refactor)", () => {
    const m = agruparPorModulo([
      c("a1", "feat(frota): setor do carro", ["src/lib/frota/setores.ts"]),
      c("a2", "fix(opa): etiqueta", ["src/lib/opa-pecas/etiqueta-termica.ts"]),
      c("a3", "docs(frota): anotações", ["src/lib/frota/x.ts"]),
      c("a4", "refactor(pos): limpa", ["src/lib/pos/x.ts"]),
      c("a1", "feat(frota): setor do carro", ["src/lib/frota/setores.ts"]),
    ]);
    expect([...m.keys()].sort()).toEqual(["frota", "opa-pecas"]);
    expect(m.get("frota")!.length).toBe(1);
  });
  it("quem recebe: quem tem o módulo, admin/dev e, no geral, todos", () => {
    const u = { user_id: "u", modulos: ["frota:veiculos:editar", "pos"] };
    expect(temAcessoModulo(u, "frota")).toBe(true);
    expect(temAcessoModulo(u, "ppv")).toBe(false);
    expect(temAcessoModulo({ ...u, is_dev: true }, "ppv")).toBe(true);
    expect(temAcessoModulo(u, "geral")).toBe(true);
  });
  it("monta o texto com as seções e numera o passo a passo", () => {
    const t = textoDaIA({ titulo: "Setor e carro sem uso", novo: ["Setor na ficha"], mudou: [], saiu: ["Botão antigo"], como_fica: ["Abra a ficha", "Clique em editar"] });
    expect(t?.texto).toBe("## O que tem de novo\n- Setor na ficha\n\n## O que saiu\n- Botão antigo\n\n## Como fica agora\n1. Abra a ficha\n2. Clique em editar");
    expect(textoDaIA({ titulo: "x" })).toBeNull();
  });
  it("sem IA: lista os commits", () => {
    const t = textoSemIA("Frota", [c("a", "feat(frota): setor do carro"), c("b", "fix(frota): checklist no carro certo")]);
    expect(t.texto).toContain("## O que tem de novo\n- Setor do carro");
    expect(t.texto).toContain("## O que mudou\n- Checklist no carro certo");
  });
  it("manda o corpo do commit para a IA, sem a linha de coautoria", () => {
    const e = entradaIA("Frota", [c("a", "feat(frota): x", [], "- detalhe 1\n\nCo-Authored-By: Claude <x@y>")]);
    expect(e).toContain("detalhe 1");
    expect(e).not.toContain("Co-Authored-By");
  });
  it("o dia começa à meia-noite de Brasília", () => {
    expect(inicioDoDiaBR(new Date("2026-10-23T10:00:00Z"))).toBe("2026-10-23T03:00:00.000Z");
    expect(inicioDoDiaBR(new Date("2026-10-23T02:00:00Z"))).toBe("2026-10-22T03:00:00.000Z");
  });
});
