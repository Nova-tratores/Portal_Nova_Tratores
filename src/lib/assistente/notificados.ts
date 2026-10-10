// Quem recebe os avisos do Tratorilson (alerta de pergunta, "precisa de
// atendimento" e mensagem nova no NovaZap com o robô desligado):
// SEMPRE os Devs + os usuários escolhidos na página de Administração
// (tabela tratorilson_notificados, por e-mail). Só server-side.
import { createClient } from "@supabase/supabase-js";
import type { Autenticado } from "@/lib/auth/server";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function emailsNotificados(): Promise<string[]> {
  const { data } = await sb().from("tratorilson_notificados").select("email");
  return (data || []).map((n) => String(n.email || "").trim().toLowerCase()).filter(Boolean);
}

export async function souNotificadoTratorilson(auth: Pick<Autenticado, "isDev" | "email">): Promise<boolean> {
  if (auth.isDev) return true;
  const meu = String(auth.email || "").toLowerCase();
  return !!meu && (await emailsNotificados()).includes(meu);
}

// user_ids de quem recebe (Devs + escolhidos) — pra gravar no sino (portal_notificacoes)
export async function destinatariosTratorilson(): Promise<string[]> {
  const cli = sb();
  const [{ data: devs }, emails] = await Promise.all([
    cli.from("portal_permissoes").select("user_id").eq("is_dev", true),
    emailsNotificados(),
  ]);
  const ids = new Set((devs || []).map((d) => String(d.user_id)).filter(Boolean));
  if (emails.length) {
    const { data: usu } = await cli.from("financeiro_usu").select("id, email").eq("ativo", true);
    for (const u of usu || []) {
      if (emails.includes(String(u.email || "").toLowerCase())) ids.add(String(u.id));
    }
  }
  return [...ids];
}

// ── Quem vê o alerta em JANELA (modal) × quem recebe só no sino ──────────────
// Decisão do José (10/10/2026): o modal "Cliente precisando de atendimento" /
// "O Tratorilson não sabe responder" cobria qualquer tela (até a Frota) de
// todo Dev e de todo escolhido no Admin. Agora o MODAL é só de quem é do
// pós-vendas; os demais da lista recebem o aviso no SINO (portal_notificacoes).

/** É do pós-vendas: categoria "Pós Vendas" OU o módulo `pos` dado explicitamente
 *  (NÃO vale o atalho de admin/dev, que passa em qualquer módulo). */
export function ehPosVendas(p: { categoria?: string | null; modulos?: string[] | null }): boolean {
  if (String(p.categoria || "").trim().toLowerCase() === "pós vendas") return true;
  return (p.modulos || []).includes("pos");
}

/** Recebe o alerta central em modal: está na lista do Tratorilson E é do pós-vendas. */
export async function recebeAlertaCentral(auth: Pick<Autenticado, "isDev" | "email" | "categoria" | "modulos">): Promise<boolean> {
  if (!ehPosVendas(auth)) return false;
  return souNotificadoTratorilson(auth);
}

const JANELA_SINO_MS = 30 * 60_000;

/** Aviso no SINO para quem está na lista do Tratorilson e NÃO é do pós-vendas
 *  (esses não veem mais o modal). Um aviso por link a cada 30 min. Nunca lança
 *  erro: o aviso é acessório, não pode derrubar quem chamou. */
export async function notificarTratorilson(a: { titulo: string; descricao?: string | null; link?: string | null; icone?: string }): Promise<number> {
  try {
    const cli = sb();
    const link = a.link || "/tratorilson";
    const desde = new Date(Date.now() - JANELA_SINO_MS).toISOString();
    const { data: recente } = await cli
      .from("portal_notificacoes").select("id")
      .eq("tipo", "novazap").eq("link", link).eq("titulo", a.titulo)
      .gte("created_at", desde).limit(1);
    if (recente?.length) return 0;

    const ids = await destinatariosTratorilson();
    if (!ids.length) return 0;
    const { data: perms } = await cli
      .from("portal_permissoes").select("user_id, categoria, modulos_permitidos").in("user_id", ids);
    const posVendas = new Set(
      (perms || [])
        .filter((p) => ehPosVendas({ categoria: p.categoria, modulos: p.modulos_permitidos }))
        .map((p) => String(p.user_id)),
    );
    const rows = ids.filter((id) => !posVendas.has(id)).map((user_id) => ({
      user_id,
      tipo: "novazap",
      titulo: a.titulo.slice(0, 200),
      descricao: (a.descricao || "").slice(0, 300) || null,
      link,
      icone: a.icone || "💬",
    }));
    if (!rows.length) return 0;
    const { error } = await cli.from("portal_notificacoes").insert(rows);
    if (error) { console.error("[notificarTratorilson]", error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.error("[notificarTratorilson]", (e as Error).message);
    return 0;
  }
}
