import { supabase } from '@/lib/supabase'
import { podeNotificar } from '@/lib/notif/prefs'

/**
 * Notifica sobre uma mudança via portal_notificacoes.
 *
 * REGRAS:
 * - Recebem: os ADMINISTRADORES + quem tem ACESSO ao módulo de origem (`tipo`).
 * - NUNCA notifica o próprio autor da ação (o usuário logado é excluído).
 * - Respeita as preferências de silenciar do destinatário.
 *
 * O parâmetro `tipo` é o ID do módulo origem (ex: 'financeiro', 'requisicoes').
 * Obs.: só chame esta função quando houver MUDANÇA real — não em clique/foco.
 */
export async function notificarAdminsClient(
  tipo: string,
  titulo: string,
  descricao?: string,
  link?: string
) {
  try {
    // autor da ação (logado) — pra não notificar ele mesmo
    const { data: { session } } = await supabase.auth.getSession()
    const selfId = session?.user?.id

    // admins OU quem tem o módulo em modulos_permitidos
    const { data: pessoas } = await supabase
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .or(`is_admin.eq.true,modulos_permitidos.cs.{${tipo}}`)

    if (!pessoas || pessoas.length === 0) return

    const destinatarios = [...new Set(
      (pessoas as Array<{ user_id: string; categoria: string | null; notif_silenciado: string[] | null }>)
        .filter((a) => a.user_id && a.user_id !== selfId)
        .filter((a) => podeNotificar(tipo, a.notif_silenciado, a.categoria))
        .map((a) => a.user_id)
    )]

    if (destinatarios.length === 0) return

    await supabase.from('portal_notificacoes').insert(
      destinatarios.map((user_id) => ({
        user_id,
        tipo,
        titulo,
        descricao: descricao || null,
        link: link || null,
      }))
    )
  } catch (e) {
    console.error('[notificarAdmins] Erro:', e)
  }
}
