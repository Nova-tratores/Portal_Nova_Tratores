// Publicação de um aviso: marca como publicado e faz o "leque" de notificações
// respeitando o DESTINO (setor). Usado tanto na publicação imediata (rota
// /api/avisos/publicar) quanto pelo cron dos agendados — assim a regra de quem
// recebe fica num lugar só.
import { supabase } from '@/lib/pos/supabase';

// destino guarda ou 'todos', ou uma categoria de portal_permissoes, ou 'tecnicos'.
export interface ResultadoPublicacao { ok: boolean; alvos?: number; erro?: string }

export async function publicarAviso(
  avisoId: string,
  opts: { notificarCriador?: boolean } = {},
): Promise<ResultadoPublicacao> {
  const { data: aviso } = await supabase.from('portal_avisos').select('*').eq('id', avisoId).single();
  if (!aviso) return { ok: false, erro: 'aviso não encontrado' };

  if (!aviso.publicado) {
    await supabase.from('portal_avisos').update({ publicado: true }).eq('id', avisoId);
  }

  const destino: string = aviso.destino || 'todos';
  const titulo: string = aviso.titulo;
  const conteudo: string = aviso.conteudo || '';
  const paraMecanicos = destino === 'todos' || destino === 'tecnicos';

  // ── Alvos no portal (sino) ──
  const { data: perms } = await supabase
    .from('portal_permissoes')
    .select('user_id, categoria, mecanico_role');
  let alvos = perms || [];
  if (destino === 'tecnicos') alvos = alvos.filter((p: any) => p.mecanico_role === 'tecnico');
  else if (destino !== 'todos') alvos = alvos.filter((p: any) => p.categoria === destino);

  const userIds = [...new Set(alvos.map((p: any) => p.user_id))].filter(
    (uid) => uid && uid !== aviso.criado_por,
  );
  if (userIds.length) {
    await supabase.from('portal_notificacoes').insert(
      userIds.map((uid) => ({
        user_id: uid, tipo: 'sistema',
        titulo: `Novo aviso: ${titulo}`, descricao: conteudo.slice(0, 120), link: '/avisos',
      })),
    );
  }

  // ── App dos mecânicos: só quando o aviso é pra todos ou pros técnicos ──
  if (paraMecanicos) {
    await supabase.from('avisos_gerais').insert({
      titulo, mensagem: conteudo,
      prioridade: aviso.prioridade === 'urgente' ? 'urgente' : 'normal',
      ativo: true, expira_em: null, criado_por: aviso.criado_por_nome || 'Admin',
    });
    const { data: tecs } = await supabase.from('portal_permissoes')
      .select('mecanico_tecnico_nome').not('mecanico_tecnico_nome', 'is', null);
    const nomes = [...new Set((tecs || []).map((t: any) => t.mecanico_tecnico_nome).filter(Boolean))];
    if (nomes.length) {
      await supabase.from('mecanico_notificacoes').insert(
        nomes.map((nome) => ({
          tecnico_nome: nome, tipo: 'aviso',
          titulo: `Aviso: ${titulo}`, descricao: conteudo.slice(0, 200), link: '/', lida: false,
        })),
      );
    }
  }

  // ── Avisa o próprio criador que o agendado saiu ──
  if (opts.notificarCriador && aviso.criado_por) {
    await supabase.from('portal_notificacoes').insert({
      user_id: aviso.criado_por, tipo: 'sistema',
      titulo: 'Seu aviso agendado foi publicado', descricao: titulo, link: '/avisos',
    });
  }

  return { ok: true, alvos: userIds.length };
}
