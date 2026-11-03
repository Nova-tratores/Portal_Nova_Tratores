// Organograma — sugere quem ocupa cada função pelo HISTÓRICO do portal (aba Funções).
// Algumas tarefas das listas deixam rastro no portal (abrir/fechar OS, cheque de revisão, garantia,
// requisição, ligação de feedback). Quem mais fez as tarefas de uma função é sugerido para ela.
// Só sugestão: o admin aceita uma a uma. Pura (client-safe).
import { semAcento } from './arvore';
import type { TarefaOrg } from './tarefas';

export type Rastro =
  | 'os_aberta' | 'os_aberta_manutencao' | 'os_aberta_revisao' | 'os_concluida'
  | 'cheque' | 'garantia' | 'requisicao_criar' | 'requisicao_editar' | 'feedback';

export const DIAS_HISTORICO = 180;

const TEXTO_RASTRO: Record<Rastro, (n: number) => string> = {
  os_aberta: (n) => `abriu ${n} OS`,
  os_aberta_manutencao: (n) => `abriu ${n} OS de manutenção`,
  os_aberta_revisao: (n) => `abriu ${n} OS de revisão`,
  os_concluida: (n) => `concluiu ${n} OS`,
  cheque: (n) => `enviou ${n} cheque${n > 1 ? 's' : ''} de revisão`,
  garantia: (n) => `${n} passo${n > 1 ? 's' : ''} em garantias`,
  requisicao_criar: (n) => `criou ${n} ${n > 1 ? 'requisições' : 'requisição'}`,
  requisicao_editar: (n) => `${n} ${n > 1 ? 'edições' : 'edição'} em requisições`,
  feedback: (n) => `${n} ${n > 1 ? 'ligações' : 'ligação'} de feedback`,
};
export const textoRastro = (r: Rastro, n: number): string => TEXTO_RASTRO[r](n);

/** Tarefa (origem:ordem) → rastro que ela deixa no portal. As demais não aparecem no histórico. */
export const RASTRO_DA_TAREFA: Record<string, Rastro> = {
  'pos-vendas:1': 'os_aberta',
  'pos-vendas:3': 'os_concluida',
  'pos-vendas:47': 'os_aberta_manutencao',
  'pos-vendas:48': 'os_aberta_revisao',
  'pos-vendas:8': 'cheque',
  'pos-vendas:77': 'cheque',
  'pos-vendas:6': 'garantia',
  'pos-vendas:34': 'garantia',
  'pos-vendas:52': 'garantia',
  'pos-vendas:53': 'garantia',
  'pos-vendas:54': 'garantia',
  'pos-vendas:55': 'garantia',
  'pos-vendas:73': 'requisicao_criar',
  'pos-vendas:74': 'requisicao_editar',
  'pos-vendas:27': 'feedback',
  'pos-vendas:81': 'feedback',
};
export const rastroDaTarefa = (t: Pick<TarefaOrg, 'origem' | 'ordem'>): Rastro | undefined => RASTRO_DA_TAREFA[`${t.origem}:${t.ordem}`];

/** Contagem por pessoa (chave do organograma) e rastro. */
export type Contagem = Record<string, Partial<Record<Rastro, number>>>;

/** Robôs, testes e gente de fora (Mahindra) não contam. */
export function ehRobo(texto: string): boolean {
  return /sistema|claude|tratorilson|autom|auto-move|teste|varredura|gatilho|@mahindrabrazil/i.test(texto || '');
}

/** Nome ou e-mail → chave 'u:<id>'. Nome que duas pessoas dividem não resolve. */
export function criarIndice(usuarios: Array<{ id: string; nome: string | null; email: string | null }>): (texto: string) => string | null {
  const mapa = new Map<string, string | null>();
  const por = (k: string, chave: string) => {
    if (!k) return;
    mapa.set(k, mapa.has(k) && mapa.get(k) !== chave ? null : chave);
  };
  for (const u of usuarios) {
    por(semAcento(u.nome || ''), `u:${u.id}`);
    por(semAcento(u.email || ''), `u:${u.id}`);
  }
  return (texto: string) => {
    if (!texto || ehRobo(texto)) return null;
    return mapa.get(semAcento(texto)) ?? null;
  };
}

/** Soma 1 (ou n) no rastro da pessoa. */
export function somar(c: Contagem, chave: string | null, r: Rastro, n = 1): void {
  if (!chave) return;
  const p = (c[chave] ||= {});
  p[r] = (p[r] || 0) + n;
}

export interface Sugestao { pessoa: string; nota: number; motivos: string[] }
/** situacao: 'sem_rastro' = nenhuma tarefa da função aparece no portal; 'pouco_rastro' = aparecem, mas
 *  só por rastro que todo o escritório deixa (requisições) ou com menos de 10 registros no período. */
export interface SugestoesFuncao { situacao: 'ok' | 'sem_rastro' | 'pouco_rastro'; sugestoes: Sugestao[] }

const NOTA_MINIMA = 0.15;
const ATOS_MINIMOS = 5;
/** Rastro com menos registros que isso no período não prova nada. */
const TOTAL_MINIMO = 10;
/** Todo o escritório cria e edita requisição: sozinho, não diz qual é a função. */
const RASTROS_FRACOS: ReadonlySet<Rastro> = new Set(['requisicao_criar', 'requisicao_editar']);

/**
 * Para cada função: dos rastros das suas tarefas, a parte que cada pessoa fez (média entre os
 * rastros fortes com pelo menos 10 registros). Fica quem fez ≥ 15% e pelo menos 5 vezes; no máximo 3.
 */
export function sugerirFuncoes(tarefas: TarefaOrg[], contagem: Contagem): Map<string, SugestoesFuncao> {
  const rastrosDa = new Map<string, Set<Rastro>>();
  for (const t of tarefas) {
    const r = rastroDaTarefa(t);
    for (const f of t.quem) {
      const s = rastrosDa.get(f) || new Set<Rastro>();
      if (r) s.add(r);
      rastrosDa.set(f, s);
    }
  }
  const total: Partial<Record<Rastro, number>> = {};
  for (const p of Object.values(contagem)) for (const [r, n] of Object.entries(p)) total[r as Rastro] = (total[r as Rastro] || 0) + (n || 0);

  const out = new Map<string, SugestoesFuncao>();
  for (const [funcao, rastros] of rastrosDa) {
    const comAto = [...rastros].filter((r) => !RASTROS_FRACOS.has(r) && (total[r] || 0) >= TOTAL_MINIMO);
    const sugestoes: Sugestao[] = [];
    if (comAto.length) {
      for (const [pessoa, c] of Object.entries(contagem)) {
        const atos = comAto.reduce((s, r) => s + (c[r] || 0), 0);
        const nota = comAto.reduce((s, r) => s + (c[r] || 0) / total[r]!, 0) / comAto.length;
        if (nota < NOTA_MINIMA || atos < ATOS_MINIMOS) continue;
        sugestoes.push({ pessoa, nota, motivos: comAto.filter((r) => c[r]).sort((a, b) => (c[b] || 0) - (c[a] || 0)).map((r) => textoRastro(r, c[r]!)) });
      }
    }
    sugestoes.sort((a, b) => b.nota - a.nota);
    out.set(funcao, { situacao: !rastros.size ? 'sem_rastro' : !comAto.length ? 'pouco_rastro' : 'ok', sugestoes: sugestoes.slice(0, 3) });
  }
  return out;
}
