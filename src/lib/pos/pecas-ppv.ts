import { supabase } from './supabase';
import { TBL_ITENS } from './constants';
import { TBL_PEDIDOS } from '@/lib/ppv/constants';

export interface ValorPecasPPV {
  /** soma das movimentações (Saída − Devolução), sem desconto */
  bruto: number;
  /** desconto percentual de cada PPV convertido em R$ */
  desconto: number;
  /** bruto − desconto — é o que entra no Valor_Total da OS */
  total: number;
}

/**
 * Valor das peças dos PPVs vinculados COM o desconto percentual de cada
 * pedido aplicado — a mesma conta do valor_total do próprio PPV
 * (atualizarValorTotal em lib/ppv/queries). Antes cada consumidor somava as
 * movimentações BRUTAS e o desconto dado no PPV não chegava na OS (caso real
 * reportado em 30/09/2026: desconto nas peças não mudava o total da OS).
 *
 * Mesmas regras do cálculo antigo: agrupa por produto (devolução abate;
 * produto zerado não conta), só que POR PPV, pra aplicar o desconto certo
 * quando a OS tem mais de um pedido vinculado.
 */
export async function valorPecasDosPPVs(ids: string[]): Promise<ValorPecasPPV> {
  const r: ValorPecasPPV = { bruto: 0, desconto: 0, total: 0 };
  const lista = (ids || []).map((s) => String(s).trim()).filter(Boolean);
  if (!lista.length) return r;

  const [itensQ, pedsQ] = await Promise.all([
    supabase.from(TBL_ITENS).select('Id_PPV, CodProduto, Preco, Qtde, TipoMovimento').in('Id_PPV', lista),
    supabase.from(TBL_PEDIDOS).select('id_pedido, desconto_percentual').in('id_pedido', lista),
  ]);
  const descPct = new Map<string, number>();
  for (const p of pedsQ.data || []) {
    descPct.set(String(p.id_pedido), parseFloat(String(p.desconto_percentual ?? 0)) || 0);
  }

  const porChave = new Map<string, { ppv: string; qtde: number; totalFin: number }>();
  for (const item of itensQ.data || []) {
    const ppv = String(item.Id_PPV || '');
    const chave = `${ppv}|${item.CodProduto}`;
    const preco = parseFloat(item.Preco || 0) || 0;
    let qtd = Math.abs(parseFloat(item.Qtde || 0) || 0);
    if (String(item.TipoMovimento || '').toLowerCase().includes('devolu')) qtd = -qtd;
    const g = porChave.get(chave) || { ppv, qtde: 0, totalFin: 0 };
    g.qtde += qtd;
    g.totalFin += preco * qtd;
    porChave.set(chave, g);
  }
  const brutoPorPpv = new Map<string, number>();
  for (const g of porChave.values()) {
    if (g.qtde !== 0) brutoPorPpv.set(g.ppv, (brutoPorPpv.get(g.ppv) || 0) + g.totalFin);
  }
  for (const [ppv, bruto] of brutoPorPpv) {
    const pct = Math.min(100, Math.max(0, descPct.get(ppv) || 0));
    r.bruto += bruto;
    r.desconto += bruto * (pct / 100);
  }
  r.total = r.bruto - r.desconto;
  return r;
}
