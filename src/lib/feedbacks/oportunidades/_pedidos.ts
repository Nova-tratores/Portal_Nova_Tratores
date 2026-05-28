// Helpers compartilhados pra ler `pedidos_venda_relatorio` — tabela sincronizada
// do Omie pelo projeto OMIE (server.js do diretorio /OMIE), que mantém histórico
// longo de Pedidos de Venda da NOVA e CASTRO.
//
// Antes usávamos `pedidos` (tabela PPV interna do Portal, que só tem dados
// recentes de 2026). Agora usamos a fonte canônica do Omie pra ter histórico
// completo para R3 (up-sell) e R5 (venda de peças).
//
// IMPORTANTE: datas em `pedidos_venda_relatorio` são TEXT no formato
// "DD/MM/YYYY" (sem hora) ou "DD/MM/YYYY HH:MM". Comparação direta string
// falha lexicograficamente. Use parseDataBR().

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";

export function parseDataBR(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[\s T]+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "0", min = "0"] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  return isNaN(d.getTime()) ? null : d;
}

export interface PedidoVendaRow {
  empresa: string;
  numero_venda: string;
  cliente: string | null;
  data_abertura: string | null;
  data_emissao: string | null;
  vendedor: string | null;
  valor_total: number | null;
  etapa: string | null;
  cancelada: string | null;
  devolvido: string | null;
}

// Info do último pedido de um cliente — usado pra mostrar nos cards de
// oportunidade qual foi a última interação concreta.
export interface UltimoPedidoInfo {
  data: Date;
  numero_venda: string;
  empresa: string;
  etapa: string | null;
  valor_total: number | null;
  vendedor: string | null;
}

// Lê todos pedidos de venda (NOVA + CASTRO, ambos são "casa") e retorna mapa
// cliente_norm → info do último pedido. Ignora cancelados.
export async function carregarUltimoPedidoPorCliente(): Promise<Map<string, UltimoPedidoInfo>> {
  const pedidos = await lerTudo<PedidoVendaRow>((from, to) =>
    supabase
      .from("pedidos_venda_relatorio")
      .select("empresa, numero_venda, cliente, data_abertura, data_emissao, vendedor, valor_total, etapa, cancelada, devolvido")
      .range(from, to)
  );

  const out = new Map<string, UltimoPedidoInfo>();
  for (const p of pedidos) {
    if (!p.cliente) continue;
    // cancelada vem como "SIM"/"NAO"; ignorar SIM
    if ((p.cancelada || "").toUpperCase() === "SIM") continue;

    const dataStr = p.data_abertura || p.data_emissao;
    const d = parseDataBR(dataStr);
    if (!d) continue;

    const key = p.cliente.trim().toUpperCase();
    const atual = out.get(key);
    if (!atual || d > atual.data) {
      out.set(key, {
        data: d,
        numero_venda: p.numero_venda,
        empresa: p.empresa,
        etapa: p.etapa,
        valor_total: p.valor_total,
        vendedor: p.vendedor,
      });
    }
  }
  return out;
}

export function mesesEntre(de: Date, ate: Date): number {
  const ms = ate.getTime() - de.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
}
