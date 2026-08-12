// Rastreio de peças — lado servidor: sessão, transições de estado (com guarda
// de concorrência) e notificações. Escrita em peca_unidades acontece SÓ aqui
// (as rotas /api/pecas/unidades/* chamam transicionar; RLS não tem policy de
// escrita).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/pos/supabase';
import { httpErr } from '@/lib/ajustes/cmc';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { filtrarDestinatarios } from '@/lib/notif/prefs';
import { TRANSICOES, type PecaUnidade, type UnidadeAcao } from './unidades';

export interface Ator {
  id: string | null; // null = sistema (cron)
  nome: string;
}

// Valida a sessão do Supabase (Bearer token) SEM exigir módulo — qualquer
// usuário autenticado (portal ou app dos mecânicos, mesmo auth.users) pode
// marcar retirada. Base: exigirPermissao de lib/ajustes/permissao-server.
export async function exigirSessao(req: Request): Promise<{ id: string; email?: string; nome: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw httpErr(401, 'não autenticado');

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) throw httpErr(401, 'sessão inválida');

  let nome = '';
  try {
    const { data: usu } = await supabase.from('financeiro_usu').select('nome').eq('id', user.id).single();
    nome = (usu as any)?.nome || '';
  } catch { /* segue sem nome */ }

  return { id: user.id, email: user.email, nome: nome || user.email || 'Usuário' };
}

// Quem pode liberar/recusar/receber: espelha pode('ppv','rastreio_liberar')
export async function podeLiberarUnidades(userId: string): Promise<boolean> {
  const { data: perm } = await supabase
    .from('portal_permissoes')
    .select('is_admin, is_dev, modulos_permitidos')
    .eq('user_id', userId)
    .maybeSingle();
  const p = perm as any;
  if (!p) return false;
  if (p.is_admin === true || p.is_dev === true) return true;
  const mods: string[] = p.modulos_permitidos || [];
  return mods.includes('ppv') || mods.includes('ppv:rastreio_liberar');
}

interface ExtrasTransicao {
  destino_tipo?: string | null;
  destino_os?: string | null;
  destino_obs?: string;
  motivo?: string;
  aplicarDireto?: boolean;
  payload?: Record<string, unknown>;
}

const LIMPA_RETIRADA = {
  destino_tipo: null,
  destino_os: null,
  destino_obs: '',
  retirado_por: null,
  retirado_por_nome: '',
  retirado_em: null,
  liberado_por: null,
  liberado_em: null,
};

// Aplica uma transição validada da máquina de estados. Guarda de concorrência:
// o UPDATE filtra pelo status atual — 0 linhas afetadas = alguém mudou antes
// (409, recarregue). Registra evento na timeline + audit_log (best-effort).
export async function transicionar(
  unidadeId: string,
  acao: UnidadeAcao,
  ator: Ator,
  extras: ExtrasTransicao = {},
): Promise<{ unidade: PecaUnidade; de: string; para: string }> {
  const t = TRANSICOES[acao];
  if (!t) throw httpErr(400, `ação desconhecida: ${acao}`);

  const { data: atual } = await supabase
    .from('peca_unidades')
    .select('*')
    .eq('id', unidadeId)
    .maybeSingle();
  if (!atual) throw httpErr(404, 'Unidade não encontrada.');
  const u = atual as PecaUnidade;

  if (!t.de.includes(u.status)) {
    throw httpErr(400, `Ação "${acao}" não vale para o estado atual (${u.status}).`);
  }

  const agora = new Date().toISOString();
  let para = t.para;
  const patch: Record<string, unknown> = { updated_at: agora };

  switch (acao) {
    case 'retirar':
      patch.destino_tipo = extras.destino_tipo || null;
      patch.destino_os = extras.destino_os || null;
      patch.destino_obs = extras.destino_obs || '';
      patch.retirado_por = ator.id;
      patch.retirado_por_nome = ator.nome;
      patch.retirado_em = agora;
      break;
    case 'liberar':
      patch.liberado_por = ator.id;
      patch.liberado_em = agora;
      // balcão/uso interno pode já sair aplicada (não volta pra prateleira)
      if (extras.aplicarDireto && u.destino_tipo !== 'os') {
        para = 'aplicada';
        patch.aplicado_em = agora;
      }
      break;
    case 'concluir':
    case 'aplicar_cron':
      patch.aplicado_em = agora;
      break;
    case 'receber_devolucao':
      patch.devolvido_em = agora;
      Object.assign(patch, LIMPA_RETIRADA);
      break;
    case 'recusar':
    case 'cancelar_retirada':
    case 'recuperar':
      Object.assign(patch, LIMPA_RETIRADA);
      break;
    default:
      break; // devolver, devolver_cron, cancelar, extraviar: só muda o status
  }
  patch.status = para;

  const { data: atualizada, error } = await supabase
    .from('peca_unidades')
    .update(patch)
    .eq('id', unidadeId)
    .eq('status', u.status) // guarda de concorrência
    .select('*');
  if (error) throw httpErr(500, `Falha ao atualizar: ${error.message}`);
  if (!atualizada || atualizada.length === 0) {
    throw httpErr(409, 'O estado da unidade mudou — recarregue a página.');
  }

  await supabase.from('peca_unidade_eventos').insert({
    unidade_id: unidadeId,
    autor_id: ator.id,
    autor_nome: ator.nome,
    tipo: t.evento,
    de_status: u.status,
    para_status: para,
    payload: {
      ...(extras.destino_tipo ? { destino_tipo: extras.destino_tipo } : {}),
      ...(extras.destino_os ? { destino_os: extras.destino_os } : {}),
      ...(extras.motivo ? { motivo: extras.motivo } : {}),
      ...(extras.payload || {}),
    },
  });
  // "liberar e já concluir" pula o estado 'liberada' — registra também o
  // evento de aplicação, senão relatórios por tipo='aplicacao' perdem toda
  // venda balcão/uso interno e a timeline termina em "liberada"
  if (acao === 'liberar' && para === 'aplicada') {
    await supabase.from('peca_unidade_eventos').insert({
      unidade_id: unidadeId,
      autor_id: ator.id,
      autor_nome: ator.nome,
      tipo: 'aplicacao',
      de_status: 'liberada',
      para_status: 'aplicada',
      payload: { origem: 'manual', aplicar_direto: true },
    });
  }

  // audit best-effort (nunca derruba a transição)
  try {
    await registrarAuditLog({
      userId: ator.id || undefined,
      userName: ator.nome,
      sistema: 'ppv',
      acao: `rastreio_${acao}`,
      entidade: 'peca_unidade',
      entidadeId: unidadeId,
      entidadeLabel: `${u.numero} · ${u.codigo}`,
      detalhes: { de: u.status, para, ...(extras.destino_os ? { os: extras.destino_os } : {}) },
    });
  } catch { /* segue */ }

  return { unidade: { ...u, ...(patch as object), status: para } as PecaUnidade, de: u.status, para };
}

