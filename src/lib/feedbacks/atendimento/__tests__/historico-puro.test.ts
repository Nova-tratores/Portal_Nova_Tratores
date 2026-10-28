import { describe, expect, it } from "vitest";
import { revisoesDoTrator, revisoesPendentes, servicoCancelado, vincularPedidosAsOS } from "../historico-puro";
import type { Compra, Servico } from "../puro";
import type { Trator } from "@/lib/revisoes/types";

const serv = (x: Partial<Servico>): Servico => ({
  origem: "omie", numero: null, data: null, descricao: null, tecnico: null, status: null, valor: null, empresa: null, projeto: null, ts: 0,
  id_ordem: null, ordem_omie: null, cod_os: null, link_nf: null, ppv_ids: [], pv_numero: null, chassi: null, ...x,
});
const compra = (x: Partial<Compra>): Compra => ({
  origem: "pv", numero_pv: null, id_ppv: null, data: null, status: null, valor: null, faturado: false, nf: null, empresa: null,
  os_id: null, link_nf: null, cod_pedido: null, projeto: null, tecnico: null, tipo: null, ts: 0, ...x,
});

describe("vincularPedidosAsOS", () => {
  it("põe o PPV na POS de origem (Id_Os) e pela lista ID_PPV da OS", () => {
    const s1 = serv({ id_ordem: "OS-0817" });
    const s2 = serv({ id_ordem: "OS-0900", ppv_ids: ["PPV-0202"] });
    const c1 = compra({ origem: "ppv", id_ppv: "PPV-0201", os_id: "os-0817" });
    const c2 = compra({ origem: "ppv", id_ppv: "ppv-0202" });
    const r = vincularPedidosAsOS([s1, s2], [c1, c2]);
    expect(r.servicos[0].pedidos).toEqual([c1]);
    expect(r.servicos[1].pedidos).toEqual([c2]);
    expect(r.avulsas).toEqual([]);
  });

  it("casa o PV citado na OS da Omie respeitando a empresa (Castro tem PV com o mesmo nº da Nova)", () => {
    const os = serv({ numero: "5191", empresa: "Nova Tratores", pv_numero: "6802" });
    const castro = compra({ numero_pv: "000000000006802", empresa: "Castro Pecas" });
    const nova = compra({ numero_pv: "6802", empresa: "NOVA" });
    const r = vincularPedidosAsOS([os], [castro, nova]);
    expect(r.servicos[0].pedidos).toEqual([nova]);
    expect(r.avulsas).toEqual([castro]);
  });

  it("cada pedido entra numa OS só; sem vínculo vai para o balcão", () => {
    const a = serv({ id_ordem: "OS-1", pv_numero: "10" });
    const b = serv({ id_ordem: "OS-2", pv_numero: "10" });
    const pv = compra({ numero_pv: "10" });
    const balcao = compra({ numero_pv: "99" });
    const r = vincularPedidosAsOS([a, b], [pv, balcao]);
    expect(r.servicos[0].pedidos).toEqual([pv]);
    expect(r.servicos[1].pedidos).toEqual([]);
    expect(r.avulsas).toEqual([balcao]);
  });

  it("PPV ligado à POS não é roubado pelo PV citado em outra OS", () => {
    const pos = serv({ id_ordem: "OS-5" });
    const omie = serv({ numero: "77", pv_numero: "300" });
    const c = compra({ origem: "ambos", id_ppv: "PPV-9", numero_pv: "300", os_id: "OS-5" });
    const r = vincularPedidosAsOS([omie, pos], [c]);
    expect(r.servicos[1].pedidos).toEqual([c]);
    expect(r.servicos[0].pedidos).toEqual([]);
  });
});

describe("servicoCancelado", () => {
  it("reconhece cancelada em qualquer caixa", () => {
    expect(servicoCancelado({ status: "Cancelada" })).toBe(true);
    expect(servicoCancelado({ status: "CANCELADO" })).toBe(true);
    expect(servicoCancelado({ status: "Faturada" })).toBe(false);
    expect(servicoCancelado({ status: null })).toBe(false);
  });
});

describe("revisoesDoTrator", () => {
  const t = (x: Partial<Trator>) => ({ ID: "1", Modelo: "6075E CAB", Chassis: "X", Entrega: "2025-08-29", ...x }) as Trator;

  it("lista inspeção e revisões feitas em ISO, com horímetro e o PDF do cheque", () => {
    const r = revisoesDoTrator(t({
      "Inspecao Data": "29/08/2025", "Inspecao Horimetro": "3",
      "50h Data": "09/10/2026", "50h Horimetro": "52", "50h PDF": "https://x/50.png",
      "300h Data": "2026-10-09", "300h Horimetro": "320,5",
    }));
    expect(r).toEqual([
      { rotulo: "Inspeção", horas: 0, data: "2025-08-29", horimetro: 3, pdf: null },
      { rotulo: "50h", horas: 50, data: "2026-10-09", horimetro: 52, pdf: "https://x/50.png" },
      { rotulo: "300h", horas: 300, data: "2026-10-09", horimetro: 320.5, pdf: null },
    ]);
  });

  it("aceita revisão só com horímetro e ignora as vazias", () => {
    const r = revisoesDoTrator(t({ "600h Horimetro": "590", "900h Data": "" }));
    expect(r.map((x) => x.rotulo)).toEqual(["600h"]);
    expect(r[0].data).toBeNull();
  });

  it("pendentes = o plano depois da maior revisão feita", () => {
    expect(revisoesPendentes([]).slice(0, 2)).toEqual(["50h", "300h"]);
    expect(revisoesPendentes(revisoesDoTrator(t({ "600h Data": "2026-01-01", "600h Horimetro": "600" })))[0]).toBe("900h");
    expect(revisoesPendentes(revisoesDoTrator(t({ "3000h Data": "2026-01-01", "3000h Horimetro": "3000" })))).toEqual([]);
  });
});
