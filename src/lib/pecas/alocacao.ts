// Demanda de ALOCAÇÃO de peça recebida — regras PURAS (sem banco, client-safe).
//
// Fluxo (01/10/2026): nota de entrada RECEBIDA → para cada item com produto
// interno que é peça de estoque e ainda NÃO tem Prateleira/Andar/Caixa, abre-se
// uma demanda (pecas_alocacao_pendencias, uma linha por item de recebimento).
// Quando a locação fica completa, a demanda fecha sozinha.
// Decisões do usuário: só peça SEM locação gera demanda; responsável fixo por
// empresa; etiqueta = botão ao alocar, cópias = quantidade recebida.
// Banco/Omie ficam em alocacao-server.ts — NÃO juntar (vaza service role no bundle).
import { pecaElegivel } from '@/lib/ppv/etiquetas-fallback';
import { posDeCar, segPlaceholder } from '@/lib/ajustes/posicao';

/** Primeiro dia que conta: sem retroativo (82% do catálogo não tem locação). */
export const ALOCACAO_DESDE_PADRAO = '2026-10-01';
/** Item com valor unitário a partir disto é máquina/implemento, não peça (mesmo limiar do robô de recebidos). */
export const LIMIAR_MAQUINA = 10000;
/** Teto de cópias por linha da fila de etiquetas (etiquetas_fila.copias 1..50). */
export const MAX_COPIAS_ETIQUETA = 50;

// CFOP de ENTRADA que não vira peça de estoque (últimos 3 dígitos; vale 1.xxx e 2.xxx):
// 556/407 uso e consumo · 551/406 ativo imobilizado · 653 combustível p/ consumo.
const CFOP_SEM_ESTOQUE = new Set(['556', '407', '551', '406', '653']);

export interface ItemRecebido {
  nCodProduto?: number | string | null;
  cCodigo?: string | null;
  cDescricao?: string | null;
  nQtde?: number | string | null;
  nValUnit?: number | string | null;
  cCFOPEntrada?: string | null;
}
export interface NotaRecebida {
  conta: string;                 // 'NOVA' | 'CASTRO'
  id_receb: number;
  numero_nfe: string | null;
  fornecedor: string | null;
  recebido_em: string | null;    // YYYY-MM-DD
  itens: ItemRecebido[];
}
/** Linha do espelho `produtos` (cadastro): família, ativo. */
export interface ProdutoCadastro {
  codigo?: string | null;
  descricao?: string | null;
  familia_nome?: string | null;
  inativo?: boolean | null;
}
/** Linha do espelho `produtos_caracteristicas`. */
export interface EspelhoCaract {
  codigo?: string | null;
  descricao?: string | null;
  caracteristicas?: Record<string, string> | null;
}
export type StatusAlocacao = 'aberta' | 'resolvida' | 'dispensada';
export interface PendenciaAlocacao {
  id: number;
  conta_omie: string;
  codigo_produto: number;
  codigo: string | null;
  descricao: string | null;
  id_receb: number;
  numero_nfe: string | null;
  fornecedor: string | null;
  recebido_em: string | null;
  qtde: number;
  status: StatusAlocacao;
  responsavel_user_id: string | null;
  responsavel_nome: string | null;
  aberta_em: string;
  resolvida_em?: string | null;
  resolvida_por?: string | null;
  resolucao?: string | null;
  locacao?: string | null;
}
export type NovaPendencia = Pick<PendenciaAlocacao,
  'conta_omie' | 'codigo_produto' | 'codigo' | 'descricao' | 'id_receb' | 'numero_nfe' | 'fornecedor' | 'recebido_em' | 'qtde'>;

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const chaveProduto = (conta: string, codigoProduto: number | string): string =>
  `${String(conta).toUpperCase()}|${codigoProduto}`;
export const chaveItem = (conta: string, idReceb: number | string, codigoProduto: number | string): string =>
  `${String(conta).toUpperCase()}|${idReceb}|${codigoProduto}`;

export function cfopSemEstoque(cfop: string | null | undefined): boolean {
  const d = String(cfop ?? '').replace(/\D/g, '');
  return d.length >= 3 && CFOP_SEM_ESTOQUE.has(d.slice(-3));
}

