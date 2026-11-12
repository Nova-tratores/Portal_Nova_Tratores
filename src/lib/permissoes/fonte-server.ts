// =============================================================================
// Permissões v2 como FONTE — lado servidor (Fase 4, parte 2 — 10/11/2026).
//
// - gravarChavesPessoa: a edição do Admin (lista de chaves) vira extras/bloqueios
//   por cima dos departamentos/pacotes da pessoa; a lista antiga é regerada.
// - regerarChaves: depois de mexer num departamento/pacote, regrava a lista
//   antiga de quem está nele (portal_permissoes.modulos_permitidos).
// - conferirFonte (a cada 10 min, substitui o espelho antigo→v2): lista antiga
//   gravada por fora do Admin (SQL, código velho) NUNCA tira acesso — o que só a
//   lista tem vira extra com motivo "gravado fora do Admin"; o resto é regerado.
//
// Ligado quando PERM_V2 está 'on' e PERM_FONTE ≠ 'antiga'. Voltar atrás:
// PERM_FONTE=antiga no Railway (o espelho antigo→v2 volta a rodar).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { planejarBackfill } from './backfill';
import { chavesDaEntrada, diferenca, mesmoConjunto, planejarPessoa, planoPessoaVazio, telasDasChaves, telasDaPessoa, type EntradaPessoa, type Override, type PlanoPessoa, type TelaCat } from './fonte';
import { esquecerEfetivas, modoAtual } from './sombra-server';
import type { Nivel } from './telas';

const ID_OK = /^[a-z0-9_-]+(:[a-z0-9_-]+)*$/;
export const MOTIVO_FORA_DO_ADMIN = 'Gravado fora do Admin (conferência automática)';

export function fonteV2Ligada(): boolean {
  return process.env.PERM_FONTE !== 'antiga' && modoAtual() === 'on';
}

export async function lerCatalogo(): Promise<TelaCat[]> {
  const { data, error } = await supabaseAdmin.from('perm_telas').select('id, explicita, so_dev').eq('ativo', true).limit(5000);
  if (error) throw new Error(`perm_telas: ${error.message}`);
  return (data ?? []) as TelaCat[];
}

/** Chave que só existe nos dados (ex.: 'patrimonio') nasce como tela "legado", senão o resolver a ignoraria. */
async function garantirTelas(cat: TelaCat[], chaves: string[]): Promise<TelaCat[]> {
  const ids = new Set(cat.map((t) => t.id));
  const faltam = chaves.filter((k) => ID_OK.test(k) && !ids.has(k));
  if (!faltam.length) return cat;
  const novas = planejarBackfill([{ user_id: '-', is_admin: false, is_dev: false, categoria: '', modulos_permitidos: faltam }], cat.map((t) => ({ id: t.id, nome: t.id, categoria_menu: '', explicita: t.explicita, so_dev: !!t.so_dev }))).telasNovas;
  if (novas.length) {
    const { error } = await supabaseAdmin.from('perm_telas').upsert(novas, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`perm_telas (legado): ${error.message}`);
  }
  return lerCatalogo();
}

type OvRow = { user_id: string; tela_id: string; nivel: Nivel; tipo: 'extra' | 'bloqueio'; expira_em: string | null };
type ConjRow = { id: string; nome: string; ativo: boolean; perm_conjunto_telas: { tela_id: string; nivel: Nivel }[] };

