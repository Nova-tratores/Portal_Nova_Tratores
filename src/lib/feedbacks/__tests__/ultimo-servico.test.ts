import { describe, it, expect } from "vitest";
import { feedbackDoServico, itensDaOS, montarUltimoServico } from "../ultimo-servico";
import type { HistOS } from "../historico-cliente";
import type { FeedbackRegistro } from "../types";

const os = (x: Partial<HistOS>): HistOS => ({ num_os: "5395", empresa: "Nova Tratores", data_inclusao: "2026-10-21", data_faturamento: "2026-10-22", etapa: "60", status: "Faturada",
  valor_total: 4147.01, descricao: "Modelo: 86110|Chassis: NP7T4KC6EPMA05338|Horimetro: 3077,7||Solicitação do cliente: Troca da luva/tração |Serviço Realizado: desmontar tração",
  servicos: JSON.stringify([{ desc: "Modelo: 86110|Chassis: X", qtd: 1, valor: 0.000001 }, { desc: "Hora Trabalhada", qtd: 12, valor: 200 }, { desc: "Deslocamento por KM", qtd: 420, valor: 3.6 }]),
  num_nf: "", vendedor: "Técnicos: José Antonio // Fernando Leonel", ...x });
const crm = (x: Partial<FeedbackRegistro>) => ({ tipo: "crm", status_atendimento: "aberto", tentativas: [], ...x }) as FeedbackRegistro;

describe("último serviço do RFM", () => {
  it("pega a última OS não cancelada e lê tudo dela", () => {
    const u = montarUltimoServico([os({ num_os: "5000", data_faturamento: "2026-01-10" }), os({}), os({ num_os: "5400", data_faturamento: "2026-10-23", status: "Cancelada" })])!;
    expect(u).toMatchObject({ numOs: "5395", osRef: "NOVA:5395", modelo: "86110", horimetro: "3077,7", solicitacao: "Troca da luva/tração", tecnico: "José Antonio // Fernando Leonel", totalOS: 2 });
    expect(itensDaOS(os({}).servicos).map((i) => i.tipo)).toEqual(["hora", "km"]);
  });
  it("feedback pela OS, pela data, sem resposta e sem nada", () => {
    const u = montarUltimoServico([os({})]);
    expect(feedbackDoServico(u, [crm({ os_ref: "NOVA:5395", status_atendimento: "concluido", nota: 9 })]).tipo).toBe("respondeu");
    expect(feedbackDoServico(u, [crm({ data_servico: "2026-10-15", status_atendimento: "sem_resposta" })]).tipo).toBe("sem_resposta");
    expect(feedbackDoServico(u, [crm({ data_servico: "2026-06-01", status_atendimento: "concluido", nota: 9 })]).tipo).toBe("nenhum");
    expect(feedbackDoServico(u, [crm({ os_ref: "NOVA:5395", status_atendimento: "concluido" })]).tipo).toBe("nenhum");
  });
});
