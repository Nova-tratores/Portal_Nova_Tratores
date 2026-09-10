// GET /api/ppv/produtos-estoque?termo=...  → lista de "Peças em estoque"
// (tabela `produtos`, só com estoque > 0). Busca por código/descrição. Limitado.
import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProdutoEstoque {
  codigo: string; descricao: string; estoque: number; reservados: number; estoqueReal: number; valor: number; cmc: number; conta: string;
}

// Reservados = peças em PPVs na fase "Orçamento Aprovado" (checkbox de reserva
// do kanban — pedido confirmado, serviço agendado). Cache curto: a busca do
// modal bate aqui a cada tecla e a reserva não muda nesse ritmo.
let cacheReserva: { ts: number; mapa: Record<string, number> } | null = null;
async function mapaReservados(): Promise<Record<string, number>> {
  if (cacheReserva && Date.now() - cacheReserva.ts < 30000) return cacheReserva.mapa;
  const mapa: Record<string, number> = {};
  try {
    const peds = await supabaseFetch<Record<string, unknown>[]>(
      `pedidos?status=eq.${encodeURIComponent("Orçamento Aprovado")}&select=id_pedido&limit=1000`,
    );
    const ids = (peds || []).map((p) => String(p.id_pedido || "").trim()).filter(Boolean);
    if (ids.length) {
      const movs = await supabaseFetch<Record<string, unknown>[]>(
        `movimentacoes?Id_PPV=in.(${ids.map((x) => `"${x}"`).join(",")})&select=CodProduto,Qtde,TipoMovimento&limit=5000`,
      );
      for (const m of movs || []) {
        const cod = String(m.CodProduto || "").trim();
        if (!cod) continue;
        let qtd = Math.abs(Number(m.Qtde) || 0);
        if (String(m.TipoMovimento || "").toLowerCase().includes("devolu")) qtd = -qtd;
        mapa[cod] = (mapa[cod] || 0) + qtd;
      }
    }
  } catch { /* sem reserva — lista segue com 0 */ }
  cacheReserva = { ts: Date.now(), mapa };
  return mapa;
}

export async function GET(req: NextRequest) {
  const termo = (req.nextUrl.searchParams.get("termo") || "").trim();
  const q = termo.replace(/ /g, "%");
  const filtroBusca = q ? `&or=(codigo.ilike.*${q}*,descricao.ilike.*${q}*)` : "";
  try {
    let rows = await supabaseFetch<Record<string, unknown>[]>(
      `produtos?estoque=gt.0${filtroBusca}&select=codigo,descricao,estoque,valor_unitario,cmc,conta_omie&order=descricao.asc&limit=300`,
    ) || [];
    const reservaPorCod = await mapaReservados();

    // Sem busca, a página traz só os 300 primeiros por ordem alfabética — os
    // produtos COM RESERVA que ficam fora desse recorte nunca apareceriam no
    // topo. Busca eles à parte e põe na lista (mesmo com estoque zerado:
    // reserva estourando estoque é exatamente o que precisa aparecer).
    if (!q) {
      const naLista = new Set((rows).map((r) => String(r.codigo || "").trim()));
      const faltando = Object.keys(reservaPorCod).filter((c) => reservaPorCod[c] > 0 && !naLista.has(c));
      if (faltando.length) {
        const extras = await supabaseFetch<Record<string, unknown>[]>(
          `produtos?codigo=in.(${faltando.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})&select=codigo,descricao,estoque,valor_unitario,cmc,conta_omie`,
        ).catch(() => []);
        rows = [...(extras || []), ...rows];
      }
    }

    const lista: ProdutoEstoque[] = (rows || []).map((r) => {
      const codigo = String(r.codigo || "").trim();
      const estoque = Number(r.estoque) || 0;
      const reservados = Math.max(0, reservaPorCod[codigo] || 0);
      return {
        codigo,
        descricao: String(r.descricao || "").trim(),
        estoque,
        reservados,
        estoqueReal: estoque - reservados,
        valor: Number(r.valor_unitario) || 0,
        cmc: Number(r.cmc) || 0,
        conta: String(r.conta_omie || "").toUpperCase(),
      };
    });
    // Mais reservados primeiro; empate mantém a ordem alfabética
    lista.sort((a, b) => (b.reservados - a.reservados) || a.descricao.localeCompare(b.descricao));
    return NextResponse.json({ produtos: lista });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API ppv/produtos-estoque]", msg);
    return NextResponse.json({ error: msg, produtos: [] }, { status: 500 });
  }
}
