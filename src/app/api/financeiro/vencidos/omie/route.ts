// POST /api/financeiro/vencidos/omie { ids: number[] } → situação de cada card no Omie
// (contas_receber já sincronizado): recebido / atrasado / em aberto / não achado, com as parcelas.
// Usado pela tela Vencidos (29/10/2026). Mesma conferência do robô de fases.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import {
  buscarTitulos, titulosDoCard, situacaoDosTitulos, valorProprio, COLUNAS_CARD, type CardFase,
} from "@/lib/financeiro/fases-automaticas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter(Number.isFinite).slice(0, 500);
    if (!ids.length) return NextResponse.json({ cards: {} });
    const { data, error } = await supabase.from("Chamado_NF").select(COLUNAS_CARD).in("id", ids);
    if (error) throw new Error(error.message);
    const cards = (data || []) as CardFase[];
    const titulos = await buscarTitulos(supabase, cards);
    const out: Record<number, unknown> = {};
    for (const c of cards) {
      const meus = titulosDoCard(c, titulos, c.vencimento_boleto, valorProprio(c));
      out[c.id] = {
        situacao: situacaoDosTitulos(meus),
        titulos: meus.map((t) => ({
          parcela: t.numero_parcela, vencimento: t.data_vencimento, pagamento: t.data_pagamento,
          valor: t.valor_documento, status: t.status_titulo, empresa: t.conta_omie,
        })),
      };
    }
    return NextResponse.json({ cards: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[financeiro/vencidos/omie]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
