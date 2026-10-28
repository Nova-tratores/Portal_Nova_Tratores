// =============================================================================
// Espelho portal_permissoes → permissões v2 (Fase 3a, modo sombra).
//
// Enquanto o Admin antigo é onde se edita, a v2 precisa acompanhar — senão o
// modo sombra compara contra uma cópia velha (achado 20/10/2026: tela nova sem
// cadastro e 7 usuários editados depois do backfill). Roda:
//   - no boot e a cada 10 min (instrumentation.ts) para todos;
//   - logo depois de salvar no Admin (/api/admin/permissoes) para aquele usuário.
// Só escreve nas tabelas v2 e só no que o backfill criou (ver planejarEspelho).
// Desliga com PERM_ESPELHO=off (e não roda quando PERM_V2 está 'off').
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { MOTIVO_BACKFILL, planejarBackfill, planejarEspelho, planoVazio, type DepartamentoV2, type LinhaPermissao } from './backfill';
import { esquecerEfetivas, modoAtual } from './sombra-server';
import { catalogoRotas, catalogoTelas, type Nivel } from './telas';

export function espelhoLigado(): boolean {
  return process.env.PERM_ESPELHO !== 'off' && modoAtual() !== 'off';
}

async function linhasDe(userIds?: string[]): Promise<LinhaPermissao[]> {
  let q = supabaseAdmin.from('portal_permissoes').select('user_id, is_admin, is_dev, categoria, modulos_permitidos').limit(5000);
  if (userIds?.length) q = q.in('user_id', userIds);
  const { data, error } = await q;
  if (error) throw new Error(`portal_permissoes: ${error.message}`);
  return (data ?? []) as LinhaPermissao[];
}

/** Telas e rotas do código + telas "legado" das chaves que só existem nos dados. Idempotente. */
export async function sincronizarCatalogo(): Promise<{ telas: number; rotas: number }> {
  const linhas = await linhasDe();
  const catalogo = catalogoTelas();
  const novas = planejarBackfill(
    linhas.map((l) => ({ ...l, modulos_permitidos: (l.modulos_permitidos || []).filter((k) => /^[a-z0-9_-]+(:[a-z0-9_-]+)*$/.test(k.trim())) })),
    catalogo,
  ).telasNovas;
  const agora = new Date().toISOString();
  const { error: e1 } = await supabaseAdmin.from('perm_telas')
    .upsert(catalogo.map((t) => ({ ...t, atualizado_em: agora })), { onConflict: 'id' });
  if (e1) throw new Error(`perm_telas: ${e1.message}`);
  // legado: só insere o que falta (não sobrescreve nome/categoria de quem já existe)
  if (novas.length) {
    const { error } = await supabaseAdmin.from('perm_telas').upsert(novas, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`perm_telas (legado): ${error.message}`);
  }
  const rotas = catalogoRotas();
  const { error: e2 } = await supabaseAdmin.from('perm_tela_rotas').upsert(
    rotas.map((r) => ({ padrao: r.padrao, acesso: r.acesso, tela_id: r.tela_id ?? null, alternativas: r.alternativas ?? [], nota: r.nota ?? null })),
    { onConflict: 'padrao' },
  );
  if (e2) throw new Error(`perm_tela_rotas: ${e2.message}`);
  return { telas: catalogo.length + novas.length, rotas: rotas.length };
}

export interface ResultadoEspelho { usuarios: number; alterados: number; ignoradas: string[] }

