// Organograma — ficha da função (o que se espera do papel). Pura (client-safe).
// A ficha agrupa as tarefas de org_tarefas em responsabilidades e acrescenta missão, a quem responde,
// autoridade, requisitos e indicadores. A IA rascunha (lib/organograma/fichas-ia.ts); um admin aprova.
import { semAcento } from './arvore';
import type { TarefaOrg } from './tarefas';

export interface Responsabilidade { titulo: string; descricao: string; tarefas: number[] }
export interface Indicador { texto: string; kpi: string | null }

export interface FichaFuncao {
  funcao: string;
  pessoas: string[];
  titulo: string | null;
  tipo: 'funcao' | 'grupo';
  setor: string | null;
  missao: string | null;
  responde_a: string | null;
  responsabilidades: Responsabilidade[];
  autoridade: string[];
  requisitos: string[];
  indicadores: Indicador[];
  cargo_rh: string | null;
  status: 'rascunho' | 'aprovada';
  aprovado_por: string | null;
  aprovado_em: string | null;
  rascunho_ia: boolean;
}

/** Campos que o admin edita (o resto é controle). */
export const CAMPOS_FICHA = ['titulo', 'setor', 'missao', 'responde_a', 'responsabilidades', 'autoridade', 'requisitos', 'indicadores', 'cargo_rh'] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number];

export function fichaVazia(funcao: string, pessoas: string[] = []): FichaFuncao {
  return {
    funcao, pessoas, titulo: null, tipo: tipoPadrao(funcao), setor: null, missao: null, responde_a: null,
    responsabilidades: [], autoridade: [], requisitos: [], indicadores: [], cargo_rh: null,
    status: 'rascunho', aprovado_por: null, aprovado_em: null, rascunho_ia: false,
  };
}

/** "Todos", "Todo o escritório" = grupo (sem ficha). "Todos os mecânicos" é a função Mecânico. */
export function tipoPadrao(funcao: string): 'funcao' | 'grupo' {
  const f = semAcento(funcao);
  return f === 'todos' || f === 'todo o escritorio' ? 'grupo' : 'funcao';
}

export function nomeDaFicha(f: Pick<FichaFuncao, 'funcao' | 'titulo'>): string {
  if (f.titulo) return f.titulo;
  return semAcento(f.funcao) === 'todos os mecanicos' ? 'Mecânico' : f.funcao;
}

/** Tarefas da função que ainda não estão em nenhuma responsabilidade da ficha. */
export function tarefasSoltas(ficha: Pick<FichaFuncao, 'responsabilidades'>, tarefas: TarefaOrg[]): TarefaOrg[] {
  const usadas = new Set(ficha.responsabilidades.flatMap((r) => r.tarefas));
  return tarefas.filter((t) => !usadas.has(t.id));
}

/** Rascunho sem IA: uma responsabilidade por assunto da planilha. */
export function rascunhoBasico(funcao: string, tarefas: TarefaOrg[]): Pick<FichaFuncao, 'responsabilidades'> {
  const grupos = new Map<string, TarefaOrg[]>();
  for (const t of tarefas) {
    const g = t.assunto || 'Outras';
    grupos.set(g, [...(grupos.get(g) || []), t]);
  }
  return {
    responsabilidades: [...grupos.entries()].map(([titulo, ts]) => ({
      titulo, descricao: ts.map((t) => t.acao).join('; '), tarefas: ts.map((t) => t.id),
    })),
  };
}

const txt = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? s.slice(0, max) : null;
};
const lista = (v: unknown, max = 12, tam = 240): string[] =>
  (Array.isArray(v) ? v : []).map((x) => txt(x, tam)).filter((x): x is string => !!x).slice(0, max);

/**
 * Confere o JSON da IA: só tarefas da função (cada uma em uma responsabilidade só), só indicadores do
 * catálogo (ou texto livre sem kpi), listas curtas. Devolve a parte da ficha + avisos do que foi descartado.
 */
