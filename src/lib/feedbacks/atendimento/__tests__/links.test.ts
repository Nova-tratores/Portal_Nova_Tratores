import { describe, expect, it } from "vitest";
import { linkNF, linkOS, linkPPV, linkPV, linkProjeto, SEM_ACESSO } from "../links";

const COM_TUDO = { pos: true, ppv: true };

describe("linkOS", () => {
  it("POS do portal: tela com módulo, PDF sem", () => {
    expect(linkOS({ id_ordem: "OS-0817" }, COM_TUDO)).toMatchObject({ href: "/pos?id=OS-0817", tipo: "tela" });
    expect(linkOS({ id_ordem: "OS-0817" }, SEM_ACESSO)).toMatchObject({ href: "/api/pos/ordens/OS-0817/print", tipo: "pdf" });
  });
  it("OS só da Omie: remontagem pelo cod_os + empresa; sem nada → null", () => {
    expect(linkOS({ id_ordem: null, cod_os: 2483408327, empresa: "Castro Pecas", ordem_omie: "4809" }, COM_TUDO)).toMatchObject({ href: "/api/clientes/print?tipo=os&cod=2483408327&empresa=Castro%20Pecas", tipo: "pdf", titulo: "Impressão da OS 4809 (Omie)" });
    expect(linkOS({ id_ordem: null, cod_os: null }, COM_TUDO)).toBeNull();
  });
});

describe("linkPPV / linkPV / linkNF / linkProjeto", () => {
  it("PPV: tela com módulo, PDF sem; vazio → null", () => {
    expect(linkPPV("PPV-0503", COM_TUDO)?.href).toBe("/ppv?id=PPV-0503");
    expect(linkPPV("PPV-0503", SEM_ACESSO)?.href).toBe("/api/ppv/pdf?id=PPV-0503");
    expect(linkPPV("", COM_TUDO)).toBeNull();
  });
  it("PV só da Omie usa cod_pedido; sem código → null", () => {
    expect(linkPV({ cod_pedido: 5579487314, empresa: "Castro Pecas", numero_pv: "1517" })?.href).toBe("/api/clientes/print?tipo=pv&cod=5579487314&empresa=Castro%20Pecas");
    expect(linkPV({ cod_pedido: null, empresa: null })).toBeNull();
  });
  it("NF só com URL válida", () => {
    expect(linkNF("https://x/nf.pdf", "77")).toMatchObject({ tipo: "nf", titulo: "Nota fiscal 77" });
    expect(linkNF("")).toBeNull();
    expect(linkNF("javascript:alert(1)")).toBeNull();
  });
  it("projeto → ficha da Pasta Clientes", () => {
    expect(linkProjeto({ nome: "6075E CAB MDI07513PS0006206", empresa: "Nova Tratores" })).toBe("/clientes/projeto?nome=6075E%20CAB%20MDI07513PS0006206&empresa=Nova%20Tratores");
    expect(linkProjeto(null)).toBeNull();
  });
});
