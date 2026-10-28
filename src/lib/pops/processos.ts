// ============================================================================
// POPs — Mapa de processos (PURO). Pedido de 22/10/2026: acompanhar, processo a
// processo, dono, prioridade, prazo e em que pé está o POP (sql/pops-04-mapa-processos.sql).
//
// A SITUAÇÃO não é digitada: sai do POP ligado. Um processo só conta como "pronto"
// quando o POP tem versão PUBLICADA. Modelo do sistema (MOD-*) é ponto de partida,
// não conta como POP do processo.
// ============================================================================
import { ehAdminPops, type Ator } from './regras';

export type Situacao = 'sem_pop' | 'rascunho' | 'em_revisao' | 'publicado' | 'publicado_editando' | 'arquivado';
export const SITUACAO_INFO: Record<Situacao, { label: string; cor: string; ordem: number }> = {
  sem_pop: { label: 'Sem POP', cor: '#b91c1c', ordem: 0 },
  rascunho: { label: 'Rascunho', cor: '#6b7280', ordem: 1 },
  em_revisao: { label: 'Em revisão', cor: '#d97706', ordem: 2 },
  publicado_editando: { label: 'Publicado · nova versão em edição', cor: '#0f766e', ordem: 3 },
  publicado: { label: 'Publicado', cor: '#059669', ordem: 4 },
  arquivado: { label: 'POP arquivado', cor: '#9ca3af', ordem: 0 },
};
export type Prioridade = 'alta' | 'media' | 'baixa';
export const PRIORIDADES: Array<{ id: Prioridade; label: string }> = [
  { id: 'alta', label: 'Alta' }, { id: 'media', label: 'Média' }, { id: 'baixa', label: 'Baixa' },
];

/** Situação a partir do POP ligado e das versões dele (estados de pops_versoes). */
export function situacaoDoProcesso(pop: { arquivado: boolean } | null, estados: string[]): Situacao {
  if (!pop) return 'sem_pop';
  if (pop.arquivado) return 'arquivado';
  const publicado = estados.includes('publicado');
  const editando = estados.includes('rascunho') || estados.includes('em_revisao');
  if (publicado) return editando ? 'publicado_editando' : 'publicado';
  if (estados.includes('em_revisao')) return 'em_revisao';
  return 'rascunho';
}
export const pronto = (s: Situacao) => s === 'publicado' || s === 'publicado_editando';

/** Prazo vencido e o POP ainda não publicado. */
export function atrasado(prazo: string | null, hoje: string, s: Situacao): boolean {
  return !!prazo && prazo < hoje && !pronto(s);
}

/** Quem mexe no mapa de uma área: admin do módulo POPs ou dono de POPs daquela área. */
export function podeEditarProcesso(a: Ator, areaId: string): boolean {
  return ehAdminPops(a) || a.papeisArea.some((p) => p.area_id === areaId && p.papel === 'dono');
}

export interface ResumoMapa { total: number; prontos: number; pct: number; atrasados: number; porSituacao: Record<Situacao, number>; semDono: number }
export function resumir(ps: Array<{ situacao: Situacao; atrasado: boolean; dono_id: string | null }>): ResumoMapa {
  const porSituacao = Object.fromEntries(Object.keys(SITUACAO_INFO).map((k) => [k, 0])) as Record<Situacao, number>;
  for (const p of ps) porSituacao[p.situacao]++;
  const prontos = ps.filter((p) => pronto(p.situacao)).length;
  return {
    total: ps.length, prontos, pct: ps.length ? Math.round((prontos / ps.length) * 100) : 0,
    atrasados: ps.filter((p) => p.atrasado).length, porSituacao, semDono: ps.filter((p) => !p.dono_id).length,
  };
}

/** Campos que a edição aceita (validação única para a rota). */
export function validarEdicao(b: Record<string, unknown>): { campos: Record<string, unknown> } | { erro: string } {
  const c: Record<string, unknown> = {};
  if ('titulo' in b) {
    const t = String(b.titulo ?? '').trim();
    if (t.length < 3 || t.length > 160) return { erro: 'O nome do processo vai de 3 a 160 caracteres.' };
    c.titulo = t;
  }
  if ('prioridade' in b) {
    if (!PRIORIDADES.some((p) => p.id === b.prioridade)) return { erro: 'Prioridade inválida.' };
    c.prioridade = b.prioridade;
  }
  if ('prazo' in b) {
    const p = b.prazo == null || b.prazo === '' ? null : String(b.prazo);
    if (p && !/^\d{4}-\d{2}-\d{2}$/.test(p)) return { erro: 'Prazo inválido.' };
    c.prazo = p;
  }
  if ('dono_id' in b) c.dono_id = b.dono_id ? String(b.dono_id) : null;
  if ('observacao' in b) c.observacao = b.observacao ? String(b.observacao).slice(0, 1000) : null;
  if ('tela' in b) c.tela = b.tela ? String(b.tela).slice(0, 200) : null;
  if ('arquivado' in b) c.arquivado = b.arquivado === true;
  return { campos: c };
}
