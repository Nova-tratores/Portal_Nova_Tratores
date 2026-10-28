import { describe, expect, it } from "vitest";
import { chassiDeTexto, maquinaDoMotivo, maquinasDosMotivos, mesmoChassiFinal, revisoesDaMaquina, rotuloMaquina, servicosDaMaquina } from "../maquina-modal";
import { preverRevisao } from "../previsao-revisao";
import type { EventoMaquina } from "../atendimento/maquina";
import type { Motivo } from "../hoje";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-10-23T12:00:00-03:00");
const ev = (x: Partial<EventoMaquina> & Pick<EventoMaquina, "id" | "tipo" | "titulo">): EventoMaquina => ({
  data: null, detalhe: null, horimetro: null, status: null, valor: null, quem: null, ref: { tipo: "nenhum" }, ligados: [], ts: x.data ? Date.parse(`${x.data}T12:00:00`) : 0, ...x,
});

describe("qual máquina é", () => {
  it("chassi num texto livre", () => {
    expect(chassiDeTexto("6075 ZK00331")).toBe("ZK00331");
    expect(chassiDeTexto("Mahindra 6075 - MBNAAFRPXLKG04973")).toBe("MBNAAFRPXLKG04973");
    expect(chassiDeTexto("Chassi: MDI04973X")).toBe("MDI04973X");
    expect(chassiDeTexto("trator do sítio")).toBeNull();
  });

  it("motivo de revisão traz modelo, chassi e projeto", () => {
    const m = { id: "rev:1", fonte: "revisao", revisao: { trator: { id: "1", modelo: "6075", chassi: "MBNAAFRPXLKG04973", cliente: "Maria", cidade: null, vendedor: null, telefone: null, codigo_omie: null, projeto: { nome: "MAHINDRA 6075 MBNAAFRPXLKG04973", empresa: "Castro Pecas" }, previsao: {} } } } as unknown as Motivo;
    const r = maquinaDoMotivo(m)!;
    expect(r.chassi).toBe("MBNAAFRPXLKG04973");
    expect(rotuloMaquina(r)).toBe("Mahindra 6075 · chassi …G04973 · projeto Omie “MAHINDRA 6075 …G04973” (Castro)");
  });

  it("pós-serviço pega o trator escrito no atendimento; sem máquina devolve null", () => {
    const comTrator = { id: "reg:1", fonte: "registro", registro: { trator: "6075 ZK00331" } } as unknown as Motivo;
    expect(maquinaDoMotivo(comTrator)).toMatchObject({ chassi: "ZK00331", modelo: "6075" });
    expect(maquinaDoMotivo({ id: "op:1", fonte: "oportunidade", oportunidade: { trator: null, chassis: null } } as unknown as Motivo)).toBeNull();
  });

  it("motivo sem chassi pega a máquina do mesmo modelo do cliente", () => {
    const rev = { id: "rev:1", fonte: "revisao", revisao: { trator: { id: "1", modelo: "6075", chassi: "MBNAAFRPXLKG04973", projeto: null, previsao: {} } } } as unknown as Motivo;
    const op = { id: "op:1", fonte: "oportunidade", oportunidade: { trator: "Mahindra 6075", chassis: null } } as unknown as Motivo;
    const [, b] = maquinasDosMotivos([rev, op]);
    expect(b?.chassi).toBe("MBNAAFRPXLKG04973");
  });

  it("mesmo chassi pelo final", () => {
    expect(mesmoChassiFinal("MBNAAFRPXLKG04973", "PXLKG04973")).toBe(true);
    expect(mesmoChassiFinal("ABC", "ABC")).toBe(false);
  });
});

describe("revisões da máquina", () => {
  const p = preverRevisao({
    entrega: "2024-10-01",
    pontos: [
      { data: "2024-11-20", horas: 52, fonte: "revisao", rotulo: "Revisão 50 h", revisao: 50 },
      { data: "2025-09-10", horas: 610, fonte: "revisao", rotulo: "Revisão 600 h", revisao: 600 },
    ],
    revisoesFeitas: [50, 600],
  }, AGORA);

  it("marca a que faltou na sequência e põe a próxima em cima", () => {
    const l = revisoesDaMaquina([
      ev({ id: "rev-50h", tipo: "revisao", data: "2024-11-20", titulo: "Revisão de 50h registrada", horimetro: 52 }),
      ev({ id: "chq-1", tipo: "cheque", data: "2025-09-12", titulo: "Cheque de 600h assinado pelo cliente", status: "assinado", ref: { tipo: "url", href: "/cheque/x", rotulo: "Abrir cheque" } }),
    ], p);
    expect(l[0].estado === "proxima" || l[0].estado === "atrasada").toBe(true);
    expect(l[0].rev).toBe(p.revisaoOferta);
    const por = Object.fromEntries(l.map((x) => [x.rev, x]));
    expect(por[300].estado).toBe("faltou");
    expect(por[600]).toMatchObject({ estado: "feita", link: { href: "/cheque/x" } });
    expect(por[50]).toMatchObject({ estado: "feita", origem: "controle de revisões", horimetro: 52 });
  });

  it("cheque pendente não conta como feita; sem previsão mostra só as feitas", () => {
    const l = revisoesDaMaquina([ev({ id: "c", tipo: "cheque", data: "2025-01-01", titulo: "Cheque de 300h gerado (sem assinatura)", status: "pendente" })], null);
    expect(l).toEqual([]);
  });
});

describe("serviços da máquina", () => {
  it("liga o PPV de peças e o pós-serviço do CRM à OS", () => {
    const os = ev({ id: "os-OS-1", tipo: "os", data: "2026-08-01", titulo: "OS-1 · Revisão", ref: { tipo: "os", id_ordem: "OS-1", cod_os: null, empresa: null, ordem_omie: "77", link_nf: null, nf: null }, ligados: ["PPV-9"] });
    const ppv = ev({ id: "ppv-PPV-9", tipo: "ppv", data: "2026-08-01", titulo: "PPV-9", ref: { tipo: "ppv", id: "PPV-9" }, ligados: ["OS-1"], valor: 100 });
    const pv = ev({ id: "pv-x", tipo: "pv", data: "2026-01-01", titulo: "PV solto", ligados: ["PV 5"] });
    const at = ev({ id: "at-1", tipo: "atendimento", data: "2026-08-06", titulo: "Atendimento CRM" });
    const longe = ev({ id: "at-2", tipo: "atendimento", data: "2026-12-30", titulo: "Atendimento RFM" });
    const s = servicosDaMaquina([longe, at, pv, ppv, os]);
    expect(s).toHaveLength(1);
    expect(s[0].pecas.map((x) => x.id)).toEqual(["ppv-PPV-9"]);
    expect(s[0].posServico.map((x) => x.id)).toEqual(["at-1"]);
  });

  it("mais recentes primeiro, até o máximo", () => {
    const oss = [1, 2, 3].map((n) => ev({ id: `os-${n}`, tipo: "os", data: new Date(AGORA - n * 30 * DIA).toLocaleDateString("sv-SE"), titulo: `OS ${n}` }));
    expect(servicosDaMaquina(oss, 2).map((x) => x.os.id)).toEqual(["os-1", "os-2"]);
  });
});