/** Acerta a v2 de todos (ou dos usuários dados) para refletir portal_permissoes. */
export async function espelharPermissoes(userIds?: string[]): Promise<ResultadoEspelho> {
  const linhas = await linhasDe(userIds);
  if (!linhas.length) return { usuarios: 0, alterados: 0, ignoradas: [] };
  const ids = linhas.map((l) => l.user_id);

  const [deps, vinc, extras, telas] = await Promise.all([
    supabaseAdmin.from('perm_conjuntos').select('id, nome, perm_conjunto_telas(tela_id, nivel)').eq('tipo', 'departamento').eq('ativo', true),
    supabaseAdmin.from('perm_usuario_conjuntos').select('user_id, conjunto_id').is('criado_por', null).in('user_id', ids).limit(5000),
    supabaseAdmin.from('perm_usuario_overrides').select('user_id, tela_id, nivel').eq('tipo', 'extra').eq('motivo', MOTIVO_BACKFILL).in('user_id', ids).limit(10000),
    supabaseAdmin.from('perm_telas').select('id').limit(5000),
  ]);
  for (const r of [deps, vinc, extras, telas]) if (r.error) throw new Error(r.error.message);

  type DepRow = { id: string; nome: string; perm_conjunto_telas: { tela_id: string; nivel: Nivel }[] };
  const departamentos: DepartamentoV2[] = ((deps.data ?? []) as DepRow[]).map((d) => ({
    id: d.id, nome: d.nome, telas: (d.perm_conjunto_telas ?? []).map((t) => ({ tela: t.tela_id, nivel: t.nivel })),
  }));
  const idsDep = new Set(departamentos.map((d) => d.id));
  const telasExistentes = new Set(((telas.data ?? []) as { id: string }[]).map((t) => t.id));

  let alterados = 0;
  const ignoradas: string[] = [];
  for (const l of linhas) {
    const plano = planejarEspelho(l, departamentos, {
      conjuntos: ((vinc.data ?? []) as { user_id: string; conjunto_id: string }[])
        .filter((v) => v.user_id === l.user_id && idsDep.has(v.conjunto_id)).map((v) => v.conjunto_id),
      extras: ((extras.data ?? []) as { user_id: string; tela_id: string; nivel: Nivel }[])
        .filter((e) => e.user_id === l.user_id).map((e) => ({ tela: e.tela_id, nivel: e.nivel })),
    });
    ignoradas.push(...plano.ignoradas);
    if (planoVazio(plano)) continue;

    // tela que ainda não existe (chave nova só nos dados) nasce como legado
    const faltam = plano.incluirExtras.map((e) => e.tela).filter((t) => !telasExistentes.has(t));
    if (faltam.length) {
      const legado = planejarBackfill([{ ...l, modulos_permitidos: faltam }], []).telasNovas;
      await supabaseAdmin.from('perm_telas').upsert(legado, { onConflict: 'id', ignoreDuplicates: true });
      for (const t of legado) telasExistentes.add(t.id);
    }
    if (plano.sair.length) {
      await supabaseAdmin.from('perm_usuario_conjuntos').delete().eq('user_id', l.user_id).is('criado_por', null).in('conjunto_id', plano.sair);
    }
    if (plano.entrar.length) {
      await supabaseAdmin.from('perm_usuario_conjuntos').upsert(plano.entrar.map((conjunto_id) => ({ user_id: l.user_id, conjunto_id })), { onConflict: 'user_id,conjunto_id' });
    }
    if (plano.removerExtras.length) {
      await supabaseAdmin.from('perm_usuario_overrides').delete()
        .eq('user_id', l.user_id).eq('tipo', 'extra').eq('motivo', MOTIVO_BACKFILL).in('tela_id', plano.removerExtras);
    }
    if (plano.incluirExtras.length) {
      const { error } = await supabaseAdmin.from('perm_usuario_overrides').upsert(
        plano.incluirExtras.map((e) => ({ user_id: l.user_id, tela_id: e.tela, nivel: e.nivel, tipo: 'extra', motivo: MOTIVO_BACKFILL })),
        { onConflict: 'user_id,tela_id,tipo' },
      );
      if (error) throw new Error(`overrides de ${l.user_id}: ${error.message}`);
    }
    esquecerEfetivas(l.user_id);
    alterados++;
  }
  return { usuarios: linhas.length, alterados, ignoradas: [...new Set(ignoradas)] };
}
