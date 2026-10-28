// Janela "Histórico do cliente" (CRM/RFM/Oportunidades) — funções PURAS.
// O carregador (historico-db.ts) reaproveita as fontes do cockpit; aqui cada
// pedido de venda vai para dentro da ordem de serviço a que pertence e o
// controle de revisões Mahindra (`tratores`) vira uma linha do tempo.

import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";
import { isoData, norm, semZeros, type Compra, type Servico } from "./puro";

// -----------------------------------------------------------------------------
// OS com o PV/PPV dentro
// -----------------------------------------------------------------------------
export interface ServicoComPedidos extends Servico {
  /** PV/PPV de peças ligados a esta OS (pela POS, pelo PPV ou pelo PV citado na OS Omie) */
  pedidos: Compra[];
}

/** "Castro Peças" / "Castro Pecas" / "CASTRO" → "CASTRO"; "Nova Tratores" / "NOVA" → "NOVA". */
function chaveEmpresa(e: string | null | undefined): string {
  return norm(String(e ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")).split(/\s+/)[0] || "";
}

/** OS cancelada (fica esmaecida na lista). */
export function servicoCancelado(s: Pick<Servico, "status">): boolean {
  return /cancel/i.test(String(s.status ?? ""));
}

/**
 * Coloca cada compra dentro da OS a que pertence. Ordem de confiança:
 *  1. PPV que diz a POS de origem (`pedidos.Id_Os` = `Ordem_Servico.Id_Ordem`);
 *  2. POS que cita o PPV (`Ordem_Servico.ID_PPV`);
 *  3. OS Omie que cita o nº do PV (`num_pedido_cli`) — a Castro tem PV com o
 *     mesmo número da Nova, então quando os dois lados dizem a empresa ela
 *     precisa bater.
 * Cada compra entra numa OS só; o que sobra é balcão (avulsa).
 * Mantém a ordem recebida (mais recente primeiro, como `unificarServicos`/`unificarCompras`).
 */
export function vincularPedidosAsOS(servicos: Servico[], compras: Compra[]): { servicos: ServicoComPedidos[]; avulsas: Compra[] } {
  const out: ServicoComPedidos[] = servicos.map((s) => ({ ...s, pedidos: [] }));
  const usadas = new Set<Compra>();
  const porIdOrdem = new Map<string, ServicoComPedidos>();
  const porPpv = new Map<string, ServicoComPedidos>();
  for (const s of out) {
    if (s.id_ordem && !porIdOrdem.has(norm(s.id_ordem))) porIdOrdem.set(norm(s.id_ordem), s);
    for (const p of s.ppv_ids) if (!porPpv.has(norm(p))) porPpv.set(norm(p), s);
  }
  const poe = (s: ServicoComPedidos, c: Compra) => { s.pedidos.push(c); usadas.add(c); };

  // 1 e 2: vínculo POS ↔ PPV (qualquer um dos lados)
  for (const c of compras) {
    const s = (c.os_id ? porIdOrdem.get(norm(c.os_id)) : undefined) ?? (c.id_ppv ? porPpv.get(norm(c.id_ppv)) : undefined);
    if (s) poe(s, c);
  }
  // 3: PV citado na OS da Omie
  for (const s of out) {
    if (!s.pv_numero) continue;
    const alvo = semZeros(s.pv_numero);
    const emp = chaveEmpresa(s.empresa);
    const c = compras.find((x) => !usadas.has(x) && semZeros(x.numero_pv) === alvo && (!emp || !chaveEmpresa(x.empresa) || chaveEmpresa(x.empresa) === emp));
    if (c) poe(s, c);
  }
  return { servicos: out, avulsas: compras.filter((c) => !usadas.has(c)) };
}

// -----------------------------------------------------------------------------
// Revisões Mahindra (tabela `tratores`)
// -----------------------------------------------------------------------------
export interface RevisaoFeita {
  /** "Inspeção" ou "50h", "300h"… */
  rotulo: string;
  /** horas nominais da revisão (0 = inspeção de entrega) */
  horas: number;
  data: string | null; // ISO
  horimetro: number | null;
  /** foto/PDF do cheque guardado no controle de revisões */
  pdf: string | null;
}

function numHorimetro(v: unknown): number | null {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function urlOuNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/**
 * Revisões registradas no controle (data e/ou horímetro preenchidos), da
 * inspeção de entrega à 3000h, na ordem das horas. As datas vêm misturadas
 * (DD/MM/YYYY e YYYY-MM-DD) e saem em ISO.
 */
export function revisoesDoTrator(t: Trator): RevisaoFeita[] {
  const out: RevisaoFeita[] = [];
  const insData = isoData(t["Inspecao Data"]);
  const insHor = numHorimetro(t["Inspecao Horimetro"]);
  if (insData || insHor != null) out.push({ rotulo: "Inspeção", horas: 0, data: insData, horimetro: insHor, pdf: urlOuNull(t["Inspecao PDF"]) });
  for (const rev of REVISOES_LISTA) {
    const data = isoData(t[`${rev} Data`]);
    const hor = numHorimetro(t[`${rev} Horimetro`]);
    if (!data && hor == null) continue;
    out.push({ rotulo: rev, horas: parseInt(rev, 10), data, horimetro: hor, pdf: urlOuNull(t[`${rev} PDF`]) });
  }
  return out;
}

/** Revisões do plano Mahindra que ainda não constam (para a linha do tempo mostrar o que falta). */
export function revisoesPendentes(feitas: RevisaoFeita[]): string[] {
  const maior = Math.max(0, ...feitas.map((r) => r.horas));
  return REVISOES_LISTA.filter((r) => parseInt(r, 10) > maior);
}
