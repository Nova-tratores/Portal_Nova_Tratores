import { describe, it, expect } from "vitest";
import type { KanbanItem } from "../types";
import {
  dataMs, chaveMes, rotuloMes, intervaloPeriodo, passaPeriodo, rotuloPeriodo, filtrarRelacao, ordenarRelacao,
  porMesData, porMesPrevisao, porTecnico, topComOutros, resumoFiltrosRelacao, colTextoRelacao, diasNaFase,
} from "../relacao";

const HOJE = new Date(2026, 8, 8); // 08/09/2026

function ped(p: Partial<KanbanItem> & { id: string }): KanbanItem {
  return { cliente: "", tecnico: "", tipo: "Pedido", status: "Orçamento", valor: 0, desconto: 0, data: "", observacao: "", ultimaAcao: "", ultimoUsuario: "", ultimaData: "", ...p };
}

describe("datas", () => {
  it("lê DD/MM/YYYY HH:mm e ISO sem fuso", () => {
    expect(new Date(dataMs("13/08/2026 13:33")).getDate()).toBe(13);
    expect(new Date(dataMs("2026-08-13")).getDate()).toBe(13);
    expect(dataMs("")).toBe(0);
  });
  it("chave e rótulo de mês", () => {
    expect(chaveMes("13/08/2026 13:33")).toBe("2026-08");
    expect(rotuloMes("2026-08")).toBe("ago/26");
    expect(chaveMes("")).toBe("");
  });
});

