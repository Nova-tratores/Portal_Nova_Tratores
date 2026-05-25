// Helpers server-side do módulo de Garantias
import { supabase } from '@/lib/pos/supabase';
import { TBL_GAR_EVENTOS } from './constants';

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
  } catch (e) {
    console.error('[garantias] notificarTecnico erro:', e);
  }
}

// Notifica garantistas (usuários com o módulo 'garantias') e admins
export async function notificarGarantistas(params: {
  titulo: string;
  descricao?: string;
  link?: string;
}): Promise<void> {
  try {
    const { data: users } = await supabase
      .from('portal_permissoes')
      .select('user_id')
      .or('is_admin.eq.true,modulos_permitidos.cs.{garantias}');
    if (!users || users.length === 0) return;
    const ids = [...new Set(users.map((u) => u.user_id).filter(Boolean))];
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