/** Entradas (conjuntos + overrides vigentes) dos usuários pedidos (ou de todos). */
export async function lerEntradas(userIds?: string[]): Promise<Map<string, EntradaPessoa>> {
  let qv = supabaseAdmin.from('perm_usuario_conjuntos').select('user_id, conjunto_id').limit(10000);
  let qo = supabaseAdmin.from('perm_usuario_overrides').select('user_id, tela_id, nivel, tipo, expira_em').limit(20000);
  if (userIds?.length) { qv = qv.in('user_id', userIds); qo = qo.in('user_id', userIds); }
  const [cj, vinc, ovs] = await Promise.all([
    supabaseAdmin.from('perm_conjuntos').select('id, nome, ativo, perm_conjunto_telas(tela_id, nivel)').limit(1000), qv, qo,
  ]);
  for (const r of [cj, vinc, ovs]) if (r.error) throw new Error(r.error.message);
  const conjuntos = new Map(((cj.data ?? []) as ConjRow[]).filter((c) => c.ativo).map((c) => [c.id, {
    id: c.id, nome: c.nome, telas: (c.perm_conjunto_telas ?? []).map((t) => ({ tela: t.tela_id, nivel: t.nivel })),
  }]));
  const agora = Date.now();
  const out = new Map<string, EntradaPessoa>();
  const de = (u: string) => {
    let e = out.get(u);
    if (!e) { e = { conjuntos: [], extras: [], bloqueios: [] }; out.set(u, e); }
    return e;
  };
  for (const u of userIds ?? []) de(u);
  for (const v of (vinc.data ?? []) as { user_id: string; conjunto_id: string }[]) {
    const c = conjuntos.get(v.conjunto_id);
    if (c) de(v.user_id).conjuntos.push(c);
  }
  for (const o of (ovs.data ?? []) as OvRow[]) {
    if (o.expira_em && new Date(o.expira_em).getTime() <= agora) continue;
    (o.tipo === 'extra' ? de(o.user_id).extras : de(o.user_id).bloqueios).push({ tela: o.tela_id, nivel: o.nivel });
  }
  return out;
}

async function aplicarPlano(userId: string, p: PlanoPessoa, motivo: string, autorId: string | null): Promise<void> {
  const del = async (tipo: 'extra' | 'bloqueio', telas: string[]) => {
    if (!telas.length) return;
    const { error } = await supabaseAdmin.from('perm_usuario_overrides').delete().eq('user_id', userId).eq('tipo', tipo).in('tela_id', telas);
    if (error) throw new Error(`overrides (${tipo}): ${error.message}`);
  };
  const ins = async (tipo: 'extra' | 'bloqueio', l: Override[]) => {
    if (!l.length) return;
    const { error } = await supabaseAdmin.from('perm_usuario_overrides').upsert(
      l.map((o) => ({ user_id: userId, tela_id: o.tela, nivel: o.nivel, tipo, motivo, criado_por: autorId, expira_em: null, criado_em: new Date().toISOString() })),
      { onConflict: 'user_id,tela_id,tipo' },
    );
    if (error) throw new Error(`overrides (${tipo}): ${error.message}`);
  };
  await del('extra', p.removerExtras);
  await del('bloqueio', p.removerBloqueios);
  await ins('extra', p.incluirExtras);
  await ins('bloqueio', p.incluirBloqueios);
  esquecerEfetivas(userId);
}

async function auditar(autor: { id: string | null; nome: string }, acao: string, userId: string, detalhes: Record<string, unknown>) {
  await supabaseAdmin.from('audit_log').insert({
    user_id: autor.id ?? '00000000-0000-0000-0000-000000000000', user_nome: autor.nome,
    sistema: 'permissoes', acao, entidade: 'usuario', entidade_id: userId, detalhes,
  }).then(() => {}, () => {});
}

export interface ResultadoGravar { chaves: string[]; plano: PlanoPessoa; ganha: string[]; perde: string[] }

/**
 * Edição do Admin pela lista de chaves → extras/bloqueios na v2. Devolve a lista
 * REGERADA (é ela que vai para portal_permissoes). Lança se não der para montar.
 */