/** Locação COMPLETA = prateleira, andar e caixa preenchidos e nenhum é placeholder (XXX/000/---). */
export function locacaoCompleta(car: Record<string, string> | null | undefined): boolean {
  const p = posDeCar(car);
  return [p.prat, p.andar, p.caixa].every((s) => s !== '' && !segPlaceholder(s));
}
/** "3-G-1" (snapshot curto da posição para o registro da demanda). */
export function locacaoCurta(car: Record<string, string> | null | undefined): string {
  const p = posDeCar(car);
  return [p.prat, p.andar, p.caixa].map((s) => s || '—').join('-');
}

export type MotivoFora = 'sem-produto' | 'cfop-sem-estoque' | 'maquina' | 'nao-e-peca';
/**
 * Por que o item NÃO gera demanda (null = gera, se ainda estiver sem locação).
 * `cadastro` é a linha de `produtos`; ausente = produto criado na própria entrada
 * (ainda sem família → conta como peça, como no sync de características).
 */
export function motivoFora(item: ItemRecebido, cadastro?: ProdutoCadastro | null): MotivoFora | null {
  if (!num(item.nCodProduto)) return 'sem-produto';
  if (cfopSemEstoque(item.cCFOPEntrada)) return 'cfop-sem-estoque';
  if (num(item.nValUnit) >= LIMIAR_MAQUINA) return 'maquina';
  if (cadastro && !pecaElegivel({ conta_omie: null, codigo: null, codigo_produto: null, descricao: null, familia_nome: cadastro.familia_nome, inativo: cadastro.inativo })) return 'nao-e-peca';
  return null;
}

export interface EntradaPlano {
  notas: NotaRecebida[];
  /** TODAS as linhas já gravadas das notas em questão + as abertas (qualquer status entra na idempotência). */
  existentes: Array<Pick<PendenciaAlocacao, 'id' | 'conta_omie' | 'codigo_produto' | 'id_receb' | 'status'>>;
  /** chaveProduto → espelho de características */
  espelho: Map<string, EspelhoCaract>;
  /** chaveProduto → cadastro (`produtos`) */
  cadastro: Map<string, ProdutoCadastro>;
  /** YYYY-MM-DD: nota recebida antes disso não conta */
  desde: string;
}
export interface Plano {
  abrir: NovaPendencia[];
  fechar: Array<{ id: number; conta_omie: string; codigo_produto: number; locacao: string }>;
  /** contagem do que ficou de fora, por motivo (para a simulação/log) */
  ignorados: Record<MotivoFora | 'ja-tem-locacao' | 'ja-registrado' | 'antes-do-inicio', number>;
}

/** Decide o que abrir e o que fechar. Idempotente: rodar duas vezes não duplica nem reabre. */
export function planejar(e: EntradaPlano): Plano {
  const ignorados: Plano['ignorados'] = {
    'sem-produto': 0, 'cfop-sem-estoque': 0, maquina: 0, 'nao-e-peca': 0,
    'ja-tem-locacao': 0, 'ja-registrado': 0, 'antes-do-inicio': 0,
  };
  const jaTem = new Set(e.existentes.map((x) => chaveItem(x.conta_omie, x.id_receb, x.codigo_produto)));
  const novos = new Map<string, NovaPendencia>();

  for (const nota of e.notas) {
    if (!nota.recebido_em || nota.recebido_em < e.desde) { ignorados['antes-do-inicio'] += nota.itens.length; continue; }
    const conta = String(nota.conta).toUpperCase();
    for (const it of nota.itens) {
      const cp = num(it.nCodProduto);
      const kp = chaveProduto(conta, cp);
      const fora = motivoFora(it, e.cadastro.get(kp));
      if (fora) { ignorados[fora]++; continue; }
      const esp = e.espelho.get(kp);
      if (locacaoCompleta(esp?.caracteristicas)) { ignorados['ja-tem-locacao']++; continue; }
      const ki = chaveItem(conta, nota.id_receb, cp);
      if (jaTem.has(ki)) { ignorados['ja-registrado']++; continue; }
      const cad = e.cadastro.get(kp);
      const atual = novos.get(ki);
      if (atual) { atual.qtde += num(it.nQtde); continue; } // mesma peça em 2 linhas da nota
      novos.set(ki, {
        conta_omie: conta,
        codigo_produto: cp,
        // SKU/descrição: espelho > cadastro > o que veio na nota (produto criado na entrada)
        codigo: esp?.codigo || cad?.codigo || (it.cCodigo ? String(it.cCodigo) : null),
        descricao: esp?.descricao || cad?.descricao || (it.cDescricao ? String(it.cDescricao) : null),
        id_receb: nota.id_receb,
        numero_nfe: nota.numero_nfe,
        fornecedor: nota.fornecedor,
        recebido_em: nota.recebido_em,
        qtde: num(it.nQtde),
      });
    }
  }

  const fechar: Plano['fechar'] = [];
  for (const x of e.existentes) {
    if (x.status !== 'aberta') continue;
    const car = e.espelho.get(chaveProduto(x.conta_omie, x.codigo_produto))?.caracteristicas;
    if (locacaoCompleta(car)) fechar.push({ id: x.id, conta_omie: x.conta_omie, codigo_produto: x.codigo_produto, locacao: locacaoCurta(car) });
  }
  return { abrir: [...novos.values()], fechar, ignorados };
}

