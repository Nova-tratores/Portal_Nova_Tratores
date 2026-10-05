import { describe, it, expect } from "vitest";
import type { KanbanCard } from "../types";
import { chaveNumOS, numNfse, anexarNfse, situacaoNota, rotuloNfse, valorNfse, type MapaNfse } from "../nota";
import { totaisOS, filtrarOS, colTextoOS, gerarCSVOS, resumoFiltrosOS } from "../relacao";

function os(p: Partial<KanbanCard>): KanbanCard {
  return {
    id: "OS-0001", cliente: "Cliente", tecnico: "Tec", data: "01/09/2026", dataFase: "05/09/2026", valor: "0,00", status: "Concluída",
    temPPV: false, ppvId: "", temReq: false, temRel: false, servSolicitado: "-", ordemOmie: "", previsaoExecucao: "", previsaoFaturamento: "",
    dataFimServico: "", diasAtraso: 0, ultimaAcao: "", ultimoUsuario: "", ultimaData: "", reqInfo: [], relTecnico: "", servicoInterno: false,
    ...p,
  };
}

const MAPA: MapaNfse = {
  "5348": { temNota: true, nfseNum: "0000000001234", valorServico: 800 },
  "5349": { temNota: false, nfseNum: null, valorServico: 300 },
  "5350": { temNota: true, nfseNum: "77", valorServico: 1012 },
  "5351": { temNota: null, nfseNum: null, valorServico: 90 },
};

const lista = anexarNfse([
  os({ id: "OS-0001", ordemOmie: "000000000005348", valor: "1.000,00" }),            // com NFS-e (peças no valor do portal)
  os({ id: "OS-0002", ordemOmie: "5349", valor: "300,00" }),                          // faturada sem nota
  os({ id: "OS-0003", ordemOmie: "5350", valor: "1.012,00", servicoInterno: true }),  // interna, mesmo com nota no cache
  os({ id: "OS-0004", ordemOmie: "", valor: "600,00", status: "Execução" }),          // não enviada
  os({ id: "OS-0005", ordemOmie: "9999", valor: "50,00", status: "Enviado Para Omie" }), // enviada, fora do cache
  os({ id: "OS-0006", ordemOmie: "5351", valor: "90,00" }),                           // itens no cache, nota não verificada
], MAPA);

describe("chaveNumOS / numNfse", () => {
  it("tira zeros à esquerda e o que não é dígito", () => {
    expect(chaveNumOS("000000000005348")).toBe("5348");
    expect(chaveNumOS(5348)).toBe("5348");
    expect(chaveNumOS("")).toBe("");
    expect(chaveNumOS(null)).toBe("");
    expect(numNfse("0000000000002")).toBe("2");
    expect(numNfse("0")).toBe("0");
  });
});

describe("anexarNfse / situacaoNota", () => {
  it("liga a OS à NFS-e pelo nº da Omie, com ou sem zeros", () => {
    expect(lista[0].nfse?.nfseNum).toBe("0000000001234");
    expect(lista[3].nfse).toBeUndefined();
    expect(lista[4].nfse).toBeUndefined();
  });
  it("sem mapa devolve a própria lista", () => {
    const l = [os({})];
    expect(anexarNfse(l, null)).toBe(l);
  });
  it("classifica cada OS", () => {
    expect(lista.map(situacaoNota)).toEqual(["com_nfse", "sem_nfse", "interno", "nao_enviada", "nao_verificada", "nao_verificada"]);
  });
  it("rótulo e valor da coluna NFS-e", () => {
    expect(lista.map(rotuloNfse)).toEqual(["1234", "sem nota", "interna", "", "", ""]);
    expect(lista.map(valorNfse)).toEqual([800, 0, 0, 0, 0, 0]);
    expect(colTextoOS(lista[0], "nfse")).toBe("1234");
    expect(colTextoOS(lista[0], "nfseValor")).toContain("800,00");
    expect(colTextoOS(lista[1], "nfseValor")).toBe("");
  });
});

describe("totais com nota × interno", () => {
  it("com nota + interno = total; interna fica fora da NFS-e", () => {
    const t = totaisOS(lista);
    expect(t.internoN).toBe(1);
    expect(t.internoV).toBe(1012);
    expect(t.comNotaN).toBe(5);
    expect(t.comNotaV).toBe(2040);
    expect(t.comNotaV + t.internoV).toBe(t.valor);
    expect(t.nfseN).toBe(1);
    expect(t.nfseV).toBe(800);
    expect(t.semNfseN).toBe(1);
  });
  it("filtro de cobrança separa pelo selo da OS", () => {
    expect(filtrarOS(lista, { cobranca: "interno" }).map((o) => o.id)).toEqual(["OS-0003"]);
    expect(filtrarOS(lista, { cobranca: "nota" })).toHaveLength(5);
    expect(filtrarOS(lista, {})).toHaveLength(6);
    expect(resumoFiltrosOS({ cobranca: "interno" })).toEqual(["Cobrança: só OS internas"]);
  });
  it("filtro da coluna NFS-e e CSV", () => {
    expect(filtrarOS(lista, { filtrosCol: { nfse: "sem nota" } }).map((o) => o.id)).toEqual(["OS-0002"]);
    const linhas = gerarCSVOS(lista).split("\r\n");
    expect(linhas[0]).toContain("NFS-e;Serviço na NFS-e");
    expect(linhas[0]).toContain(";Serviço na NFS-e (número);Interna;Valor (número);");
    expect(linhas[1]).toContain(";800,00;não;1000,00;");
    expect(linhas[3]).toContain(";;sim;1012,00;");
  });
});
