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