export async function gravarChavesPessoa(
  userId: string, chaves: string[], opts: { motivo?: string; autor: { id: string | null; nome: string } },
): Promise<ResultadoGravar> {
  const validas = [...new Set(chaves.map((k) => String(k).trim()).filter(Boolean))];
  const cat = await garantirTelas(await lerCatalogo(), validas);
  const entrada = (await lerEntradas([userId])).get(userId)!;
  const antes = telasDaPessoa(cat, entrada);
  const plano = planejarPessoa(cat, entrada, validas);
  if (!plano) throw new Error('Não foi possível traduzir estas permissões para departamentos/extras. Nada foi gravado.');
  if (!planoPessoaVazio(plano)) {
    const motivo = (opts.motivo || '').trim() || `Ajuste no Admin por ${opts.autor.nome} em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    await aplicarPlano(userId, plano, motivo.slice(0, 500), opts.autor.id);
  }
  const depois = telasDasChaves(cat, validas);
  const { ganha, perde } = diferenca(antes, depois);
  if (ganha.length || perde.length) await auditar(opts.autor, 'permissoes_pessoa', userId, { ganha, perde, motivo: opts.motivo || null, plano });
  return { chaves: validas, plano, ganha, perde };
}

/** Regrava a lista antiga de quem mudou na v2 (depois de editar departamento/pacote). */
export async function regerarChaves(userIds?: string[]): Promise<{ usuarios: number; regravados: number }> {
  const cat = await lerCatalogo();
  let q = supabaseAdmin.from('portal_permissoes').select('user_id, modulos_permitidos').limit(5000);
  if (userIds?.length) q = q.in('user_id', userIds);
  const { data, error } = await q;
  if (error) throw new Error(`portal_permissoes: ${error.message}`);
  const linhas = (data ?? []) as { user_id: string; modulos_permitidos: string[] | null }[];
  const entradas = await lerEntradas(linhas.map((l) => l.user_id));
  let regravados = 0;
  for (const l of linhas) {
    const e = entradas.get(l.user_id) ?? { conjuntos: [], extras: [], bloqueios: [] };
    if (mesmoConjunto(telasDasChaves(cat, l.modulos_permitidos || []), telasDaPessoa(cat, e))) continue;
    const chaves = chavesDaEntrada(cat, e);
    if (!chaves) continue;
    const { error: erroGravar } = await supabaseAdmin.from('portal_permissoes')
      .update({ modulos_permitidos: chaves, updated_at: new Date().toISOString() }).eq('user_id', l.user_id);
    if (erroGravar) throw new Error(`portal_permissoes ${l.user_id}: ${erroGravar.message}`);
    esquecerEfetivas(l.user_id);
    regravados++;
  }
  return { usuarios: linhas.length, regravados };
}

/**
 * Conferência periódica (substitui o espelho antigo→v2 quando a v2 é a fonte).
 * Lista antiga com tela que a v2 não dá = alguém gravou por fora: vira extra com
 * motivo (ninguém perde acesso). Depois a lista é regerada a partir da v2.
 */
export async function conferirFonte(): Promise<{ usuarios: number; importados: string[]; regravados: number }> {
  const { data, error } = await supabaseAdmin.from('portal_permissoes').select('user_id, modulos_permitidos').limit(5000);
  if (error) throw new Error(`portal_permissoes: ${error.message}`);
  const linhas = (data ?? []) as { user_id: string; modulos_permitidos: string[] | null }[];
  let cat = await lerCatalogo();
  cat = await garantirTelas(cat, [...new Set(linhas.flatMap((l) => l.modulos_permitidos || []))]);
  const entradas = await lerEntradas(linhas.map((l) => l.user_id));
  const importados: string[] = [];
  for (const l of linhas) {
    const e = entradas.get(l.user_id) ?? { conjuntos: [], extras: [], bloqueios: [] };
    const v2 = telasDaPessoa(cat, e);
    const lista = telasDasChaves(cat, l.modulos_permitidos || []);
    const soNaLista = [...lista].filter((t) => !v2.has(t));
    if (!soNaLista.length) continue;
    // o que a v2 concede + a lista gravada por fora (soma das concessões, sem tirar nada)
    const daV2 = chavesDaEntrada(cat, e);
    const plano = daV2 && planejarPessoa(cat, e, [...daV2, ...(l.modulos_permitidos || [])]);
    if (!plano || planoPessoaVazio(plano)) continue;
    await aplicarPlano(l.user_id, plano, MOTIVO_FORA_DO_ADMIN, null);
    await auditar({ id: null, nome: 'Conferência de permissões' }, 'permissoes_importadas', l.user_id, { telas: soNaLista });
    importados.push(l.user_id);
  }
  const r = await regerarChaves();
  return { usuarios: linhas.length, importados, regravados: r.regravados };
}
