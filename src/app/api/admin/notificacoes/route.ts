// Administração → Notificações (José, 29/10/2026: "jogar o 'Minhas notificações' lá em Administração, onde a gente
// controla isso e vê o que cada app aciona de pessoas").
// GET (Admin/Dev): todos os usuários ativos com o que cada um silenciou + quantos avisos cada tipo mandou nos últimos 30 dias.
// PATCH (Admin): { user_id, silenciados } grava as preferências daquela pessoa (os obrigatórios do cargo não saem).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { paginar } from "@/lib/db/paginar";
import { MODULOS_NOTIFICAVEIS, sanitizarSilenciados } from "@/lib/notif/prefs";

export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.isDev) return NextResponse.json({ error: "só Admin" }, { status: 403 });
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [usu, perms, notifs] = await Promise.all([
    sb.from("financeiro_usu").select("id, nome, email, funcao, avatar_url").eq("ativo", true).order("nome"),
    sb.from("portal_permissoes").select("user_id, categoria, is_admin, is_dev, modulos_permitidos, notif_silenciado"),
    paginar((a, b) => sb.from("portal_notificacoes").select("user_id, tipo, created_at").gte("created_at", desde).order("created_at", { ascending: false }).range(a, b)).catch(() => ({ data: [] as Rec[] })),
  ]);
  if (usu.error) return NextResponse.json({ error: usu.error.message }, { status: 500 });
  const permDe = new Map(((perms.data || []) as Rec[]).map((p) => [String(p.user_id), p]));
  const usuarios = ((usu.data || []) as Rec[]).map((u) => {
    const p = permDe.get(String(u.id)) || {};
    return {
      id: String(u.id), nome: String(u.nome || ""), email: String(u.email || ""), funcao: String(u.funcao || ""), avatar_url: (u.avatar_url as string) || null,
      categoria: (p.categoria as string) || null, isAdmin: !!p.is_admin, isDev: !!p.is_dev,
      modulos: Array.isArray(p.modulos_permitidos) ? (p.modulos_permitidos as string[]) : [],
      silenciados: Array.isArray(p.notif_silenciado) ? (p.notif_silenciado as string[]).map(String) : [],
    };
  });
  // por tipo de aviso: quantos, para quantas pessoas, o último; e por pessoa
  const porTipo: Record<string, { total: number; pessoas: Record<string, number>; ultimo: string }> = {};
  for (const n of (notifs.data || []) as Rec[]) {
    const tipo = String(n.tipo || "sem tipo");
    const t = (porTipo[tipo] ||= { total: 0, pessoas: {}, ultimo: String(n.created_at) });
    t.total++;
    const uid = String(n.user_id || "");
    if (uid) t.pessoas[uid] = (t.pessoas[uid] || 0) + 1;
  }
  return NextResponse.json({ usuarios, modulos: MODULOS_NOTIFICAVEIS, porTipo, desde, podeEditar: auth.isAdmin });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth?.isAdmin) return NextResponse.json({ error: "só Admin" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const userId = String(body?.user_id || "");
  const lista = Array.isArray(body?.silenciados) ? (body.silenciados as unknown[]).map(String) : null;
  if (!userId || !lista) return NextResponse.json({ error: "user_id e silenciados obrigatórios" }, { status: 400 });
  const validos = new Set(MODULOS_NOTIFICAVEIS.map((m) => m.id));
  const { data: p } = await sb.from("portal_permissoes").select("categoria").eq("user_id", userId).maybeSingle();
  const silenciados = sanitizarSilenciados(lista.filter((m) => validos.has(m)), (p as Rec | null)?.categoria as string | null);
  const { error } = await sb.from("portal_permissoes")
    .upsert({ user_id: userId, notif_silenciado: silenciados, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(`[admin/notificacoes] ${auth.email} mudou as notificações de ${userId}: silenciados=${silenciados.join(",") || "nenhum"}`);
  return NextResponse.json({ ok: true, silenciados });
}
