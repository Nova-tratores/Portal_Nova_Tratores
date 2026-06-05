import { supabase } from '@/lib/supabase'
import { podeNotificar } from '@/lib/notif/prefs'

/**
 * Notifica todos os admins do portal via portal_notificacoes.
 * Uso client-side (sem server import).
 *
 * O parâmetro `tipo` é também o ID do módulo origem da notificação
 * (ex: 'financeiro', 'garantia', 'requisicao'). Admins que silenciaram esse
 * módulo nas preferências não recebem — exceto se o módulo for obrigatório
 * pra categoria deles.
 */
export async function notificarAdminsClient(
  tipo: string,
  titulo: string,
  descricao?: string,
  link?: string
) {
  try {
    const { data: admins } = await supabase
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .eq('is_admin', true)

    if (!admins || admins.length === 0) return

    const destinatarios = (admins as Array<{ user_id: string; categoria: string | null; notif_silenciado: string[] | null }>)
      .filter((a) => podeNotificar(tipo, a.notif_silenciado, a.categoria))
      .map((a) => a.user_id)

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
