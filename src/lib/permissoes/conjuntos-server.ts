// =============================================================================
// Departamentos e pacotes (permissões v2) — edição pelo Admin (13/11/2026).
// Só Admin/Dev (decisão do José). Toda gravação passa por uma PRÉVIA de quem
// ganha e quem perde; depois de gravar, a lista antiga de quem foi afetado é
// regerada (fonte-server.regerarChaves). "Limpar extras repetidos" só apaga
// exceção que o departamento/pacote já cobre — não muda o acesso de ninguém.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { ACOES_SO_DEV } from './explicitas';
import { extrasRepetidos, simularConjunto, telasDaPessoa, telasDoConjunto, type ConjuntoNovo } from './fonte';
import { garantirTelas, lerCatalogo, lerEntradas, regerarChaves } from './fonte-server';
import { esquecerEfetivas } from './sombra-server';

export interface PedidoConjunto {
  id?: string | null;
  nome: string;
  tipo: 'departamento' | 'pacote';
  descricao?: string | null;
  ativo: boolean;
  chaves: string[];
  membros: string[];
}
export interface LinhaPrevia { user: string; nome: string; admin: boolean; ganha: string[]; perde: string[] }

export class ErroConjunto extends Error { constructor(msg: string, public status = 400) { super(msg); } }

async function pessoas(): Promise<Map<string, { nome: string; admin: boolean }>> {
  const [usu, perm] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id, nome').limit(5000),
    supabaseAdmin.from('portal_permissoes').select('user_id, is_admin, is_dev').limit(5000),
  ]);
  const nome = new Map(((usu.data ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));
  return new Map(((perm.data ?? []) as { user_id: string; is_admin: boolean; is_dev: boolean }[])
    .map((p) => [p.user_id, { nome: nome.get(p.user_id) ?? '(sem cadastro)', admin: !!(p.is_admin || p.is_dev) }]));
}

function validar(p: PedidoConjunto, isDev: boolean, soDev: Set<string>) {
  if (!p.nome?.trim()) throw new ErroConjunto('Dê um nome.');
  if (p.nome.trim().length > 80) throw new ErroConjunto('Nome com até 80 letras.');
  if (p.tipo !== 'departamento' && p.tipo !== 'pacote') throw new ErroConjunto('Tipo deve ser departamento ou pacote.');
  if (!isDev) {
    const proibidas = p.chaves.filter((k) => ACOES_SO_DEV.has(k) || soDev.has(k));
    if (proibidas.length) throw new ErroConjunto(`Só um Dev pode pôr num departamento/pacote: ${proibidas.join(', ')}.`, 403);
  }
}

async function montar(p: PedidoConjunto, isDev: boolean) {
  const chaves = [...new Set((p.chaves ?? []).map((k) => String(k).trim()).filter(Boolean))];
  let cat = await lerCatalogo();
  validar({ ...p, chaves }, isDev, new Set(cat.filter((t) => t.so_dev).map((t) => t.id)));
  cat = await garantirTelas(cat, chaves);
  const novo: ConjuntoNovo = { id: p.id || '__novo__', nome: p.nome.trim(), telas: telasDoConjunto(chaves), ativo: p.ativo !== false };
  const entradas = await lerEntradas();
  const membros = new Set(p.membros ?? []);
  return { cat, novo, entradas, membros };
}

