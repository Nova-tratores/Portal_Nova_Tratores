import { describe, it, expect } from "vitest";
import { avaliar, montarFila, mensagemPesquisa, linkWhatsApp, precisaAlerta } from "../fila";
import type { FeedbackRegistro } from "../types";

const AGORA = Date.parse("2026-10-23T12:00:00-03:00");
const reg = (x: Partial<FeedbackRegistro> & Record<string, unknown> = {}): FeedbackRegistro => ({
  id: 1, tipo: "crm", nome: "JOAO DA SILVA (FAZENDA X)", telefone: "(14) 99812-3344", email: null, trator: "Mahindra 6075", tecnico: "Gabriel Moraes // Danilo",
  codigo_omie: "1", data_contato: null, servico: "Revisão", data_servico: "2026-10-18", status_cliente: null, nota: null, feedback: null, nps: null, melhoria: null,
  ultimo_servico: null, motivo: null, prioridade: null, acao: null, sem_resposta: false, revisao_confirmada: null, tentativas: [],
  atendente_id: null, atendente_nome: null, aberto_em: null, concluido_em: null, status_atendimento: "aberto", arquivado_motivo: null, origem_dados: null,
  criado_em: "2026-10-21", atualizado_em: "2026-10-21", ...x,
} as FeedbackRegistro);

describe("fila do CRM/RFM", () => {
  it("serviço de ontem espera; de 5 dias é ligar hoje; de 20 dias é atrasado", () => {
    expect(avaliar(reg({ data_servico: "2026-10-22" }), AGORA)).toMatchObject({ acao: "aguardar", aPartirDe: "2026-10-25" });
    expect(avaliar(reg(), AGORA)).toMatchObject({ acao: "ligar", oQueFazer: "Ligar hoje", dias: 5 });
    expect(avaliar(reg({ data_servico: "2026-10-03" }), AGORA).porque).toContain("atrasado");
  });
  it("valor alto e insatisfeito sobem; quem já tentou hoje vai para amanhã; 3 tentativas = WhatsApp", () => {
    const base = avaliar(reg(), AGORA).pontos;
    expect(avaliar(reg({ os_valor: 5000 } as never), AGORA).pontos).toBeGreaterThan(base);
    expect(avaliar(reg({ status_cliente: "Insatisfeito" }), AGORA).pontos).toBeGreaterThan(base + 50);
    expect(avaliar(reg({ tentativas: [{ data: "2026-10-23T09:00:00-03:00", canal: "telefone" }] }), AGORA)).toMatchObject({ acao: "retentar" });
    const tres = [1, 2, 3].map((d) => ({ data: `2026-10-2${d - 1}T09:00:00-03:00`, canal: "telefone" as const }));
    expect(avaliar(reg({ tentativas: tres }), AGORA).acao).toBe("whatsapp");
  });
  it("retorno combinado e concluído", () => {
    expect(avaliar(reg({ proximo_contato_em: "2026-10-30" }), AGORA)).toMatchObject({ acao: "aguardar", aPartirDe: "2026-10-30" });
    expect(avaliar(reg({ status_atendimento: "concluido" }), AGORA).acao).toBe("concluido");
  });
  it("RFM pela prioridade; a fila põe o que dá para fazer agora na frente", () => {
    const urg = reg({ id: 2, tipo: "rfm", prioridade: "Urgente", ultimo_servico: "2025-10-01" });
    const ina = reg({ id: 3, tipo: "rfm", prioridade: "Inativo", ultimo_servico: "2025-10-01" });
    const espera = reg({ id: 4, data_servico: "2026-10-22" });
    expect(montarFila([ina, espera, urg], AGORA).map((i) => i.registro.id)).toEqual([2, 3, 4]);
  });
  it("mensagem e link do WhatsApp; alerta de nota baixa", () => {
    const m = mensagemPesquisa(reg());
    expect(m).toContain("Olá, Joao!");
    expect(m).toContain("Mahindra 6075");
    expect(m).toContain("técnico Gabriel Moraes");
    expect(linkWhatsApp("(14) 99812-3344", "oi")).toBe("https://wa.me/5514998123344?text=oi");
    expect(linkWhatsApp(null, "oi")).toBeNull();
    expect(precisaAlerta({ nota: 6, status_cliente: null })).toBe(true);
    expect(precisaAlerta({ nota: 8, status_cliente: "Satisfeito" })).toBe(false);
    expect(precisaAlerta({ nota: null, status_cliente: "Insatisfeito" })).toBe(true);
  });
});
