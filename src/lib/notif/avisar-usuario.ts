// Aviso no sino para UMA pessoa, achada pelo e-mail do login (molde do notificarQuemFaturou do POS).
// Respeita o silenciar do módulo. Nunca lança: notificação não derruba nada.
import { supabase } from "@/lib/pos/supabase";
import { filtrarDestinatarios } from "@/lib/notif/prefs";

export async function avisarUsuarioPorEmail(email: string | null | undefined, tipo: string, titulo: string, descricao: string, link: string): Promise<void> {
  const e = String(email || "").trim();
  if (!e.includes("@")) return;
  try {
    const { data: u } = await supabase.from("financeiro_usu").select("id").ilike("email", e).limit(1);
    const userId = (u?.[0] as { id?: string } | undefined)?.id;
    if (!userId) return;
    const { data: pref } = await supabase.from("portal_permissoes").select("user_id, categoria, notif_silenciado").eq("user_id", userId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pref && filtrarDestinatarios(tipo as any, [pref as any]).length === 0) return;
    await supabase.from("portal_notificacoes").insert({ user_id: userId, tipo, titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link });
  } catch { /* sem aviso */ }
}