export function validarRascunho(
  json: unknown, tarefaIds: number[], kpis: string[], funcoes: string[],
): { ficha: Partial<FichaFuncao>; avisos: string[] } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const validas = new Set(tarefaIds);
  const usadas = new Set<number>();
  const responsabilidades: Responsabilidade[] = [];
  for (const r of Array.isArray(j.responsabilidades) ? j.responsabilidades.slice(0, 12) : []) {
    const o = (r || {}) as Record<string, unknown>;
    const titulo = txt(o.titulo, 120);
    if (!titulo) continue;
    const ids: number[] = [];
    for (const x of Array.isArray(o.tarefas) ? o.tarefas : []) {
      const id = Number(x);
      if (!validas.has(id)) { avisos.push(`tarefa ${x} não é desta função — ignorada`); continue; }
      if (usadas.has(id)) continue;
      usadas.add(id); ids.push(id);
    }
    responsabilidades.push({ titulo, descricao: txt(o.descricao, 400) || '', tarefas: ids });
  }
  const catalogo = new Set(kpis);
  const indicadores: Indicador[] = [];
  for (const i of Array.isArray(j.indicadores) ? j.indicadores.slice(0, 8) : []) {
    const o = (typeof i === 'string' ? { texto: i } : i || {}) as Record<string, unknown>;
    const texto = txt(o.texto, 200);
    if (!texto) continue;
    const kpi = typeof o.kpi === 'string' && catalogo.has(o.kpi) ? o.kpi : null;
    if (typeof o.kpi === 'string' && o.kpi && !kpi) avisos.push(`indicador "${o.kpi}" não existe no portal — ficou como texto`);
    indicadores.push({ texto, kpi });
  }
  const respondeA = txt(j.responde_a, 80);
  const ficha: Partial<FichaFuncao> = {
    titulo: txt(j.titulo, 80),
    missao: txt(j.missao, 600),
    responde_a: respondeA && funcoes.includes(respondeA) ? respondeA : null,
    responsabilidades,
    autoridade: lista(j.autoridade),
    requisitos: lista(j.requisitos),
    indicadores,
  };
  const soltas = tarefaIds.filter((id) => !usadas.has(id));
  if (soltas.length) avisos.push(`${soltas.length} tarefa(s) ficaram fora das responsabilidades — confira`);
  return { ficha, avisos };
}

/** Normaliza o que vem do formulário/rota (mesmas regras do rascunho, sem exigir tarefa da função). */
export function normalizarEdicao(b: Record<string, unknown>, kpis: string[]): Partial<FichaFuncao> {
  const out: Partial<FichaFuncao> = {};
  if ('titulo' in b) out.titulo = txt(b.titulo, 80);
  if ('setor' in b) out.setor = txt(b.setor, 60);
  if ('missao' in b) out.missao = txt(b.missao, 600);
  if ('responde_a' in b) out.responde_a = txt(b.responde_a, 80);
  if ('cargo_rh' in b) out.cargo_rh = txt(b.cargo_rh, 80);
  if ('autoridade' in b) out.autoridade = lista(b.autoridade, 20);
  if ('requisitos' in b) out.requisitos = lista(b.requisitos, 20);
  if ('responsabilidades' in b) {
    out.responsabilidades = (Array.isArray(b.responsabilidades) ? b.responsabilidades.slice(0, 20) : []).map((r) => {
      const o = (r || {}) as Record<string, unknown>;
      return {
        titulo: txt(o.titulo, 120) || 'Sem título', descricao: txt(o.descricao, 400) || '',
        tarefas: (Array.isArray(o.tarefas) ? o.tarefas : []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
      };
    });
  }
  if ('indicadores' in b) {
    const cat = new Set(kpis);
    out.indicadores = (Array.isArray(b.indicadores) ? b.indicadores.slice(0, 12) : []).map((i) => {
      const o = (i || {}) as Record<string, unknown>;
      return { texto: txt(o.texto, 200) || '', kpi: typeof o.kpi === 'string' && cat.has(o.kpi) ? o.kpi : null };
    }).filter((i) => i.texto);
  }
  return out;
}
