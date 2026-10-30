// Organograma — tarefas de cada função (listas do Pós-vendas e do Mariano, sql/organograma-tarefas.sql)
// e quem é cada função (org_funcoes). Pura (client-safe).
import { semAcento, type PessoaOrg } from './arvore';
import type { TelaMarcada } from './acessos';

export interface TarefaOrg {
  id: number;
  origem: string;
  ordem: number;
  numero: string | null;
  assunto: string | null;
  acao: string;
  onde: string | null;
  quando: string | null;
  frequencia: string | null;
  quem: string[];
  justificativa: string | null;
  destinatario: string | null;
  areas: string[];
  /** Telas que a tarefa pede (sql/organograma-tarefa-telas.sql). */
  telas?: TelaMarcada[];
}

export interface FuncaoOrg { funcao: string; pessoas: string[] }

export interface LigacaoFuncao {
  funcao: string;
  pessoas: string[];
  /** true = ligada pelo nome (ninguém salvou ainda); false = escolhida por um admin. */
  automatico: boolean;
  tarefas: number;
}

export const ORIGENS: Record<string, string> = {
  'pos-vendas': 'Pós-vendas (rotina do escritório da oficina)',
  mariano: 'Mariano (atividades desempenhadas)',
};

/**
 * Função que é nome de gente ("Henri", "Mariano") liga sozinha à pessoa com esse nome — só se
 * for UMA pessoa (primeiro nome ou nome inteiro). "Auxiliar Adm 1", "Todos"… esperam o admin.
 */
export function ligacaoAutomatica(funcao: string, pessoas: PessoaOrg[]): string[] {
  const f = semAcento(funcao);
  if (!f) return [];
  const achados = pessoas.filter((p) => {
    const n = semAcento(p.nome);
    return n === f || n.split(' ')[0] === f;
  });
  return achados.length === 1 ? [achados[0].chave] : [];
}

/** Todas as funções citadas nas tarefas, com quem é cada uma (salvo pelo admin ou automático). */
export function ligarFuncoes(tarefas: TarefaOrg[], salvas: FuncaoOrg[], pessoas: PessoaOrg[]): LigacaoFuncao[] {
  const cont = new Map<string, number>();
  for (const t of tarefas) for (const q of t.quem) cont.set(q, (cont.get(q) || 0) + 1);
  for (const s of salvas) if (!cont.has(s.funcao)) cont.set(s.funcao, 0);
  const porFuncao = new Map(salvas.map((s) => [s.funcao, s]));
  const existe = new Set(pessoas.map((p) => p.chave));
  return [...cont.entries()].map(([funcao, n]) => {
    const s = porFuncao.get(funcao);
    if (s) return { funcao, pessoas: s.pessoas.filter((c) => existe.has(c)), automatico: false, tarefas: n };
    return { funcao, pessoas: ligacaoAutomatica(funcao, pessoas), automatico: true, tarefas: n };
  }).sort((a, b) => b.tarefas - a.tarefas || a.funcao.localeCompare(b.funcao, 'pt-BR'));
}

/** Tarefas de cada pessoa (pelas funções que ela ocupa). */
export function tarefasPorPessoa(tarefas: TarefaOrg[], ligacoes: LigacaoFuncao[]): Map<string, TarefaOrg[]> {
  const pessoasDa = new Map(ligacoes.map((l) => [l.funcao, l.pessoas]));
  const out = new Map<string, TarefaOrg[]>();
  for (const t of tarefas) {
    const quem = new Set(t.quem.flatMap((f) => pessoasDa.get(f) || []));
    for (const c of quem) { const l = out.get(c) || []; l.push(t); out.set(c, l); }
  }
  return out;
}

/** Funções que uma pessoa ocupa. */
export function funcoesDaPessoa(chave: string, ligacoes: LigacaoFuncao[]): string[] {
  return ligacoes.filter((l) => l.pessoas.includes(chave)).map((l) => l.funcao);
}

/** Tarefas sem ninguém (sem "quem" na planilha, ou função que ninguém ocupa ainda). */
export function tarefasSemPessoa(tarefas: TarefaOrg[], ligacoes: LigacaoFuncao[]): TarefaOrg[] {
  const pessoasDa = new Map(ligacoes.map((l) => [l.funcao, l.pessoas]));
  return tarefas.filter((t) => !t.quem.some((f) => (pessoasDa.get(f) || []).length > 0));
}

/** Troca o nome da função na lista "quem" da tarefa, sem repetir (juntar duas funções). */
export function renomearNaLista(quem: string[], de: string, para: string): string[] {
  return [...new Set(quem.map((q) => (q === de ? para : q)))];
}

export type Ordem<C extends string> = { coluna: C; dir: 'asc' | 'desc' } | null;

/** Clique no cabeçalho: A→Z, Z→A, volta à ordem original. */
export function alternarOrdem<C extends string>(atual: Ordem<C>, coluna: C): Ordem<C> {
  if (atual?.coluna !== coluna) return { coluna, dir: 'asc' };
  return atual.dir === 'asc' ? { coluna, dir: 'desc' } : null;
}

/** Ordena por texto ou número (com acento e "10" depois de "9"); vazio fica sempre no fim. */
export function ordenarPor<T>(lista: T[], valor: (x: T) => string | number | null | undefined, dir: 'asc' | 'desc'): T[] {
  const sinal = dir === 'asc' ? 1 : -1;
  const vazio = (v: unknown) => v == null || v === '';
  return [...lista].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (vazio(va) || vazio(vb)) return Number(vazio(va)) - Number(vazio(vb));
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sinal;
  });
}