/** Quem ganha e quem perde o quê se o departamento/pacote ficar assim. Não grava nada. */
export async function previaConjunto(p: PedidoConjunto, isDev: boolean): Promise<LinhaPrevia[]> {
  const { cat, novo, entradas, membros } = await montar(p, isDev);
  const quem = await pessoas();
  return simularConjunto(cat, entradas, novo, membros)
    .map((l) => ({ ...l, nome: quem.get(l.user)?.nome ?? '(sem cadastro)', admin: !!quem.get(l.user)?.admin }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Grava o departamento/pacote, as telas e quem está nele; regera a lista de quem mudou. */
export async function salvarConjunto(p: PedidoConjunto, autor: { id: string; nome: string }, isDev: boolean) {
  const { novo, membros, entradas, cat } = await montar(p, isDev);
  const linhas = simularConjunto(cat, entradas, novo, membros);

  let id = p.id || null;
  const dados = { nome: novo.nome, tipo: p.tipo, descricao: (p.descricao || '').trim() || null, ativo: novo.ativo };
  if (id) {
    const { error } = await supabaseAdmin.from('perm_conjuntos').update(dados).eq('id', id);
    if (error) throw new ErroConjunto(error.code === '23505' ? 'Já existe um departamento/pacote com esse nome.' : error.message, error.code === '23505' ? 409 : 500);
  } else {
    const { data, error } = await supabaseAdmin.from('perm_conjuntos').insert(dados).select('id').single();
    if (error) throw new ErroConjunto(error.code === '23505' ? 'Já existe um departamento/pacote com esse nome.' : error.message, error.code === '23505' ? 409 : 500);
    id = (data as { id: string }).id;
  }

  const { error: e1 } = await supabaseAdmin.from('perm_conjunto_telas').delete().eq('conjunto_id', id);
  if (e1) throw new ErroConjunto(e1.message, 500);
  if (novo.telas.length) {
    const { error } = await supabaseAdmin.from('perm_conjunto_telas').insert(novo.telas.map((t) => ({ conjunto_id: id, tela_id: t.tela, nivel: t.nivel })));
    if (error) throw new ErroConjunto(error.message, 500);
  }

  const { data: atuais, error: e2 } = await supabaseAdmin.from('perm_usuario_conjuntos').select('user_id').eq('conjunto_id', id).limit(5000);
  if (e2) throw new ErroConjunto(e2.message, 500);
  const antes = new Set(((atuais ?? []) as { user_id: string }[]).map((v) => v.user_id));
  const sair = [...antes].filter((u) => !membros.has(u));
  const entrar = [...membros].filter((u) => !antes.has(u));
  if (sair.length) {
    const { error } = await supabaseAdmin.from('perm_usuario_conjuntos').delete().eq('conjunto_id', id).in('user_id', sair);
    if (error) throw new ErroConjunto(error.message, 500);
  }
  if (entrar.length) {
    const { error } = await supabaseAdmin.from('perm_usuario_conjuntos')
      .insert(entrar.map((user_id) => ({ user_id, conjunto_id: id, criado_por: autor.id })));
    if (error) throw new ErroConjunto(error.message, 500);
  }

  const afetados = [...new Set([...antes, ...membros, ...linhas.map((l) => l.user)])];
  for (const u of afetados) esquecerEfetivas(u);
  const r = await regerarChaves(afetados);
  await supabaseAdmin.from('audit_log').insert({
    user_id: autor.id, user_nome: autor.nome, sistema: 'permissoes', acao: 'permissoes_conjunto',
    entidade: 'conjunto', entidade_id: id, entidade_label: novo.nome,
    detalhes: { tipo: p.tipo, ativo: novo.ativo, telas: novo.telas.map((t) => t.tela), entraram: entrar, sairam: sair, mudancas: linhas },
  }).then(() => {}, () => {});
  return { id, mudancas: linhas.length, regravados: r.regravados };
}

/** Extras que os departamentos/pacotes já cobrem (de todos, ou só de quem está no conjunto). */
export async function extrasRepetidosDe(conjuntoId?: string): Promise<{ user: string; nome: string; telas: string[] }[]> {
  const [cat, entradas, quem] = await Promise.all([lerCatalogo(), lerEntradas(), pessoas()]);
  const out: { user: string; nome: string; telas: string[] }[] = [];
  for (const [u, e] of entradas) {
    if (conjuntoId && !e.conjuntos.some((c) => c.id === conjuntoId)) continue;
    const telas = extrasRepetidos(cat, e);
    if (telas.length) out.push({ user: u, nome: quem.get(u)?.nome ?? '(sem cadastro)', telas });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Apaga os extras repetidos. Confere pessoa a pessoa que o acesso fica igual. */
export async function limparExtrasRepetidos(autor: { id: string; nome: string }, conjuntoId?: string) {
  const lista = await extrasRepetidosDe(conjuntoId);
  const cat = await lerCatalogo();
  let apagados = 0;
  for (const l of lista) {
    const e = (await lerEntradas([l.user])).get(l.user)!;
    const depois = { ...e, extras: e.extras.filter((x) => !l.telas.includes(x.tela)) };
    const a = telasDaPessoa(cat, e), b = telasDaPessoa(cat, depois);
    if (a.size !== b.size || [...a].some((t) => !b.has(t))) continue; // algo mudou no meio: pula
    const { error } = await supabaseAdmin.from('perm_usuario_overrides').delete().eq('user_id', l.user).eq('tipo', 'extra').in('tela_id', l.telas);
    if (error) throw new ErroConjunto(error.message, 500);
    esquecerEfetivas(l.user);
    apagados += l.telas.length;
  }
  await supabaseAdmin.from('audit_log').insert({
    user_id: autor.id, user_nome: autor.nome, sistema: 'permissoes', acao: 'permissoes_limpar_extras',
    entidade: 'conjunto', entidade_id: conjuntoId ?? 'todos', detalhes: { pessoas: lista.length, apagados, lista },
  }).then(() => {}, () => {});
  return { pessoas: lista.length, apagados };
}
