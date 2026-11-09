import { describe, expect, it } from "vitest";
import { PHASES } from "@/lib/pos/constants";
import {
  FASES_FIXAS, aplicarDiferenca, diferenca, listaPadrao, nomeDaFase, normalizarLista, podeRemover,
  resumoDiferenca, temMudanca, validarLista, validarNomeNovo, validarRenomear, type FaseQuadro,
} from "../quadro";
import { faseDoPPVNaTela } from "../fases";

const chaves = (l: FaseQuadro[]) => l.map((f) => f.chave);

describe("controlador de fases (09/11/2026)", () => {
  it("sem nada salvo = as fases de sempre, com os nomes do lápis antigo", () => {
    const l = listaPadrao({ "Cobrando Cliente": "Cobrança" });
    expect(chaves(l)).toEqual(PHASES);
    expect(nomeDaFase(l.find((f) => f.chave === "Cobrando Cliente")!)).toBe("Cobrança");
    expect(chaves(normalizarLista(null))).toEqual(PHASES);
  });

  it("normalizar tira repetida/vazia e devolve as fixas que sumiram no lugar de sempre", () => {
    const l = normalizarLista([{ chave: "Orçamento" }, { chave: "  " }, { chave: "Orçamento" }, { chave: "Minha fase" }, { chave: "Execução" }]);
    expect(l[0].chave).toBe("Orçamento");
    expect(chaves(l)).toContain("Minha fase");
    for (const k of FASES_FIXAS) expect(chaves(l)).toContain(k);
    expect(chaves(l).indexOf("Concluída")).toBeLessThan(chaves(l).indexOf("Cancelada"));
    expect(validarLista(l)).toBeNull();
  });

  it("fixas não saem; as outras saem", () => {
    expect(podeRemover("Concluída")).toBe(false);
    expect(podeRemover("Enviar Omie")).toBe(false);
    expect(podeRemover("Aguardando outros")).toBe(true);
    const sem = listaPadrao().filter((f) => f.chave !== "Concluída");
    expect(validarLista(sem)).toMatch(/Concluída/);
  });

  it("nome novo não pode repetir (nem o nome mostrado) nem ser reservado", () => {
    const l = listaPadrao({ "Cobrando Cliente": "Cobrança" });
    expect(validarNomeNovo("", l)).toBeTruthy();
    expect(validarNomeNovo("execução", l)).toMatch(/Já existe/);
    expect(validarNomeNovo("Cobrança", l)).toMatch(/Já existe/);
    expect(validarNomeNovo("Outros", l)).toBeTruthy();
    expect(validarNomeNovo("Aguardando cliente buscar", l)).toBeNull();
    expect(validarRenomear("Execução", "Orçamento", l)).toMatch(/Já existe/);
    expect(validarRenomear("Execução", "Em execução", l)).toBeNull();
    expect(validarRenomear("Execução", "", l)).toBeNull();
  });

  it("diferença: nome, nova, removida e ordem", () => {
    const antes = listaPadrao();
    const depois = antes.filter((f) => f.chave !== "Aguardando outros").map((f) => (f.chave === "Execução" ? { ...f, rotulo: "Em execução" } : f));
    depois.splice(2, 0, { chave: "Esperando máquina" });
    const d = diferenca(antes, depois);
    expect(d.adicionadas).toEqual([{ chave: "Esperando máquina", rotulo: undefined, depoisDe: antes[1].chave }]);
    expect(d.renomeadas).toEqual([{ chave: "Execução", rotulo: "Em execução" }]);
    expect(d.removidas).toEqual(["Aguardando outros"]);
    expect(d.ordemMudou).toBe(false);
    expect(temMudanca(d)).toBe(true);
    expect(resumoDiferenca(d, antes)).toEqual(["Nova: Esperando máquina", "Nome: Execução → Em execução", "Removida: Aguardando outros"]);
    expect(temMudanca(diferenca(antes, antes))).toBe(false);
  });

  it("aplicar no outro quadro: renomeia, remove, insere ao lado da mesma vizinha", () => {
    const pos = listaPadrao();
    const ppv = [...listaPadrao(), { chave: "Só do PPV" }];
    const depois = pos.filter((f) => f.chave !== "Relatório Atualizado").map((f) => (f.chave === "Execução" ? { ...f, rotulo: "Em execução" } : f));
    depois.splice(depois.findIndex((f) => f.chave === "Execução") + 1, 0, { chave: "Teste rodando" });
    const novo = aplicarDiferenca(ppv, diferenca(pos, depois));
    expect(chaves(novo)).not.toContain("Relatório Atualizado");
    expect(chaves(novo)).toContain("Só do PPV");
    expect(chaves(novo)[chaves(novo).indexOf("Execução") + 1]).toBe("Teste rodando");
    expect(nomeDaFase(novo.find((f) => f.chave === "Execução")!)).toBe("Em execução");
  });

  it("vizinha que não existe no outro quadro: a nova entra antes de Concluída", () => {
    const pos = [...listaPadrao(), { chave: "X" }];
    const ppv = listaPadrao();
    const depois = [...pos, { chave: "Y" }];
    const novo = aplicarDiferenca(ppv, diferenca(pos, depois));
    expect(chaves(novo)[chaves(novo).indexOf("Concluída") - 1]).toBe("Y");
  });

  it("ordem nova vai para o outro quadro sem tirar do lugar as fases só dele", () => {
    const pos = listaPadrao();
    const ppv = [{ chave: "Só PPV" }, ...listaPadrao()];
    const depois = [...pos].reverse();
    const novo = aplicarDiferenca(ppv, diferenca(pos, depois));
    expect(novo[0].chave).toBe("Só PPV");
    expect(chaves(novo).slice(1)).toEqual([...PHASES].reverse());
  });

  it("remover no POS não tira fixa do PPV", () => {
    const d = { renomeadas: [], adicionadas: [], removidas: ["Concluída"], ordemMudou: false, ordem: [] };
    expect(chaves(aplicarDiferenca(listaPadrao(), d))).toContain("Concluída");
  });

  it("PPV numa fase criada no controlador aparece nela", () => {
    const quadro = [...PHASES, "Esperando cliente"];
    expect(faseDoPPVNaTela({ status: "Esperando cliente" }, null, quadro)).toBe("Esperando cliente");
    expect(faseDoPPVNaTela({ status: "Esperando cliente" }, null)).toBe("Orçamento");
    // OS numa fase que o PPV não tem: fica na do próprio PPV
    expect(faseDoPPVNaTela({ status: "Execução", osId: "OS-1" }, "Só do POS", PHASES)).toBe("Execução");
    expect(faseDoPPVNaTela({ status: "Execução", osId: "OS-1" }, "Só do POS", [...PHASES, "Só do POS"])).toBe("Só do POS");
  });
});
