import { describe, expect, it } from "vitest";
import {
  codigoDoClienteRef,
  filtrarContatosDoCliente,
  normalizarLocalizacoes,
  ordenarPorCargo,
  paraContatoWhatsapp,
  resumirConversa,
} from "../parsers";
import { linkWhatsapp, normalizarTelefoneWa } from "@/lib/feedbacks/telefone";
import type { ContatoBruto } from "../cliente";

const contato = (id: number, ca: Record<string, unknown>, extra: Partial<ContatoBruto> = {}): ContatoBruto => ({
  id,
  name: `Contato ${id}`,
  phone_number: "+5514999990000",
  custom_attributes: ca,
  ...extra,
});

describe("codigoDoClienteRef", () => {
  it("pega a parte antes do dois-pontos", () => {
    expect(codigoDoClienteRef("123:Nova Tratores")).toBe("123");
    expect(codigoDoClienteRef(" 45 : Castro Peças ")).toBe("45");
  });
  it("devolve null para vazio/nulo", () => {
    expect(codigoDoClienteRef("")).toBeNull();
    expect(codigoDoClienteRef(null)).toBeNull();
    expect(codigoDoClienteRef(":Nova")).toBeNull();
  });
});

describe("filtrarContatosDoCliente", () => {
  it("match exato: 123 não casa 4123 nem 1234", () => {
    const lista = [
      contato(1, { cliente_ref: "123:Nova Tratores" }),
      contato(2, { cliente_ref: "4123:Nova Tratores" }),
      contato(3, { cliente_ref: "1234:Nova Tratores" }),
      contato(4, { cliente_cod: "123" }),
    ];
    expect(filtrarContatosDoCliente(lista, ["123"]).map((c) => c.id)).toEqual([1, 4]);
  });
  it("aceita vários códigos e deduplica por id", () => {
    const lista = [
      contato(1, { cliente_ref: "10:Nova Tratores" }),
      contato(1, { cliente_ref: "10:Nova Tratores" }),
      contato(2, { cliente_ref: "20:Castro Peças" }),
    ];
    expect(filtrarContatosDoCliente(lista, ["10", "20"]).map((c) => c.id)).toEqual([1, 2]);
  });
  it("exclui funcionário e fornecedor mesmo com cliente_ref", () => {
    const lista = [
      contato(1, { cliente_ref: "7:Nova", tipo_contato: "funcionario" }),
      contato(2, { cliente_ref: "7:Nova", tipo_contato: "Fornecedor" }),
      contato(3, { cliente_ref: "7:Nova", tipo_contato: "cliente" }),
      contato(4, { cliente_ref: "7:Nova" }),
    ];
    expect(filtrarContatosDoCliente(lista, ["7"]).map((c) => c.id)).toEqual([3, 4]);
  });
  it("ignora contato sem atributos", () => {
    expect(filtrarContatosDoCliente([contato(1, {}), { id: 2 } as ContatoBruto], ["1"])).toEqual([]);
  });
});

describe("normalizarLocalizacoes", () => {
  it("array", () => {
    expect(normalizarLocalizacoes({ localizacoes: [{ nome: "Faz. Santa Rita", link: "https://maps/1" }] })).toEqual([
      { nome: "Faz. Santa Rita", link: "https://maps/1" },
    ]);
  });
  it("string JSON", () => {
    expect(normalizarLocalizacoes({ localizacoes: '[{"nome":"Sede","link":"https://maps/2"}]' })).toEqual([
      { nome: "Sede", link: "https://maps/2" },
    ]);
  });
  it("string inválida vira nome único sem link", () => {
    expect(normalizarLocalizacoes({ localizacoes: "atrás da igreja" })).toEqual([{ nome: "atrás da igreja", link: "" }]);
  });
  it("legado `localizacao` só quando não há lista", () => {
    expect(normalizarLocalizacoes({ localizacao: "-23.2,-49.3" })).toEqual([{ nome: "Localização", link: "-23.2,-49.3" }]);
    expect(normalizarLocalizacoes({ localizacao: "x", localizacoes: [{ nome: "A", link: "b" }] })).toEqual([{ nome: "A", link: "b" }]);
  });
  it("descarta itens vazios e preenche nome faltante", () => {
    expect(normalizarLocalizacoes({ localizacoes: [{}, { link: "https://maps/3" }] })).toEqual([{ nome: "Localização", link: "https://maps/3" }]);
  });
});