describe("período", () => {
  it("este mês / mês anterior / últimos 90 dias", () => {
    const em = intervaloPeriodo("este_mes", HOJE)!;
    expect(new Date(em.ini).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(new Date(em.fim).getMonth()).toBe(9);
    const ma = intervaloPeriodo("mes_anterior", HOJE)!;
    expect(new Date(ma.ini).getMonth()).toBe(7);
    const u90 = intervaloPeriodo("ultimos_90", HOJE)!;
    expect(Math.round((u90.fim - u90.ini) / 86400000)).toBe(90);
  });
  it("passaPeriodo aplica os tokens; a_partir sem data não filtra", () => {
    expect(passaPeriodo("02/09/2026 10:00", "este_mes", HOJE)).toBe(true);
    expect(passaPeriodo("30/08/2026 10:00", "este_mes", HOJE)).toBe(false);
    expect(passaPeriodo("30/08/2026 10:00", "mes_anterior", HOJE)).toBe(true);
    expect(passaPeriodo("01/05/2026 10:00", "ultimos_90", HOJE)).toBe(false);
    expect(passaPeriodo("01/07/2026 10:00", "ultimos_90", HOJE)).toBe(true);
    expect(passaPeriodo("01/07/2026 10:00", "a_partir:2026-07-01", HOJE)).toBe(true);
    expect(passaPeriodo("30/06/2026 10:00", "a_partir:2026-07-01", HOJE)).toBe(false);
    expect(passaPeriodo("30/06/2026 10:00", "a_partir", HOJE)).toBe(true);
    expect(passaPeriodo("", "sem_data", HOJE)).toBe(true);
    expect(passaPeriodo("30/06/2026", "sem_data", HOJE)).toBe(false);
    expect(passaPeriodo("", "este_mes", HOJE)).toBe(false);
  });
  it("rótulo do período", () => {
    expect(rotuloPeriodo("este_mes")).toBe("Este mês");
    expect(rotuloPeriodo("a_partir:2026-07-01")).toBe("A partir de 01/07/2026");
  });
});

describe("filtrarRelacao", () => {
  const lista = [
    ped({ id: "PPV-0001", cliente: "Flora", tecnico: "Danilo", status: "Orçamento", data: "02/09/2026 09:00", valor: 100, previsaoFaturamento: "2026-09-20" }),
    ped({ id: "PPV-0002", cliente: "Antonio", tecnico: "Gabriel", status: "Orçamento enviado para o cliente e aguardando", data: "20/08/2026 09:00", valor: 200 }),
    ped({ id: "REM-0003", cliente: "Flora", tecnico: "Danilo", status: "Concluída", data: "01/06/2026 09:00", valor: 300, tipo: "Remessa", previsaoFaturamento: "2026-08-05" }),
  ];
  it("fase 'Pendente' = todas menos Faturado/Cancelada", () => {
    expect(filtrarRelacao(lista, { filtrosCol: { status: "Pendente" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0001", "PPV-0002"]);
    expect(resumoFiltrosRelacao({ filtrosCol: { status: "Pendente" } })).toContain("Fase: Pendente (menos Faturado/Cancelada)");
  });
  it("fase é exata (Orçamento não casa Orçamento enviado)", () => {
    expect(filtrarRelacao(lista, { filtrosCol: { status: "Orçamento" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0001"]);
    expect(filtrarRelacao(lista, { filtrosCol: { status: "Orçamento enviado" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0002"]);
  });
  it("colunas de data aceitam token de período e texto", () => {
    expect(filtrarRelacao(lista, { filtrosCol: { data: "este_mes" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0001"]);
    expect(filtrarRelacao(lista, { filtrosCol: { data: "mes_anterior" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0002"]);
    expect(filtrarRelacao(lista, { filtrosCol: { data: "/06/" }, hoje: HOJE }).map((o) => o.id)).toEqual(["REM-0003"]);
    expect(filtrarRelacao(lista, { filtrosCol: { previsaoFat: "mes_anterior" }, hoje: HOJE }).map((o) => o.id)).toEqual(["REM-0003"]);
    expect(filtrarRelacao(lista, { filtrosCol: { previsaoFat: "sem_data" }, hoje: HOJE }).map((o) => o.id)).toEqual(["PPV-0002"]);
  });
  it("previsão de faturamento aparece na coluna e ordena", () => {
    expect(colTextoRelacao(lista[0], "previsaoFat")).toBe("20/09/2026");
    expect(colTextoRelacao(lista[1], "previsaoFat")).toBe("");
    expect(ordenarRelacao(lista, { key: "previsaoFat", dir: "desc" })[0].id).toBe("PPV-0001");
  });
  it("resumo dos filtros descreve o período", () => {
    const r = resumoFiltrosRelacao({ filtrosCol: { data: "ultimos_90", status: "Orçamento" } });
    expect(r).toContain("Data: Últimos 90 dias");
    expect(r).toContain('Fase: "Orçamento"');
  });
});

describe("diasNaFase (status_desde do trigger)", () => {
  it("conta dias inteiros desde o carimbo; vazio/inválido = null (desconhecido)", () => {
    const hoje = new Date(2026, 8, 8, 15, 0);
    expect(diasNaFase({ statusDesde: "2026-09-01T10:00:00.000Z" }, hoje)).toBe(7);
    expect(diasNaFase({ statusDesde: "2026-09-08T12:00:00.000Z" }, hoje)).toBe(0);
    expect(diasNaFase({ statusDesde: "" }, hoje)).toBeNull();
    expect(diasNaFase({}, hoje)).toBeNull();
    expect(diasNaFase({ statusDesde: "abc" }, hoje)).toBeNull();
    // carimbo no futuro (relógio adiantado) não vira negativo
    expect(diasNaFase({ statusDesde: "2026-09-10T00:00:00.000Z" }, hoje)).toBe(0);
  });
});

describe("agregações do dashboard", () => {
  const lista = [
    ped({ id: "1", tecnico: "A", data: "02/09/2026", valor: 10, previsaoFaturamento: "2026-10-01" }),
    ped({ id: "2", tecnico: "A", data: "15/08/2026", valor: 20 }),
    ped({ id: "3", tecnico: "B", data: "20/08/2026", valor: 5, previsaoFaturamento: "2026-10-15" }),
  ];
  it("por mês em ordem cronológica", () => {
    expect(porMesData(lista).map((a) => [a.label, a.n, a.valor])).toEqual([["ago/26", 2, 25], ["set/26", 1, 10]]);
  });
  it("por previsão com balde 'Sem previsão' por último", () => {
    expect(porMesPrevisao(lista).map((a) => a.label)).toEqual(["out/26", "Sem previsão"]);
  });
  it("por técnico ordenado por valor + topComOutros", () => {
    expect(porTecnico(lista).map((a) => a.label)).toEqual(["A", "B"]);
    const t = topComOutros(porTecnico(lista), 1);
    expect(t).toHaveLength(2);
    expect(t[1].label).toBe("Outros (1)");
    expect(t[1].valor).toBe(5);
  });
});