// Responsáveis por peças: admins/devs + quem tem 'ppv' puro ou o granular
// 'ppv:rastreio_liberar'. cs.{ppv} dentro do or= não casa a chave granular
// (e a chave com ':' quebra o parser) — então: uma query pra admins/módulo
// puro e um .contains() separado pro granular, merge por user_id. Depois
// passa pelo silenciamento de notificações (prefs).
const COLS_PERM = 'user_id, categoria, notif_silenciado, is_admin, is_dev, modulos_permitidos';

export async function notificarResponsaveisPecas(
  opts: { titulo: string; descricao: string; link: string; excluirUserId?: string | null },
): Promise<number> {
  try {
    const [{ data: base }, { data: granular }] = await Promise.all([
      supabase.from('portal_permissoes').select(COLS_PERM)
        .or('is_admin.eq.true,is_dev.eq.true,modulos_permitidos.cs.{ppv}'),
      supabase.from('portal_permissoes').select(COLS_PERM)
        .contains('modulos_permitidos', ['ppv:rastreio_liberar']),
    ]);
    const porUser = new Map<string, any>();
    for (const p of [...(base || []), ...(granular || [])]) {
      if (p?.user_id) porUser.set(p.user_id, p);
    }
    const destinos = filtrarDestinatarios('ppv', [...porUser.values()])
      .filter((id) => id && id !== opts.excluirUserId);
    if (destinos.length === 0) return 0;
    await supabase.from('portal_notificacoes').insert(
      destinos.map((user_id) => ({
        user_id,
        tipo: 'ppv',
        titulo: opts.titulo,
        descricao: opts.descricao,
        link: opts.link,
      })),
    );
    return destinos.length;
  } catch {
    return 0;
  }
}

export async function notificarUsuario(
  userId: string | null | undefined,
  opts: { titulo: string; descricao: string; link: string },
): Promise<void> {
  if (!userId) return;
  try {
    // respeita o silenciamento do módulo (regra do portal: TODO remetente de
    // portal_notificacoes filtra por prefs — senão silenciar Peças não funciona)
    const { data: pref } = await supabase
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .eq('user_id', userId)
      .maybeSingle();
    if (pref && filtrarDestinatarios('ppv', [pref as any]).length === 0) return;
    await supabase.from('portal_notificacoes').insert({
      user_id: userId,
      tipo: 'ppv',
      titulo: opts.titulo,
      descricao: opts.descricao,
      link: opts.link,
    });
  } catch { /* best-effort */ }
}