describe("ordenarPorCargo", () => {
  it("Proprietário primeiro, desconhecido por último, empate por atividade", () => {
    const lista = [
      { cargo: null, ultima_atividade: "2026-09-01T00:00:00.000Z" },
      { cargo: "Tratorista", ultima_atividade: "2026-09-02T00:00:00.000Z" },
      { cargo: "proprietario", ultima_atividade: "2026-01-01T00:00:00.000Z" },
      { cargo: "Gerente", ultima_atividade: "2026-09-03T00:00:00.000Z" },
      { cargo: "Tratorista", ultima_atividade: "2026-09-05T00:00:00.000Z" },
      { cargo: "Sócio", ultima_atividade: "2026-09-09T00:00:00.000Z" },
    ];
    expect(ordenarPorCargo(lista).map((c) => `${c.cargo}|${c.ultima_atividade?.slice(5, 10)}`)).toEqual([
      "proprietario|01-01",
      "Gerente|09-03",
      "Tratorista|09-05",
      "Tratorista|09-02",
      "Sócio|09-09",
      "null|09-01",
    ]);
  });
});

describe("resumirConversa", () => {
  it("rótulo pt-BR, unix→ISO, atendente, inbox e url", () => {
    const r = resumirConversa(
      { id: 42, status: "resolved", last_activity_at: 1757400000, inbox_id: 3, unread_count: 2, meta: { assignee: { name: "Ana" } } },
      new Map([[3, "WhatsApp Loja"]])
    );
    expect(r.display_id).toBe(42);
    expect(r.status_label).toBe("Resolvida");
    expect(r.ultima_atividade).toBe(new Date(1757400000 * 1000).toISOString());
    expect(r.atendente).toBe("Ana");
    expect(r.inbox).toBe("WhatsApp Loja");
    expect(r.nao_lidas).toBe(2);
    expect(r.url.endsWith("/conversations/42")).toBe(true);
  });
  it("status desconhecido vira capitalizado; sem atendente vira null", () => {
    const r = resumirConversa({ id: 1, status: "weird", meta: { assignee: null } });
    expect(r.status_label).toBe("Weird");
    expect(r.atendente).toBeNull();
    expect(r.ultima_atividade).toBeNull();
  });
});

describe("paraContatoWhatsapp", () => {
  it("monta o contato com cargo, telefone normalizado e fazendas", () => {
    const c = paraContatoWhatsapp(
      contato(9, { cliente_ref: "9:Nova", cliente_cargo: "Proprietário", localizacoes: [{ nome: "Sede", link: "l" }] }, { name: " Zé ", phone_number: "+55 (14) 99863-8071" }),
      null
    );
    expect(c).toMatchObject({ id: 9, nome: "Zé", cargo: "Proprietário", telefone_wa: "5514998638071", cliente_ref: "9:Nova", ultima_conversa: null });
    expect(c.localizacoes).toEqual([{ nome: "Sede", link: "l" }]);
  });
  it("cai no cliente_telefone quando o contato não tem phone_number", () => {
    const c = paraContatoWhatsapp(contato(1, { cliente_telefone: "(14) 3351-1234" }, { phone_number: null }), null);
    expect(c.telefone_wa).toBe("551433511234");
  });
});

describe("telefone", () => {
  it("normaliza com e sem DDI, máscara e vazio", () => {
    expect(normalizarTelefoneWa("+55 (14) 99863-8071")).toBe("5514998638071");
    expect(normalizarTelefoneWa("14998638071")).toBe("5514998638071");
    expect(normalizarTelefoneWa("(14) 3351-1234")).toBe("551433511234");
    expect(normalizarTelefoneWa("")).toBeNull();
    expect(normalizarTelefoneWa(null)).toBeNull();
    expect(normalizarTelefoneWa("1234")).toBeNull();
  });
  it("DDD 55 (RS) não é confundido com DDI", () => {
    expect(normalizarTelefoneWa("55 99999-8888")).toBe("5555999998888");
  });
  it("linkWhatsapp com e sem texto", () => {
    expect(linkWhatsapp("14998638071")).toBe("https://wa.me/5514998638071");
    expect(linkWhatsapp("14998638071", "Olá")).toBe("https://wa.me/5514998638071?text=Ol%C3%A1");
    expect(linkWhatsapp("")).toBeNull();
  });
});
