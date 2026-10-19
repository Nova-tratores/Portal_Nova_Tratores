// Helpers server-side do módulo de Garantias
import { supabase } from '@/lib/pos/supabase';
import { TBL_GAR_EVENTOS } from './constants';
import { autenticar } from '@/lib/auth/server';
import type { UsuarioRota } from '@/lib/ajustes/permissao-server';

// Guarda "só login" das rotas que o /meu-painel chama (o painel do técnico é
// aberto a todo usuário logado, sem módulo — exigir 'garantias' ali quebraria o
// técnico). Mesmo formato do protegerRota: devolve o usuário OU a resposta 401.
export async function guardarLoginGarantias(
  req: Request,
): Promise<{ user: UsuarioRota; resposta?: undefined } | { resposta: Response; user?: undefined }> {
  const auth = await autenticar(req);
  if (!auth) {
    return {
      resposta: new Response(JSON.stringify({ ok: false, erro: 'nao autenticado', error: 'nao autenticado' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  let nome: string | undefined;
  try {
    const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).single();
    nome = (data as { nome?: string } | null)?.nome || undefined;
  } catch { /* segue sem nome */ }
  return { user: { id: auth.userId, email: auth.email ?? undefined, nome, isAdmin: auth.isAdmin, modulos: auth.modulos } };
}

// Registra um evento na timeline da garantia
export async function registrarEvento(
  garantiaId: string,
  params: {
    tipo: string;
    statusAnterior?: string | null;
    statusNovo?: string | null;
    ator?: string | null;
    detalhe?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from(TBL_GAR_EVENTOS).insert({
      garantia_id: garantiaId,
      tipo: params.tipo,
      status_anterior: params.statusAnterior ?? null,
      status_novo: params.statusNovo ?? null,
      ator: params.ator ?? null,
      detalhe: params.detalhe ?? null,
    });
  } catch (e) {
    console.error('[garantias] registrarEvento erro:', e);
  }
}

// Notifica o técnico (sininho do Meu Painel + push)
export async function notificarTecnico(
  tecnicoNome: string,
  params: { titulo: string; descricao?: string; link?: string }
): Promise<void> {
  if (!tecnicoNome) return;
  try {
    await supabase.from('mecanico_notificacoes').insert({
      tecnico_nome: tecnicoNome,
      tipo: 'garantia',
      titulo: params.titulo,
      descricao: params.descricao || null,
      link: params.link || '/meu-painel',
      lida: false,
    });
    const { pushParaTecnico } = await import('@/lib/push-mecanicos');
    await pushParaTecnico(tecnicoNome, {
      titulo: params.titulo,
      descricao: params.descricao || '',
      link: params.link || '/',
    });
  } catch (e) {
    console.error('[garantias] notificarTecnico erro:', e);
  }
}

// Notifica garantistas (usuários com o módulo 'garantias') e admins.
// Filtra quem silenciou notificações de 'garantias' nas preferências
// (mas Pós Vendas continua recebendo — obrigatório pra essa categoria).
export async function notificarGarantistas(params: {
  titulo: string;
  descricao?: string;
  link?: string;
}): Promise<void> {
  try {
    const { data: users } = await supabase
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .or('is_admin.eq.true,modulos_permitidos.cs.{garantias}');
    if (!users || users.length === 0) return;
    const { podeNotificar } = await import('@/lib/notif/prefs');
    const ids = [
      ...new Set(
        (users as Array<{ user_id: string; categoria: string | null; notif_silenciado: string[] | null }>)
          .filter((u) => podeNotificar('garantias', u.notif_silenciado, u.categoria))
          .map((u) => u.user_id)
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) return;
    await supabase.from('portal_notificacoes').insert(
      ids.map((user_id) => ({
        user_id,
        tipo: 'garantia',
        titulo: params.titulo,
        descricao: params.descricao || null,
        link: params.link || '/garantias',
      }))
    );
  } catch (e) {
    console.error('[garantias] notificarGarantistas erro:', e);
  }
}