export interface GrupoAlocacao {
  chave: string;                 // CONTA|codigo_produto
  conta_omie: string;
  codigo_produto: number;
  codigo: string | null;
  descricao: string | null;
  qtde: number;                  // soma das notas em aberto
  ids: number[];
  notas: Array<{ id: number; id_receb: number; numero_nfe: string | null; fornecedor: string | null; recebido_em: string | null; qtde: number }>;
  recebido_em: string | null;    // a mais ANTIGA (há quanto tempo espera)
  responsavel_user_id: string | null;
  responsavel_nome: string | null;
}

/** Um cartão por PEÇA: a mesma peça comprada em duas notas soma as quantidades. Mais antiga primeiro. */
export function agruparPorProduto(linhas: PendenciaAlocacao[]): GrupoAlocacao[] {
  const m = new Map<string, GrupoAlocacao>();
  for (const l of linhas) {
    const k = chaveProduto(l.conta_omie, l.codigo_produto);
    let g = m.get(k);
    if (!g) {
      g = {
        chave: k, conta_omie: l.conta_omie, codigo_produto: l.codigo_produto, codigo: l.codigo, descricao: l.descricao,
        qtde: 0, ids: [], notas: [], recebido_em: null,
        responsavel_user_id: l.responsavel_user_id, responsavel_nome: l.responsavel_nome,
      };
      m.set(k, g);
    }
    g.qtde += num(l.qtde);
    g.ids.push(l.id);
    g.notas.push({ id: l.id, id_receb: l.id_receb, numero_nfe: l.numero_nfe, fornecedor: l.fornecedor, recebido_em: l.recebido_em, qtde: num(l.qtde) });
    if (l.recebido_em && (!g.recebido_em || l.recebido_em < g.recebido_em)) g.recebido_em = l.recebido_em;
    if (!g.codigo && l.codigo) g.codigo = l.codigo;
    if (!g.descricao && l.descricao) g.descricao = l.descricao;
  }
  return [...m.values()].sort((a, b) =>
    String(a.recebido_em || '9999').localeCompare(String(b.recebido_em || '9999'))
    || String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true }));
}

/** Cópias da etiqueta = quantidade recebida, entre 1 e o teto da fila. */
export function copiasEtiqueta(qtde: number): number {
  const n = Math.ceil(num(qtde));
  return Math.min(MAX_COPIAS_ETIQUETA, Math.max(1, n));
}

/** Dias inteiros desde uma data YYYY-MM-DD (local), nunca negativo. */
export function diasDesde(dataIso: string | null | undefined, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataIso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - d.getTime()) / 86400000));
}

/** DD/MM/AAAA (Omie) → YYYY-MM-DD; aceita ISO; inválido = null. */
export function dataBrParaIso(s: unknown): string | null {
  const str = String(s ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(str);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Data de início efetiva: env ALOCACAO_DESDE (YYYY-MM-DD) ou o padrão. */
export function inicioAlocacao(envValor?: string | null): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(envValor || '')) ? String(envValor) : ALOCACAO_DESDE_PADRAO;
}
