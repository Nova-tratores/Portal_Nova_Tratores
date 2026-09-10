import { describe, it, expect } from "vitest";
import type { KanbanCard } from "../types";
import {
  filtrarOS, ordenarOS, resumoFiltrosOS, totaisOS, valorOS, colTextoOS, gerarCSVOS,
  porMesDataOS, porTecnicoOS, porFaseOS, porTipoOS, FASE_PENDENTE_OS, rotuloFaseOS,
} from "../relacao";

const HOJE = new Date(2026, 8, 10, 12, 0); // 10/09/2026

function os(p: Partial<KanbanCard>): KanbanCard {
  return {
    id: "OS-0001", cliente: "Cliente", tecnico: "Tec", data: "01/09/2026", dataFase: "05/09/2026", valor: "0,00", status: "Execução",
    temPPV: false, ppvId: "", temReq: false, temRel: false, servSolicitado: "-", ordemOmie: "", previsaoExecucao: "", previsaoFaturamento: "",
    dataFimServico: "", diasAtraso: 0, ultimaAcao: "", ultimoUsuario: "", ultimaData: "", reqInfo: [], relTecnico: "", servicoInterno: false,
    ...p,
  };
}

const lista: KanbanCard[] = [
  os({ id: "OS-0001", cliente: "FLORA MARIA", tecnico: "GABRIEL", data: "01/09/2026", valor: "1.200,50", status: "Execução", tipoServico: "Manutenção", previsaoFaturamento: "2026-09-20", qtdHoras: 2, qtdKm: 30 }),
  os({ id: "OS-0002", cliente: "SITIO GUAPEVA", tecnico: "DANILO", data: "15/08/2026", valor: "800,00", status: "Orçamento", tipoServico: "Revisão", diasAtraso: 3 }),
  os({ id: "OS-0003", cliente: "JOSE", tecnico: "GABRIEL", data: "10/06/2026", valor: "5000", status: "Concluída", tipoServico: "Manutenção", dataFimServico: "2026-06-12", ordemOmie: "778" }),
  os({ id: "OS-0004", cliente: "ANA", tecnico: "Danilo", data: "2026-09-09", valor: "50,00", status: "Cancelada", tipoServico: "Garantia Trator" }),
];

describe("valorOS / colTextoOS", () => {
  it("lê o valor BR do card ('1.200,50'), US ('5000') e número", () => {
    expect(valorOS({ valor: "1.200,50" })).toBe(1200.5);
    expect(valorOS({ valor: "5000" })).toBe(5000);
    expect(valorOS({ valor: 12 as unknown as string })).toBe(12);
    expect(valorOS({ valor: "" })).toBe(0);
  });
  it("colunas: nº sem prefixo, datas BR/ISO curtas, solicitação '-' vira vazio", () => {
    expect(colTextoOS(lista[0], "id")).toBe("0001");
    expect(colTextoOS(lista[0], "previsaoFaturamento")).toBe("20/09/2026");
    expect(colTextoOS(lista[3], "data")).toBe("09/09/2026");
    expect(colTextoOS(lista[0], "servSolicitado")).toBe("");
    expect(colTextoOS(lista[0], "status")).toBe("Execução");
    expect(rotuloFaseOS("Execução aguardando peças (em transporte)")).toBe("Aguard. peças");
  });
});

describe("filtrarOS", () => {
  it("fase Pendente = todas menos Concluída/Cancelada (atalho e coluna)", () => {
    expect(filtrarOS(lista, { status: FASE_PENDENTE_OS, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001", "OS-0002"]);
    expect(filtrarOS(lista, { filtrosCol: { status: "Pendente" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001", "OS-0002"]);
  });
  it("fase exata pelo rótulo curto OU pelo nome do banco", () => {
    expect(filtrarOS(lista, { filtrosCol: { status: "Execução" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001"]);
    expect(filtrarOS(lista, { filtrosCol: { status: "Concluída" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0003"]);
  });
  it("técnico do header compara normalizado (acento/caixa)", () => {
    expect(filtrarOS(lista, { tecnico: "danilo", hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0002", "OS-0004"]);
  });
  it("período na coluna Data e no Fim do serviço; texto nas outras", () => {
    expect(filtrarOS(lista, { filtrosCol: { data: "este_mes" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001", "OS-0004"]);
    expect(filtrarOS(lista, { filtrosCol: { data: "mes_anterior" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0002"]);
    expect(filtrarOS(lista, { filtrosCol: { dataFimServico: "sem_data" }, hoje: HOJE }).length).toBe(3);
    expect(filtrarOS(lista, { filtrosCol: { data: "a_partir:2026-08-20" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001", "OS-0004"]);
    expect(filtrarOS(lista, { filtrosCol: { cliente: "flora" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0001"]);
    expect(filtrarOS(lista, { filtrosCol: { tipoServico: "Revisão" }, hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0002"]);
    expect(filtrarOS(lista, { busca: "778", hoje: HOJE }).map((o) => o.id)).toEqual(["OS-0003"]);
  });
});

describe("ordenarOS / resumo / totais / agregações / CSV", () => {
  it("ordena por data desc e por valor asc", () => {
    expect(ordenarOS(lista, { key: "data", dir: "desc" }).map((o) => o.id)).toEqual(["OS-0004", "OS-0001", "OS-0002", "OS-0003"]);
    expect(ordenarOS(lista, { key: "valor", dir: "asc" }).map((o) => o.id)).toEqual(["OS-0004", "OS-0002", "OS-0001", "OS-0003"]);
  });
  it("resumo dos filtros legível", () => {
    expect(resumoFiltrosOS({ status: FASE_PENDENTE_OS, tecnico: "GABRIEL", filtrosCol: { data: "ultimos_90", cliente: "flo" } }, { key: "valor", dir: "desc" }))
      .toEqual(["Técnico: GABRIEL", "Fase: Pendente (menos Concluída/Cancelada)", 'Cliente: "flo"', "Data: Últimos 90 dias", "Ordenado por Valor (Z-A)"]);
  });
  it("totais: pendentes, concluídas, canceladas, atrasadas, horas e km", () => {
    const t = totaisOS(lista);
    expect(t.n).toBe(4); expect(t.valor).toBe(7050.5);
    expect(t.pendentesN).toBe(2); expect(t.pendentesV).toBe(2000.5);
    expect(t.concluidasN).toBe(1); expect(t.canceladasN).toBe(1); expect(t.atrasadasN).toBe(1);
    expect(t.horas).toBe(2); expect(t.km).toBe(30);
  });
  it("agregações por mês, técnico, tipo e fase", () => {
    expect(porMesDataOS(lista).map((a) => [a.label, a.n])).toEqual([["jun/26", 1], ["ago/26", 1], ["set/26", 2]]);
    expect(porTecnicoOS(lista)[0]).toMatchObject({ label: "GABRIEL", n: 2, valor: 6200.5 });
    expect(porTipoOS(lista).map((a) => a.label)).toEqual(["Manutenção", "Revisão", "Garantia Trator"]);
    expect(porFaseOS(lista).map((a) => a.label)).toEqual(["Orçamento", "Execução", "Concluída", "Cancelada"]);
  });
  it("CSV com BOM, ';' e colunas extras", () => {
    const csv = gerarCSVOS(lista.slice(0, 1));
    expect(csv.startsWith("﻿Nº;Cliente;")).toBe(true);
    expect(csv).toContain(";1200,50;2;30;0\r\n");
  });
});
