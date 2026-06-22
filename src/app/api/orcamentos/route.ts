import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

export const dynamic = "force-dynamic";

// Marca se o orçamento já passou da validade (created_at + validade dias).
// "expirado" é calculado — o status salvo pode continuar 'ativo'.
function calcExpiracao(createdAt: string | null, validade: number | null) {
  const dias = Number(validade) || 0;
  if (!createdAt || !dias) return { expirado: false, vencimento: null as string | null };
  const venc = new Date(new Date(createdAt).getTime() + dias * 86400000);
  return { expirado: venc.getTime() < Date.now(), vencimento: venc.toISOString() };
}

// GET /api/orcamentos?os=<id>  -> orçamentos vinculados à OS (detalhe completo)
// GET /api/orcamentos?q=<termo> -> busca para o modal de vincular (lista leve)
export async function GET(req: NextRequest) {
  const os = (req.nextUrl.searchParams.get("os") || "").trim();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  // ----- Busca para o modal de vincular (param ?q presente) -----
  if (req.nextUrl.searchParams.has("q")) {
    let query = supabase
      .from("orcamentos")
      .select("id, numero, tipo, cliente_nome, cliente_cidade, total, status, validade, created_at, ordem_servico")
      .order("id", { ascending: false })
      .limit(50);
    if (q) {
      query = query.or(`numero.ilike.%${q}%,cliente_nome.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[orcamentos GET busca]", error.message);
      return NextResponse.json({ orcamentos: [] });
    }
    const orcamentos = (data || []).map((o) => ({
      ...o,
      ...calcExpiracao(o.created_at, o.validade),
    }));
    return NextResponse.json({ orcamentos });
  }

  // ----- Orçamentos vinculados a uma OS -----
  if (!os) return NextResponse.json({ orcamentos: [] });

  const { data, error } = await supabase
    .from("orcamentos")
    .select("*")
    .eq("ordem_servico", os)
    .order("id", { ascending: false });
  if (error) {
    console.error("[orcamentos GET os]", error.message);
    return NextResponse.json({ orcamentos: [] });
  }

  const orcamentos = (data || []).map((o) => {
    const exp = calcExpiracao(o.created_at, o.validade);
    return {
      id: o.id,
      numero: o.numero,
      tipo: o.tipo,
      cliente_nome: o.cliente_nome,
      observacao: o.observacao || "",
      validade: o.validade,
      itens: Array.isArray(o.itens) ? o.itens : [],
      mao_obra: o.mao_obra || null,
      deslocamento: o.deslocamento || null,
      total: Number(o.total) || 0,
      status: o.status,
      criado_por: o.criado_por,
      created_at: o.created_at,
      ordem_servico: o.ordem_servico,
      expirado: exp.expirado,
      vencimento: exp.vencimento,
    };
  });

  return NextResponse.json({ orcamentos });
}
