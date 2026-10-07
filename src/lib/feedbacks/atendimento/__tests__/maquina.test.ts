import { describe, expect, it } from "vitest";
import { montarLinhaDoTempo, type FontesLinhaDoTempo } from "../maquina";
import type { Trator } from "@/lib/revisoes/types";

const vazio = (): FontesLinhaDoTempo => ({
  chassi: "MDI07513PS0006206", trator: null, osPortal: [], tecnicos: [], osOmie: [], pvs: [], ppvs: [],
  chequesEmail: [], cheques: [], garantias: [], requisicoes: [], registros: [], observacoes: [], crm: null, visitas: [],
});
const trator = (extra: Partial<Trator> = {}): Trator =>
  ({ ID: "1775590358173", Modelo: "6075E CAB", Chassis: "MDI07513PS0006206", Cliente: "MARIA BEATRIZ", Entrega: "27/03/2026", Cidade: "Piraju", Vendedor: "Joaquim", ...extra }) as Trator;

describe("montarLinhaDoTempo", () => {
  it("entrega + revisões do trator (datas DD/MM), ordenadas da mais recente", () => {
    const r = montarLinhaDoTempo({ ...vazio(), trator: trator({ "50h Data": "07/04/2026", "50h Horimetro": "52", "300h Data": "", "300h Horimetro": "" }) });
    expect(r.eventos.map((e) => e.tipo)).toEqual(["revisao", "entrega"]);
    expect(r.eventos[0]).toMatchObject({ data: "2026-04-07", horimetro: 52, titulo: "Revisão de 50h registrada" });
    expect(r.eventos[1]).toMatchObject({ data: "2026-03-27", quem: "Joaquim" });
    expect(r.maquina?.modelo).toBe("6075E CAB");
    expect(r.horimetro_recente).toMatchObject({ valor: 52, data: "2026-04-07" });
  });

  it("OS do portal traz horímetro do técnico, PPVs ligados e horas da revisão; a mesma OS na Omie só completa NF", () => {
    const r = montarLinhaDoTempo({
      ...vazio(),
      osPortal: [
        { Id_Ordem: "OS-0597", Data: "2026-07-24", Data_Fim_Servico: "2026-07-27", Status: "Concluída", Tipo_Servico: "Revisão", Os_Tecnico: "DANILO", Valor_Total: "5673", ID_PPV: "PPV-0361", Ordem_Omie: "000000000005191", id_omie: 5191, Serv_Solicitado: "Revisão de 900 horas 6075" },
        { Id_Ordem: "OS-0146", Data: "2026-03-11", Status: "Concluída", Tipo_Servico: "Manutenção", Ordem_Omie: "2479753317" },
      ],
      tecnicos: [{ Ordem_Servico: "OS-0597", Horimetro: "905,5" }],
      osOmie: [
        { num_os: "5191", cod_os: 2500000001, empresa: "Nova Tratores", data_inclusao: "2026-07-27", data_faturamento: "2026-07-28", etapa: "60", status: null, valor_total: 5673, descricao: null, servicos: null, num_nf: "1234", link_nf: "https://nf/1234.pdf", num_pedido_cli: null, projeto: null },
        { num_os: "4738", cod_os: 2479753317, empresa: "Nova Tratores", data_inclusao: "2026-03-12", data_faturamento: null, etapa: "50", status: null, valor_total: 566, descricao: null, servicos: null, num_nf: null, link_nf: null, num_pedido_cli: null, projeto: null },
        { num_os: "4809", cod_os: 2483408327, empresa: "Nova Tratores", data_inclusao: "2026-03-30", data_faturamento: null, etapa: "60", status: null, valor_total: 814.4, descricao: null, servicos: '[{"desc":"MODELO: 6075E|CHASSI: MDI07513PS0006206|HOR: 310|Troca de óleo"}]', num_nf: null, link_nf: null, num_pedido_cli: "6802", projeto: "6075E CAB MDI07513PS0006206" },
      ],
    });
    const ids = r.eventos.map((e) => e.id);
    expect(ids).toEqual(["os-OS-0597", "osomie-Nova Tratores-4809", "os-OS-0146"]);
    const os597 = r.eventos[0];
    expect(os597).toMatchObject({ horimetro: 905.5, quem: "DANILO", status: "Concluída", valor: 5673, ligados: ["PPV-0361"] });
    expect(os597.titulo).toBe("OS-0597 · Revisão 900h");
    expect(os597.ref).toMatchObject({ tipo: "os", id_ordem: "OS-0597", cod_os: 2500000001, nf: "1234", link_nf: "https://nf/1234.pdf" });
    // OS 4809 só existe na Omie: horímetro do cabeçalho, PV citado, descrição limpa
    expect(r.eventos[1]).toMatchObject({ horimetro: 310, ligados: ["PV 6802"], detalhe: "Troca de óleo", status: "Faturada" });
    expect(r.eventos[1].ref).toMatchObject({ tipo: "os", id_ordem: null, cod_os: 2483408327, empresa: "Nova Tratores", ordem_omie: "4809" });
  });

  it("PPV que virou PV é um evento só; PV avulso entra como pv; cheques, garantia e requisição entram", () => {
    const r = montarLinhaDoTempo({
      ...vazio(),
      ppvs: [{ id_pedido: "PPV-0503", data: "06/10/2026 16:31", status: "Relatório Concluído", valor_total: 120, pedido_omie: "000000000006802", Id_Os: "OS-0817", tecnico: "DANILO" }],
      pvs: [
        { num_pedido: "6802", empresa: "Nova Tratores", data_inclusao: "2026-10-07", etapa: "60", valor_total: 125.5, faturado: "S", numero_nf: "99", cod_pedido: 1, link_nf: null },
        { num_pedido: "1517", empresa: "Castro Pecas", data_inclusao: "2024-02-20", etapa: "Faturado", valor_total: 30000, faturado: "S", numero_nf: "", cod_pedido: 5579487314, link_nf: null },
      ],
      chequesEmail: [{ id: 876, chassis: "MDI07513PS0006206", horas: "600", enviado_em: "2026-05-13T17:33:26Z", registro_manual: false }],
      cheques: [{ id: "c1", os_id: "OS-0597", horas: 900, assinado_em: "2026-07-28T10:00:00Z", assinado_nome: "Pedro", created_at: "2026-07-27T10:00:00Z", token: "tok" }],
      garantias: [{ id: "g1", numero: "GAR-0031", id_ordem: "OS-0605", status: "enviada", created_at: "2026-07-30T13:33:12Z" }],
      requisicoes: [{ id: 6400, titulo: "Filtro", tipo: "Trator-Cliente", status: "financeiro", valor_despeza: "150,00", created_at: "2026-08-01T10:00:00Z", data: "01/08/2026" }],
    });
    const porTipo = Object.fromEntries(r.eventos.map((e) => [e.id, e]));
    expect(porTipo["ppv-PPV-0503"]).toMatchObject({ tipo: "ppv", titulo: "PPV-0503 → PV 6802", valor: 125.5, ligados: ["OS-0817", "PV 6802"], detalhe: "Nova Tratores · NF 99" });
    expect(r.eventos.find((e) => e.id === "pv-Nova Tratores-6802")).toBeUndefined();
    expect(porTipo["pv-Castro Pecas-1517"]).toMatchObject({ tipo: "pv", status: "Faturado", valor: 30000 });
    expect(porTipo["chq-mail-876"]).toMatchObject({ tipo: "cheque", titulo: "Cheque de 600h enviado à Mahindra", data: "2026-05-13" });
    expect(porTipo["chq-c1"]).toMatchObject({ titulo: "Cheque de 900h assinado pelo cliente", quem: "Pedro", ligados: ["OS-0597"], ref: { tipo: "url", href: "/cheque/tok" } });
    expect(porTipo["gar-g1"]).toMatchObject({ tipo: "garantia", titulo: "GAR-0031 · OS-0605", ref: { tipo: "garantia", id: "g1" } });
    expect(porTipo["req-6400"]).toMatchObject({ tipo: "requisicao", valor: 150, data: "2026-08-01", ref: { tipo: "requisicao", id: 6400 } });
    // ordem desc por data
    const ts = r.eventos.map((e) => e.ts);
    expect([...ts].sort((a, b) => b - a)).toEqual(ts);
  });

  it("máquina do CRM entra sem data (fica no fim) com horímetro", () => {
    const r = montarLinhaDoTempo({ ...vazio(), crm: { id: 5, tipo: "Trator Usado", marca: "Mahindra", modelo: "6075", ano: 2024, numero_serie: "MDI07513PS0006206", horimetro: 1200, estado: "bom", observacoes: null }, trator: trator() });
    expect(r.eventos[r.eventos.length - 1]).toMatchObject({ tipo: "crm", titulo: "No CRM: Mahindra 6075", horimetro: 1200 });
    expect(r.horimetro_recente?.valor).toBe(1200);
  });
});
