// Carrinhos — fecha automaticamente os que passaram de 7 dias (expira_em < agora).
// Chamado pelo GitHub Actions (.github/workflows/carrinhos-auto-fechar.yml) com x-cron-secret.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }
  const agora = new Date().toISOString();
  const { data: vencidos, error } = await supabase
    .from("carrinhos").select("id").eq("status", "aberto").lt("expira_em", agora).limit(500);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  let fechados = 0;
  for (const c of vencidos || []) {
    const { error: e2 } = await supabase.from("carrinhos").update({ status: "fechado", atualizado_em: agora }).eq("id", c.id);
    if (!e2) {
      fechados++;
      await supabase.from("carrinho_historico").insert({ carrinho_id: c.id, quem: "Sistema", acao: "fechar", detalhe: "Fechado automaticamente (7 dias)" });
    }
  }
  return NextResponse.json({ ok: true, fechados });
}

export async function POST(req: NextRequest) { return executar(req); }
export async function GET(req: NextRequest) { return executar(req); }
