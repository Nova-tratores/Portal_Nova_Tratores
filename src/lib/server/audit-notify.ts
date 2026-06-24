import { createClient } from "@supabase/supabase-js";
import { filtrarDestinatarios, type PrefsDestinatario } from "@/lib/notif/prefs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// =============================================
// REGISTRAR NO AUDIT_LOG (server-side)
// =============================================
export async function registrarAuditLog(params: {
  userName: string;
  sistema: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  entidadeLabel?: string;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from("audit_log").insert([{
      user_id: "00000000-0000-0000-0000-000000000000", // server-side não tem user_id real
      user_nome: params.userName,
      sistema: params.sistema,
      acao: params.acao,
      entidade: params.entidade || null,
      entidade_id: params.entidadeId || null,
      entidade_label: params.entidadeLabel || null,
      detalhes: params.detalhes || {},
    }]);
  } catch (e) {
    console.error("[AuditLog] Erro:", e);
  }
}

// =============================================
// NOTIFICAR TODOS OS ADMINS
// =============================================
export async function notificarAdmins(params: {
  tipo: string;
  titulo: string;
  descricao?: string;
  link?: string;
  excludeUserName?: string;
}): Promise<void> {
  try {
    const { data: admins } = await supabase
      .from("portal_permissoes")
      .select("user_id, categoria, notif_silenciado")
      .eq("is_admin", true);

    if (!admins || admins.length === 0) return;

    // Se temos um userName para excluir, buscar o user_id dele
    let excludeId: string | null = null;
    if (params.excludeUserName) {
      const { data: usu } = await supabase
        .from("financeiro_usu")
        .select("id")
        .eq("nome", params.excludeUserName)
        .limit(1);
      if (usu && usu.length > 0) excludeId = usu[0].id;
    }

    // Respeita as preferências de silenciar (módulo = params.tipo).
    const elegiveis = (admins as PrefsDestinatario[]).filter((a) => a.user_id !== excludeId);
    const ids = filtrarDestinatarios(params.tipo, elegiveis);
    if (ids.length === 0) return;

    const destinatarios = ids.map((user_id) => ({
      user_id,
      tipo: params.tipo,
      titulo: params.titulo,
      descricao: params.descricao || null,
      link: params.link || null,
    }));

    await supabase.from("portal_notificacoes").insert(destinatarios);
  } catch (e) {
    console.error("[Notificar] Erro:", e);
  }
}

// =============================================
// COMBO: AUDIT LOG + NOTIFICAR ADMINS
// =============================================
export async function logAndNotify(params: {
  userName: string;
  sistema: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  entidadeLabel?: string;
  detalhes?: Record<string, unknown>;
  notifTitulo: string;
  notifDescricao?: string;
  notifLink?: string;
}): Promise<void> {
  await Promise.all([
    registrarAuditLog({
      userName: params.userName,
      sistema: params.sistema,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      entidadeLabel: params.entidadeLabel,
      detalhes: params.detalhes,
    }),
    notificarAdmins({
      tipo: params.sistema,
      titulo: params.notifTitulo,
      descricao: params.notifDescricao,
      link: params.notifLink,
      excludeUserName: params.userName,
    }),
  ]);
}
