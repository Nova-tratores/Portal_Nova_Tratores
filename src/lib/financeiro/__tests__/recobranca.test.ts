import { describe, it, expect } from "vitest";
import {
  descricaoRecobranca, diasDeAtraso, escolherResponsavel, funcaoDoSetor, linkDoCard, nomeBlocoCobranca,
  setorDaRecobranca, somarDiasUteis, tituloRecobranca, ehFuncaoFinanceiro, type CardRecobranca,
} from "../recobranca";

const card: CardRecobranca = {
  id: 552, status: "vencido", nom_cliente: "MARCIO PINTO DE OLIVEIRA", valor_servico: "1500,5",
  forma_pagamento: "Boleto 30 dias", vencimento_boleto: "2026-10-01", num_nf_peca: "00009128",
  setor_destino: "pecas", cnpj_cliente: "53.317.583/0005-79", recombrancas_qtd: 0,
};

describe("setor e bloco", () => {
  it("peças vai para Peças; o resto para o Pós-Vendas", () => {
    expect(setorDaRecobranca(card)).toBe("pecas");
    expect(setorDaRecobranca({ setor_destino: null })).toBe("posvendas");
    expect(setorDaRecobranca({ setor_destino: "oficina" })).toBe("posvendas");
    expect(nomeBlocoCobranca("posvendas")).toBe("Cobranças — Pós-Vendas");
    expect(nomeBlocoCobranca("pecas")).toBe("Cobranças — Peças");
  });
  it("função do setor aceita as grafias do cadastro", () => {
    expect(funcaoDoSetor("Pós Vendas", "posvendas")).toBe(true);
    expect(funcaoDoSetor("Pós-Vendas", "posvendas")).toBe(true);
    expect(funcaoDoSetor("Peças", "pecas")).toBe(true);
    expect(funcaoDoSetor("Peças", "posvendas")).toBe(false);
    expect(funcaoDoSetor("Técnico", "posvendas")).toBe(false);
    expect(funcaoDoSetor(null, "pecas")).toBe(false);
    expect(ehFuncaoFinanceiro("Financeiro")).toBe(true);
    expect(ehFuncaoFinanceiro("Comercial")).toBe(false);
  });
  it("link abre o card na home do setor", () => {
    expect(linkDoCard(card)).toBe("/financeiro/home-pecas?id=552&tipo=boleto");
    expect(linkDoCard({ ...card, setor_destino: null })).toBe("/financeiro/home-posvendas?id=552&tipo=boleto");
  });
});

describe("rodízio do responsável", () => {
  const pessoas = [{ id: "a", nome: "Vinicius" }, { id: "b", nome: "Larissa" }, { id: "c", nome: "Nicolly" }];
  it("quem tem menos tickets abertos no bloco fica com o novo", () => {
    expect(escolherResponsavel(pessoas, new Map([["a", 0], ["b", 2], ["c", 1]]))?.id).toBe("a");
    expect(escolherResponsavel(pessoas, { a: 3, b: 2, c: 2 })?.nome).toBe("Larissa"); // empate → alfabética
  });
  it("sem ninguém com ticket: a primeira pelo nome", () => {
    expect(escolherResponsavel(pessoas, new Map())?.nome).toBe("Larissa");
  });
  it("lista vazia → null", () => {
    expect(escolherResponsavel([], new Map())).toBeNull();
  });
});

describe("prazo em dias úteis", () => {
  it("quinta + 2 = segunda", () => expect(somarDiasUteis("2026-10-29", 2)).toBe("2026-11-02"));
  it("pula feriado", () => expect(somarDiasUteis("2026-10-29", 2, new Set(["2026-11-02"]))).toBe("2026-11-03"));
  it("segunda + 2 = quarta", () => expect(somarDiasUteis("2026-10-26", 2)).toBe("2026-10-28"));
  it("sábado + 2 = terça", () => expect(somarDiasUteis("2026-10-31", 2)).toBe("2026-11-03"));
});

describe("título e descrição", () => {
  it("título com cliente, valor e vencimento", () => {
    expect(tituloRecobranca(card)).toBe("Recobrar MARCIO PINTO DE OLIVEIRA — R$ 1.500,50 (venceu 01/10)");
    expect(tituloRecobranca({ ...card, vencimento_boleto: null, nom_cliente: null })).toBe("Recobrar cliente sem nome — R$ 1.500,50");
  });
  it("dias de atraso", () => {
    expect(diasDeAtraso("2026-10-01", "2026-10-29")).toBe(28);
    expect(diasDeAtraso("2026-11-10", "2026-10-29")).toBe(0);
    expect(diasDeAtraso(null, "2026-10-29")).toBe(0);
  });
  it("descrição: de onde veio, dados, Omie e o que fazer", () => {
    const d = descricaoRecobranca({
      card, solicitanteNome: "Amelia", hoje: "2026-10-29", numero: 2, situacao: "atrasado",
      titulos: [{ status_titulo: "ATRASADO", valor_documento: 1500.5 }], link: linkDoCard(card),
    });
    expect(d).toContain("Pedido de recobrança do Financeiro por Amelia em 29/10/2026 — card #552 do Financeiro, 2ª recobrança.");
    expect(d).toContain("• CNPJ/CPF: 53.317.583/0005-79");
    expect(d).toContain("• NF: 9128");
    expect(d).toContain("• Valor: R$ 1.500,50");
    expect(d).toContain("• Vencimento: 01/10/2026 (28 dias de atraso)");
    expect(d).toContain("Situação no Omie: ATRASADO");
    expect(d).toContain("1 título em aberto, R$ 1.500,50");
    expect(d).toContain("1. Contatar o cliente (telefone/WhatsApp) e lembrar do boleto vencido;");
    expect(d).toContain("4. Ao terminar, marcar como resolvido.");
    expect(d).toContain("Card no Financeiro: /financeiro/home-pecas?id=552&tipo=boleto");
  });
  it("sem consulta ao Omie não põe a linha", () => {
    const d = descricaoRecobranca({ card, solicitanteNome: "X", hoje: "2026-10-29", numero: 1, link: "/x" });
    expect(d).not.toContain("Omie");
  });
});
