import { beforeEach, describe, expect, it, vi } from "vitest";

// Ambiente "configurado" ANTES dos imports (que o vitest iça): config.ts lê
// as env na carga do módulo.
const { buscar, conversas, inboxes } = vi.hoisted(() => {
  process.env.CHATWOOT_URL = "https://zap.teste";
  process.env.CHATWOOT_ACCOUNT_ID = "1";
  process.env.CHATWOOT_API_TOKEN = "tok";
  return { buscar: vi.fn(), conversas: vi.fn(), inboxes: vi.fn() };
});
vi.mock("../cliente", () => ({
  buscarContatosPorTexto: (...a: unknown[]) => buscar(...a),
  listarConversasContato: (...a: unknown[]) => conversas(...a),
  listarInboxes: (...a: unknown[]) => inboxes(...a),
  TIMEOUT_BUSCA_MS: 10,
  TIMEOUT_CONVERSAS_MS: 10,
}));

import { buscarWhatsappDoCliente, MAX_CONTATOS } from "../contatos-cliente";

const contato = (id: number, ref: string, cargo?: string) => ({
  id,
  name: `C${id}`,
  phone_number: `+55149999900${String(id).padStart(2, "0")}`,
  custom_attributes: { cliente_ref: ref, cliente_cargo: cargo },
});

beforeEach(() => {
  buscar.mockReset();
  conversas.mockReset();
  inboxes.mockReset();
  inboxes.mockResolvedValue(new Map([[1, "WhatsApp"]]));
});

describe("buscarWhatsappDoCliente", () => {
  it("ok: busca por código com ':' e filtra exato; conversa vira resumo", async () => {
    buscar.mockResolvedValue([contato(1, "100:Nova Tratores", "Tratorista"), contato(2, "4100:Nova Tratores"), contato(3, "100:Nova Tratores", "Proprietário")]);
    conversas.mockImplementation(async (id: number) =>
      id === 3 ? [{ id: 77, status: "open", last_activity_at: 1757400000, inbox_id: 1, meta: { assignee: { name: "Ana" } } }] : []
    );
    const r = await buscarWhatsappDoCliente(["100"]);
    expect(buscar).toHaveBeenCalledWith("100:", 1, expect.anything());
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.contatos.map((c) => c.id)).toEqual([3, 1]); // Proprietário primeiro
    expect(r.contatos[0].ultima_conversa).toMatchObject({ display_id: 77, status_label: "Aberta", atendente: "Ana", inbox: "WhatsApp" });
    expect(r.contatos[0].ultima_conversa?.url).toBe("https://zap.teste/app/accounts/1/conversations/77");
    expect(r.contatos[1].ultima_conversa).toBeNull();
    expect(r.truncado).toBe(false);
  });

  it("sem_contatos quando nada casa exato", async () => {
    buscar.mockResolvedValue([contato(2, "4200:Nova")]);
    const r = await buscarWhatsappDoCliente(["200"]);
    expect(r).toEqual({ estado: "sem_contatos", codigos_consultados: ["200"] });
  });

  it("indisponivel quando TODAS as buscas falham (e não cacheia)", async () => {
    buscar.mockRejectedValue(new Error("NovaZap respondeu 503"));
    const r1 = await buscarWhatsappDoCliente(["300"]);
    expect(r1).toMatchObject({ estado: "indisponivel", motivo: "NovaZap respondeu 503" });
    buscar.mockResolvedValue([contato(9, "300:Nova")]);
    conversas.mockResolvedValue([]);
    const r2 = await buscarWhatsappDoCliente(["300"]);
    expect(r2.estado).toBe("ok");
  });

  it("falha só nas conversas não derruba a seção", async () => {
    buscar.mockResolvedValue([contato(1, "400:Nova")]);
    conversas.mockRejectedValue(new Error("timeout"));
    const r = await buscarWhatsappDoCliente(["400"]);
    expect(r.estado).toBe("ok");
    if (r.estado === "ok") expect(r.contatos[0].ultima_conversa).toBeNull();
  });

  it("truncado e cache por conjunto de códigos", async () => {
    const muitos = Array.from({ length: MAX_CONTATOS + 3 }, (_, i) => contato(i + 1, "500:Nova"));
    buscar.mockResolvedValue(muitos);
    conversas.mockResolvedValue([]);
    const r = await buscarWhatsappDoCliente(["500"]);
    expect(r.estado).toBe("ok");
    if (r.estado === "ok") {
      expect(r.contatos).toHaveLength(MAX_CONTATOS);
      expect(r.total).toBe(MAX_CONTATOS + 3);
      expect(r.truncado).toBe(true);
    }
    const chamadas = buscar.mock.calls.length;
    await buscarWhatsappDoCliente(["500"]);
    expect(buscar.mock.calls.length).toBe(chamadas); // veio do cache
  });

  it("vários códigos: uma busca por código, página 2 só quando a 1ª vem cheia", async () => {
    buscar.mockImplementation(async (q: string, page: number) => {
      if (q === "600:") return page === 1 ? Array.from({ length: 15 }, (_, i) => contato(i + 1, "600:Nova")) : [contato(99, "600:Nova")];
      return [contato(200, "601:Castro")];
    });
    conversas.mockResolvedValue([]);
    const r = await buscarWhatsappDoCliente(["600", "601"]);
    expect(buscar).toHaveBeenCalledWith("600:", 1, expect.anything());
    expect(buscar).toHaveBeenCalledWith("600:", 2, expect.anything());
    expect(buscar).toHaveBeenCalledWith("601:", 1, expect.anything());
    expect(buscar).not.toHaveBeenCalledWith("601:", 2, expect.anything());
    if (r.estado === "ok") expect(r.total).toBe(17);
  });
});
