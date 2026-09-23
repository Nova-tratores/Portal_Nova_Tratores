// Quem recebe o alerta central das PERGUNTAS do Tratorilson (até 5 usuários).
// GET devolve os escolhidos + todos os usuários do portal (pra tela escolher);
// PUT grava a lista (só Dev — a página da memória já é só-Dev).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const [{ data: notif }, { data: usuarios }] = await Promise.all([
    sb().from("tratorilson_notificados").select("email, nome").order("nome"),
    sb().from("financeiro_usu").select("nome, email, avatar_url").eq("ativo", true).order("nome"),
  ]);
  return NextResponse.json({
    notificados: notif || [],
    usuarios: (usuarios || []).filter((u) => u.email),
    aviso: notif === null ? "rode sql/tratorilson-perguntas.sql" : undefined,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth?.isDev) return NextResponse.json({ error: "só Dev" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const lista = Array.isArray(body?.notificados) ? body.notificados : null;
  if (!lista) return NextResponse.json({ error: "notificados obrigatório" }, { status: 400 });
  const limpos = lista
    .map((n: any) => ({ email: String(n?.email || "").trim().toLowerCase(), nome: String(n?.nome || "").trim() || null }))
    .filter((n: any) => n.email.includes("@"))
    .slice(0, 5); // até 5 usuários
  const cli = sb();
  const { error: eDel } = await cli.from("tratorilson_notificados").delete().neq("id", 0);
  if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });
  if (limpos.length) {
    const { error: eIns } = await cli.from("tratorilson_notificados").insert(limpos);
    if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, total: limpos.length });
}
