// =============================================================================
// ESPELHO em TypeScript de public.perm_efetivas (sql/permissoes-v2*.sql).
//
// NÃO é usado pelo portal para decidir acesso — a regra vive no banco. Serve
// para os testes e para o diff do backfill (provar que a v2 dá o mesmo
// resultado que portal_permissoes, antes e depois de gravar). Se mudar a regra
// no SQL, mude aqui junto: o teste de equivalência pega a diferença.
// =============================================================================
import { permite } from './explicitas';
import { podeTelaFrota, SLUGS_FROTA } from './frota';
import { podeTelaMarketing, SLUGS_MARKETING } from './marketing';
import { nivelNum, type Nivel } from './telas';

export interface Concessao { tela: string; nivel: Nivel; origem: string }
export interface Bloqueio { tela: string; nivel: Nivel }
export interface Efetiva { nivel: Nivel; origens: string[] }
/** Flags de portal_permissoes: `admin` = is_admin, `dev` = is_dev (Dev já conta como admin). */
export interface Papel { admin: boolean; dev: boolean }

const ehAncestral = (a: string, t: string) => t.startsWith(a + ':');
const txt = (n: number): Nivel => (n >= 3 ? 'gerir' : n === 2 ? 'editar' : 'ver');

export function efetivas(
  telas: { id: string; explicita: boolean; so_dev?: boolean }[],
  papel: Papel,
  concessoes: Concessao[],
  bloqueios: Bloqueio[] = [],
): Map<string, Efetiva> {
  const out = new Map<string, Efetiva>();
  // Dev: tudo. Admin comum: tudo, menos as fiscais "só Dev" (essas seguem a regra normal).
  if (papel.dev || papel.admin) {
    for (const t of telas) {
      if (papel.dev) out.set(t.id, { nivel: 'gerir', origens: ['dev'] });
      else if (!t.so_dev) out.set(t.id, { nivel: 'gerir', origens: ['admin'] });
    }
    if (papel.dev) return out;
  }
  const explicitas = telas.filter((t) => t.explicita).map((t) => t.id);
  for (const t of telas) {
    if (out.has(t.id)) continue;
    let n = 0;
    const origens = new Set<string>();
    for (const c of concessoes) {
      if (c.tela === t.id) {
        n = Math.max(n, nivelNum(c.nivel)); origens.add(c.origem);
      } else if (c.nivel === 'gerir' && ehAncestral(c.tela, t.id)
        && !explicitas.some((e) => ehAncestral(c.tela, e) && (e === t.id || ehAncestral(e, t.id)))) {
        n = Math.max(n, 3); origens.add(`${c.origem} · gerir ${c.tela}`);
      } else if (ehAncestral(t.id, c.tela)) {
        n = Math.max(n, 1); origens.add(`${c.origem} · por ${c.tela}`);
      }
    }
    if (n === 0) continue;
    const bl = bloqueios.filter((b) => b.tela === t.id || ehAncestral(b.tela, t.id));
    if (bl.length) {
      n = Math.min(n, Math.min(...bl.map((b) => nivelNum(b.nivel))) - 1);
      for (const b of bl) origens.add(`bloqueio ${b.nivel} ${b.tela}`);
    }
    if (n >= 1) out.set(t.id, { nivel: txt(n), origens: [...origens].sort() });
  }
  return out;
}

/** Chave antiga → concessão v2: módulo puro = gerir (tudo dentro); o resto = ver (só aquela tela). */
export const nivelDaChaveAntiga = (chave: string): Nivel => (chave.includes(':') ? 'ver' : 'gerir');

/**
 * Como o portal decide HOJE se a pessoa tem a tela `id` — usando as funções
 * reais (permite / podeTelaFrota / podeTelaMarketing). Referência do diff.
 */
export function antigoTem(perms: string[], papel: Papel, id: string): boolean {
  const isAdmin = papel.admin || papel.dev;
  const [m, ...resto] = id.split(':');
  const a = resto.join(':');
  if (!a) return permite(perms, isAdmin, m, undefined, papel.dev);
  if (m === 'frota' && SLUGS_FROTA.has(a)) return podeTelaFrota(perms, isAdmin, a);
  if (m === 'marketing' && SLUGS_MARKETING.has(a)) return podeTelaMarketing(perms, isAdmin, a);
  return permite(perms, isAdmin, m, a, papel.dev);
}
