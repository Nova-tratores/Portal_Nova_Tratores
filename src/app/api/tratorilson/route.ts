import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/auth/server";

// Painel de acompanhamento do Tratorilson (só admin/dev). Lê tratorilson_log e
// tratorilson_config com service role (as tabelas têm RLS, sem acesso de cliente).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function inicioMesISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// GET — dados do painel: limite, uso do mês, por usuário e a lista (com filtros).
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const usuario = (sp.get("usuario") || "").trim();
  const desde = (sp.get("desde") || "").trim();
  const ate = (sp.get("ate") || "").trim();

  const { data: cfg } = await supabase
    .from("tratorilson_config").select("limite_tokens_mes").eq("id", 1).maybeSingle();
  const limite = Number(cfg?.limite_tokens_mes || 0);

  // Agregados do mês corrente (soma em JS).
  const { data: mesRows } = await supabase
    .from("tratorilson_log").select("user_nome, tokens").gte("created_at", inicioMesISO());
  let tokensMes = 0;
  const porUser = new Map<string, { tokens: number; n: number }>();
  for (const r of mesRows || []) {
    const t = Number(r.tokens) || 0;
    tokensMes += t;
    const nome = (r as { user_nome?: string }).user_nome || "—";
    const cur = porUser.get(nome) || { tokens: 0, n: 0 };
    cur.tokens += t; cur.n += 1;
    porUser.set(nome, cur);
  }
  const porUsuario = [...porUser.entries()]
    .map(([nome, v]) => ({ nome, tokens: v.tokens, solicitacoes: v.n }))
    .sort((a, b) => b.tokens - a.tokens);
  const solicitacoesMes = (mesRows || []).length;

  // Lista com filtros (até 200 mais recentes).
  let q = supabase
    .from("tratorilson_log")
    .select("id, created_at, user_nome, tipo, pergunta, resposta, modelo, tokens")
    .order("created_at", { ascending: false })
    .limit(200);
  if (usuario) q = q.eq("user_nome", usuario);
  if (desde) q = q.gte("created_at", desde);
  if (ate) q = q.lte("created_at", `${ate}T23:59:59`);
  const { data: logs } = await q;

  return NextResponse.json({
    limite,
    tokensMes,
    solicitacoesMes,
    porUsuario,
    usuarios: porUsuario.map((u) => u.nome).filter((n) => n !== "—"),
    logs: logs || [],
  });
}

// PATCH — define o teto mensal de tokens.
export async function PATCH(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const limite = Math.max(0, parseInt(String(body.limite_tokens_mes ?? 0), 10) || 0);
  const { error } = await supabase
    .from("tratorilson_config")
    .upsert({ id: 1, limite_tokens_mes: limite, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, limite_tokens_mes: limite });
}
