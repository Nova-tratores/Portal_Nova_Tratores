import { describe, it, expect } from "vitest";
import { documentosAnteriores } from "../omie-anteriores";

describe("documentosAnteriores", () => {
  it("OS-0596: OS 5185 → 5397 e pedido 7434 → 7816", () => {
    const os = [{ nfse: "84", ordemOmie: "5185", novaOmie: "5397", canceladaEm: "2026-10-23T17:25:46.674Z", nfseLink: "x.pdf" }];
    const peds = [{ id_pedido: "PPV-0359", faturamento_anterior: JSON.stringify([{ nf: "8457", pedidoOmie: "7434", novoPedido: "7816", canceladaEm: "2026-10-23T17:29:57Z" }]) }];
    expect(documentosAnteriores(os, peds)).toEqual([
      { tipo: "os", numero: "5185", novo: "5397", nota: "84", notaLink: "x.pdf", canceladaEm: "2026-10-23T17:25:46.674Z" },
      { tipo: "pedido", ppvId: "PPV-0359", numero: "7434", novo: "7816", nota: "8457", canceladaEm: "2026-10-23T17:29:57Z" },
    ]);
  });
  it("sem histórico ou JSON quebrado = vazio", () => {
    expect(documentosAnteriores(null, [{ id_pedido: "P", faturamento_anterior: "{quebrado" }])).toEqual([]);
  });
  it("tira zeros e ignora linha sem número", () => {
    const r = documentosAnteriores([{ ordemOmie: "000000000005185" }, { nfse: "1" }], []);
    expect(r).toHaveLength(1);
    expect(r[0].numero).toBe("5185");
    expect(r[0].novo).toBeNull();
  });
});
