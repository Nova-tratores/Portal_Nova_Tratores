// /financeiro/notas — regras PURAS (client-safe) do tipo da nota, dos filtros do
// cabeçalho da tabela e dos relatórios exportáveis (José, 10/11/2026).
//
// Tipo: NFS-e · NF-e Peças · NF-e Máquinas · NF-e Peças e Máquinas · NF-e outras · Entrada
// (coluna `categoria`, sql/notas-fiscais-categoria.sql). Sem a migration a tela cai para
// o `tipo` cru (NFS-e / NF-e / Entrada).
//
// Os filtros do cabeçalho viram operações do PostgREST (`opsFiltrosColuna`) — a lista é
// paginada, então filtrar/ordenar/somar é no servidor; aqui só fica a regra, testável.
import { type LinhaDoc, type TipoNota, chassiPrincipal, semZeros } from './cache-regras';

// ---------------------------------------------------------------------------
// Tipo da nota
// ---------------------------------------------------------------------------
export type Categoria = 'nfs' | 'nfe_pecas' | 'nfe_maquinas' | 'nfe_mista' | 'nfe_outras' | 'entrada';

export const CATEGORIAS: Categoria[] = ['nfs', 'nfe_pecas', 'nfe_maquinas', 'nfe_mista', 'nfe_outras', 'entrada'];

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  nfs: 'NFS-e',
  nfe_pecas: 'NF-e Peças',
  nfe_maquinas: 'NF-e Máquinas',
  nfe_mista: 'NF-e Peças e Máquinas',
  nfe_outras: 'NF-e outras',
  entrada: 'Entrada',
};

export const DICA_CATEGORIA: Record<Categoria, string> = {
  nfs: 'Nota de serviço (OS)',
  nfe_pecas: 'Nota de produto só com peças',
  nfe_maquinas: 'Nota de produto só com máquinas e implementos',
  nfe_mista: 'Nota de produto com peças e máquinas juntas',
  nfe_outras: 'Nota de produto sem itens de venda no portal (remessa, devolução, pedido fora da pasta…)',
  entrada: 'Nota de entrada (compra)',
};

export const COR_CATEGORIA: Record<Categoria, string> = {
  nfs: '#0369a1',
  nfe_pecas: '#ea580c',
  nfe_maquinas: '#b91c1c',
  nfe_mista: '#9333ea',
  nfe_outras: '#64748b',
  entrada: '#047857',
};

export function ehCategoria(v: unknown): v is Categoria {
  return typeof v === 'string' && (CATEGORIAS as string[]).includes(v);
}

/** Tipo da nota para a tela. Sem a coluna (migration ausente ou nota ainda não
 *  classificada), NFS-e e Entrada saem do `tipo`; NF-e fica `null` (rótulo "NF-e"). */
export function categoriaDe(l: Pick<LinhaDoc, 'tipo' | 'categoria'>): Categoria | null {
  if (ehCategoria(l.categoria)) return l.categoria;
  if (l.tipo === 'saida_servico') return 'nfs';
  if (l.tipo === 'entrada') return 'entrada';
  return null;
}

export function rotuloCategoria(l: Pick<LinhaDoc, 'tipo' | 'categoria'>): string {
  const c = categoriaDe(l);
  return c ? ROTULO_CATEGORIA[c] : 'NF-e';
}

/** `tipo` do banco que contém a categoria (filtro quando a coluna não existe). */
export function tipoDaCategoria(c: Categoria): TipoNota {
  return c === 'nfs' ? 'saida_servico' : c === 'entrada' ? 'entrada' : 'saida_produto';
}

/** Categorias que fazem sentido na aba (Saída · Entrada · Todas). */
export function categoriasDaAba(aba: 'saida' | 'entrada' | 'todas', podeEntrada: boolean): Categoria[] {
  if (aba === 'entrada') return ['entrada'];
  if (aba === 'saida') return CATEGORIAS.filter((c) => c !== 'entrada');
  return podeEntrada ? CATEGORIAS : CATEGORIAS.filter((c) => c !== 'entrada');
}

// ---------------------------------------------------------------------------
// Filtros do cabeçalho
// ---------------------------------------------------------------------------
export type SituacaoDoc = '' | 'completa' | 'incompleta' | 'sem_documento';

export interface FiltrosColuna {
  cat: Categoria[];   // Tipo (vários)
  numero: string;     // Nº / Série / chave
  parte: string;      // Cliente / Fornecedor (nome ou CPF/CNPJ)
  pedido: string;     // Pedido / OS
  maquina: string;    // Máquina (chassi, final, modelo)
  vmin: number | null;
  vmax: number | null;
  situacao: SituacaoDoc; // Documento
}

export const FILTROS_VAZIOS: FiltrosColuna = { cat: [], numero: '', parte: '', pedido: '', maquina: '', vmin: null, vmax: null, situacao: '' };

/** "1.234,56" / "1234.56" / "R$ 1.000" → número; vazio ou lixo → null. */
export function numeroBR(v: string | null | undefined): number | null {
  let s = String(v ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.000" = mil
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const SITUACOES: SituacaoDoc[] = ['', 'completa', 'incompleta', 'sem_documento'];

export function lerFiltrosColuna(sp: { get(k: string): string | null }): FiltrosColuna {
  const cat = String(sp.get('f_cat') || '').split(',').filter(ehCategoria);
  const sit = sp.get('situacao') || '';
  return {
    cat: Array.from(new Set(cat)),
    numero: (sp.get('f_num') || '').trim(),
    parte: (sp.get('f_parte') || '').trim(),
    pedido: (sp.get('f_ped') || '').trim(),
    maquina: (sp.get('f_maq') || '').trim(),
    vmin: numeroBR(sp.get('f_vmin')),
    vmax: numeroBR(sp.get('f_vmax')),
    situacao: (SITUACOES as string[]).includes(sit) ? (sit as SituacaoDoc) : '',
  };
}

export function escreverFiltrosColuna(f: FiltrosColuna, p: URLSearchParams): URLSearchParams {
  if (f.cat.length) p.set('f_cat', f.cat.join(','));
  if (f.numero) p.set('f_num', f.numero);
  if (f.parte) p.set('f_parte', f.parte);
  if (f.pedido) p.set('f_ped', f.pedido);
  if (f.maquina) p.set('f_maq', f.maquina);
  if (f.vmin != null) p.set('f_vmin', String(f.vmin));
  if (f.vmax != null) p.set('f_vmax', String(f.vmax));
  if (f.situacao) p.set('situacao', f.situacao);
  return p;
}

export function contarFiltrosColuna(f: FiltrosColuna): number {
  return (f.cat.length ? 1 : 0) + (f.numero ? 1 : 0) + (f.parte ? 1 : 0) + (f.pedido ? 1 : 0) + (f.maquina ? 1 : 0)
    + (f.vmin != null || f.vmax != null ? 1 : 0) + (f.situacao ? 1 : 0);
}

/** Operação do PostgREST que a rota aplica na consulta. */
export type OpFiltro =
  | { op: 'in'; col: string; val: string[] }
  | { op: 'or'; val: string }
  | { op: 'gte' | 'lte'; col: string; val: number }
  | { op: 'notNull'; col: string }
  | { op: 'gteNum'; col: string; val: number };

/** Texto para `ilike` dentro de `or=` (entre aspas: chassi/projeto têm `.`, `/`, `-`). */
function ilikeOr(col: string, texto: string): string {
  const limpo = texto.replace(/["%]/g, '').replace(/[,()]/g, ' ').trim();
  return `${col}.ilike."*${limpo}*"`;
}

export function opsFiltrosColuna(f: FiltrosColuna, faltando: { semVinculos?: boolean; semCategoria?: boolean } = {}): OpFiltro[] {
  const ops: OpFiltro[] = [];
  if (f.cat.length) {
    if (faltando.semCategoria || faltando.semVinculos) {
      ops.push({ op: 'in', col: 'tipo', val: Array.from(new Set(f.cat.map(tipoDaCategoria))) });
    } else {
      ops.push({ op: 'in', col: 'categoria', val: f.cat });
    }
  }
  if (f.numero) {
    const d = f.numero.replace(/\D/g, '');
    if (d.length >= 20) ops.push({ op: 'or', val: `chave_nfe.ilike.*${d}*` });
    else if (d) ops.push({ op: 'or', val: `numero.ilike.*${semZeros(d)}*` });
    else ops.push({ op: 'or', val: 'id.eq.0' });
  }
  if (f.parte) {
    const d = f.parte.replace(/\D/g, '');
    const soDig = d.length >= 3 && /^[\d.\/\-\s]+$/.test(f.parte);
    ops.push({ op: 'or', val: soDig ? `parte_doc.ilike.*${d}*` : ilikeOr('parte_nome', f.parte) });
  }
  if (f.pedido) {
    if (faltando.semVinculos) ops.push({ op: 'or', val: 'id.eq.0' });
    else {
      const d = semZeros(f.pedido.replace(/\D/g, ''));
      ops.push({ op: 'or', val: d ? `pedido_num.ilike.*${d}*,os_num.ilike.*${d}*` : 'id.eq.0' });
    }
  }
  if (f.maquina) {
    ops.push({ op: 'or', val: faltando.semVinculos ? 'id.eq.0' : ilikeOr('maquina', f.maquina) });
  }
  if (f.vmin != null) ops.push({ op: 'gte', col: 'valor', val: f.vmin });
  if (f.vmax != null) ops.push({ op: 'lte', col: 'valor', val: f.vmax });
  if (f.situacao === 'completa') { ops.push({ op: 'notNull', col: 'pdf_path' }); ops.push({ op: 'notNull', col: 'xml_path' }); }
  else if (f.situacao === 'incompleta') ops.push({ op: 'or', val: 'pdf_path.is.null,xml_path.is.null' });
  else if (f.situacao === 'sem_documento') ops.push({ op: 'gteNum', col: 'tentativas', val: 8 });
  return ops;
}

// ---------------------------------------------------------------------------
// Total dos filtros
// ---------------------------------------------------------------------------
export type LinhaSoma = Pick<LinhaDoc, 'tipo' | 'categoria' | 'valor' | 'cancelada'>;

export interface Soma {
  notas: number;          // todas as do filtro
  valor: number;          // soma SEM as canceladas
  canceladas: number;
  valorCanceladas: number;
  porCategoria: Array<{ id: Categoria | 'nfe'; rotulo: string; notas: number; valor: number }>;
}

export function somar(linhas: LinhaSoma[]): Soma {
  let valor = 0, canceladas = 0, valorCanceladas = 0;
  const por = new Map<string, { id: Categoria | 'nfe'; rotulo: string; notas: number; valor: number }>();
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    if (l.cancelada) { canceladas++; valorCanceladas += v; continue; }
    valor += v;
    const c = categoriaDe(l);
    const id = c ?? 'nfe';
    const g = por.get(id) || { id, rotulo: c ? ROTULO_CATEGORIA[c] : 'NF-e', notas: 0, valor: 0 };
    g.notas++; g.valor += v;
    por.set(id, g);
  }
  const ordem = [...CATEGORIAS, 'nfe'];
  return {
    notas: linhas.length, valor: arred(valor), canceladas, valorCanceladas: arred(valorCanceladas),
    porCategoria: [...por.values()].map((g) => ({ ...g, valor: arred(g.valor) })).sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id)),
  };
}

const arred = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Relatórios exportáveis
// ---------------------------------------------------------------------------
export type TipoRelatorio = 'lista' | 'mes' | 'tipo' | 'maquina' | 'cliente' | 'empresa_mes';
export type FormatoRelatorio = 'xlsx' | 'csv' | 'pdf';

export const RELATORIOS: Array<{ id: TipoRelatorio; nome: string; descricao: string; icone: string }> = [
  { id: 'mes', nome: 'Por mês', descricao: 'Uma linha por mês de emissão, com o valor de cada tipo de nota e o total.', icone: 'fa-calendar-days' },
  { id: 'tipo', nome: 'Por tipo', descricao: 'NFS-e, NF-e Peças, NF-e Máquinas, mistas… com quantidade, valor, % e ticket médio.', icone: 'fa-layer-group' },
  { id: 'maquina', nome: 'Por máquina', descricao: 'Cada máquina (pelo chassi) com as notas de peças, serviço e venda que citam ela.', icone: 'fa-tractor' },
  { id: 'cliente', nome: 'Por cliente / fornecedor', descricao: 'Quem mais comprou (ou vendeu para nós), com quantidade, valor e última nota.', icone: 'fa-users' },
  { id: 'empresa_mes', nome: 'Por empresa e mês', descricao: 'Nova × Castro mês a mês.', icone: 'fa-building' },
  { id: 'lista', nome: 'Lista completa', descricao: 'Todas as notas do filtro, uma por linha, com pedido, OS e máquina.', icone: 'fa-list' },
];

export function ehTipoRelatorio(v: unknown): v is TipoRelatorio {
  return typeof v === 'string' && RELATORIOS.some((r) => r.id === v);
}
export function ehFormatoRelatorio(v: unknown): v is FormatoRelatorio {
  return v === 'xlsx' || v === 'csv' || v === 'pdf';
}

export type TipoColuna = 'texto' | 'moeda' | 'numero' | 'data' | 'pct';
export interface ColunaRel { id: string; rotulo: string; tipo: TipoColuna }
export type Celula = string | number | null;
export interface Relatorio {
  titulo: string;
  colunas: ColunaRel[];
  linhas: Record<string, Celula>[];
  total: Record<string, Celula> | null;
  observacao?: string;
}

export type LinhaRel = Pick<LinhaDoc, 'tipo' | 'categoria' | 'valor' | 'cancelada' | 'conta_omie' | 'numero' | 'serie' | 'data_emissao' | 'parte_nome' | 'parte_doc' | 'pedido_num' | 'os_num' | 'maquina' | 'chave_nfe'>;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotuloMes(ym: string): string {
  const [a, m] = ym.split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a}` : 'sem data';
}

/** Chave da categoria para agrupar (inclui o "NF-e" sem classificação). */
const chaveCat = (l: LinhaRel): Categoria | 'nfe' => categoriaDe(l) ?? 'nfe';
const rotuloChave = (c: Categoria | 'nfe') => (c === 'nfe' ? 'NF-e' : ROTULO_CATEGORIA[c]);
const ORDEM_CAT: Array<Categoria | 'nfe'> = [...CATEGORIAS, 'nfe'];

const OBS_CANCELADAS = (n: number) => (n ? `${n} nota(s) cancelada(s) ficaram fora das somas.` : undefined);

export function montarRelatorio(tipo: TipoRelatorio, todas: LinhaRel[]): Relatorio {
  const validas = todas.filter((l) => !l.cancelada);
  const canceladas = todas.length - validas.length;
  const v = (l: LinhaRel) => Number(l.valor) || 0;

  if (tipo === 'lista') {
    const linhas = [...todas]
      .sort((a, b) => String(b.data_emissao || '').localeCompare(String(a.data_emissao || '')))
      .map((l) => ({
        empresa: l.conta_omie, tipo: rotuloCategoria(l), numero: l.numero || '', serie: l.serie || '',
        emissao: l.data_emissao || '', parte: l.parte_nome || '', doc: l.parte_doc || '',
        pedido: l.pedido_num || '', os: l.os_num || '', maquina: l.maquina || '',
        valor: v(l), situacao: l.cancelada ? 'Cancelada' : 'Válida', chave: l.chave_nfe || '',
      }));
    return {
      titulo: 'Lista de notas',
      colunas: [
        { id: 'empresa', rotulo: 'Empresa', tipo: 'texto' }, { id: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
        { id: 'numero', rotulo: 'Nº', tipo: 'texto' }, { id: 'serie', rotulo: 'Série', tipo: 'texto' },
        { id: 'emissao', rotulo: 'Emissão', tipo: 'data' }, { id: 'parte', rotulo: 'Cliente / Fornecedor', tipo: 'texto' },
        { id: 'doc', rotulo: 'CPF/CNPJ', tipo: 'texto' }, { id: 'pedido', rotulo: 'Pedido', tipo: 'texto' },
        { id: 'os', rotulo: 'OS', tipo: 'texto' }, { id: 'maquina', rotulo: 'Máquina', tipo: 'texto' },
        { id: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { id: 'situacao', rotulo: 'Situação', tipo: 'texto' },
        { id: 'chave', rotulo: 'Chave', tipo: 'texto' },
      ],
      linhas,
      total: { empresa: 'Total (sem canceladas)', valor: arred(validas.reduce((s, l) => s + v(l), 0)) },
      observacao: OBS_CANCELADAS(canceladas),
    };
  }

  if (tipo === 'tipo') {
    const total = validas.reduce((s, l) => s + v(l), 0);
    const g = new Map<Categoria | 'nfe', { notas: number; valor: number }>();
    for (const l of validas) { const k = chaveCat(l); const o = g.get(k) || { notas: 0, valor: 0 }; o.notas++; o.valor += v(l); g.set(k, o); }
    const linhas = ORDEM_CAT.filter((k) => g.has(k)).map((k) => {
      const o = g.get(k)!;
      return { tipo: rotuloChave(k), notas: o.notas, valor: arred(o.valor), pct: total ? o.valor / total : 0, ticket: arred(o.valor / o.notas) };
    });
    return {
      titulo: 'Notas por tipo',
      colunas: [
        { id: 'tipo', rotulo: 'Tipo', tipo: 'texto' }, { id: 'notas', rotulo: 'Notas', tipo: 'numero' },
        { id: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { id: 'pct', rotulo: '% do valor', tipo: 'pct' },
        { id: 'ticket', rotulo: 'Ticket médio', tipo: 'moeda' },
      ],
      linhas,
      total: { tipo: 'Total', notas: validas.length, valor: arred(total), pct: total ? 1 : 0, ticket: validas.length ? arred(total / validas.length) : 0 },
      observacao: OBS_CANCELADAS(canceladas),
    };
  }

  if (tipo === 'mes' || tipo === 'empresa_mes') {
    const grupos = tipo === 'mes'
      ? ORDEM_CAT.filter((k) => validas.some((l) => chaveCat(l) === k))
      : Array.from(new Set(validas.map((l) => String(l.conta_omie).toUpperCase()))).sort();
    const chaveGrupo = (l: LinhaRel): string => (tipo === 'mes' ? chaveCat(l) : String(l.conta_omie).toUpperCase());
    const meses = new Map<string, { notas: number; total: number; por: Map<string, number> }>();
    for (const l of validas) {
      const ym = (l.data_emissao || '').slice(0, 7) || 'sem data';
      const o = meses.get(ym) || { notas: 0, total: 0, por: new Map() };
      o.notas++; o.total += v(l);
      o.por.set(chaveGrupo(l), (o.por.get(chaveGrupo(l)) || 0) + v(l));
      meses.set(ym, o);
    }
    const idG = (g: string) => `g_${g}`;
    const rotG = (g: string) => (tipo === 'mes' ? rotuloChave(g as Categoria | 'nfe') : g === 'CASTRO' ? 'Castro' : g === 'NOVA' ? 'Nova' : g);
    const linhas = [...meses.keys()].sort().map((ym) => {
      const o = meses.get(ym)!;
      const row: Record<string, Celula> = { mes: ym === 'sem data' ? ym : rotuloMes(ym), notas: o.notas };
      for (const g of grupos) row[idG(g)] = arred(o.por.get(g) || 0);
      row.total = arred(o.total);
      return row;
    });
    const total: Record<string, Celula> = { mes: 'Total', notas: validas.length };
    for (const g of grupos) total[idG(g)] = arred(validas.filter((l) => chaveGrupo(l) === g).reduce((s, l) => s + v(l), 0));
    total.total = arred(validas.reduce((s, l) => s + v(l), 0));
    return {
      titulo: tipo === 'mes' ? 'Notas por mês e tipo' : 'Notas por empresa e mês',
      colunas: [
        { id: 'mes', rotulo: 'Mês', tipo: 'texto' }, { id: 'notas', rotulo: 'Notas', tipo: 'numero' },
        ...grupos.map((g) => ({ id: idG(g), rotulo: rotG(g), tipo: 'moeda' as const })),
        { id: 'total', rotulo: 'Total', tipo: 'moeda' },
      ],
      linhas, total, observacao: OBS_CANCELADAS(canceladas),
    };
  }

  if (tipo === 'maquina') {
    const g = new Map<string, { desc: string; notas: number; nfs: number; pecas: number; maquina: number; outras: number; total: number; clientes: Set<string>; primeira: string; ultima: string }>();
    for (const l of validas) {
      if (!l.maquina) continue;
      const k = chassiPrincipal(l.maquina) || l.maquina;
      const o = g.get(k) || { desc: l.maquina, notas: 0, nfs: 0, pecas: 0, maquina: 0, outras: 0, total: 0, clientes: new Set<string>(), primeira: '', ultima: '' };
      const c = chaveCat(l);
      o.notas++; o.total += v(l);
      if (c === 'nfs') o.nfs += v(l);
      else if (c === 'nfe_pecas') o.pecas += v(l);
      else if (c === 'nfe_maquinas' || c === 'nfe_mista') o.maquina += v(l);
      else o.outras += v(l);
      if (l.parte_nome) o.clientes.add(l.parte_nome);
      const d = l.data_emissao || '';
      if (d && (!o.primeira || d < o.primeira)) o.primeira = d;
      if (d && d > o.ultima) o.ultima = d;
      if (l.maquina.length > o.desc.length) o.desc = l.maquina;
      g.set(k, o);
    }
    const linhas = [...g.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, o]) => ({
      chassi: k, descricao: o.desc, notas: o.notas, nfs: arred(o.nfs), pecas: arred(o.pecas), venda: arred(o.maquina), outras: arred(o.outras),
      total: arred(o.total), clientes: [...o.clientes].join(' · '), primeira: o.primeira, ultima: o.ultima,
    }));
    const sum = (id: 'nfs' | 'pecas' | 'venda' | 'outras' | 'total') => arred(linhas.reduce((s, l) => s + (l[id] as number), 0));
    const semMaquina = validas.filter((l) => !l.maquina).length;
    return {
      titulo: 'Notas por máquina',
      colunas: [
        { id: 'chassi', rotulo: 'Chassi', tipo: 'texto' }, { id: 'descricao', rotulo: 'Máquina', tipo: 'texto' },
        { id: 'notas', rotulo: 'Notas', tipo: 'numero' }, { id: 'nfs', rotulo: 'Serviço (NFS-e)', tipo: 'moeda' },
        { id: 'pecas', rotulo: 'Peças', tipo: 'moeda' }, { id: 'venda', rotulo: 'Máquina (venda)', tipo: 'moeda' },
        { id: 'outras', rotulo: 'Outras', tipo: 'moeda' }, { id: 'total', rotulo: 'Total', tipo: 'moeda' },
        { id: 'clientes', rotulo: 'Clientes', tipo: 'texto' }, { id: 'primeira', rotulo: 'Primeira nota', tipo: 'data' },
        { id: 'ultima', rotulo: 'Última nota', tipo: 'data' },
      ],
      linhas,
      total: { chassi: 'Total', notas: linhas.reduce((s, l) => s + l.notas, 0), nfs: sum('nfs'), pecas: sum('pecas'), venda: sum('venda'), outras: sum('outras'), total: sum('total') },
      observacao: [semMaquina ? `${semMaquina} nota(s) do filtro não citam máquina e ficaram fora.` : '', OBS_CANCELADAS(canceladas) || ''].filter(Boolean).join(' ') || undefined,
    };
  }

  // cliente / fornecedor
  const g = new Map<string, { nome: string; doc: string; notas: number; valor: number; ultima: string; tipos: Set<string> }>();
  for (const l of validas) {
    const k = l.parte_doc || `nome:${(l.parte_nome || '').toUpperCase()}`;
    const o = g.get(k) || { nome: l.parte_nome || '—', doc: l.parte_doc || '', notas: 0, valor: 0, ultima: '', tipos: new Set<string>() };
    o.notas++; o.valor += v(l); o.tipos.add(rotuloCategoria(l));
    if ((l.data_emissao || '') > o.ultima) o.ultima = l.data_emissao || '';
    g.set(k, o);
  }
  const linhas = [...g.values()].sort((a, b) => b.valor - a.valor).map((o) => ({
    nome: o.nome, doc: o.doc, notas: o.notas, valor: arred(o.valor), ticket: arred(o.valor / o.notas), tipos: [...o.tipos].join(' · '), ultima: o.ultima,
  }));
  return {
    titulo: 'Notas por cliente / fornecedor',
    colunas: [
      { id: 'nome', rotulo: 'Cliente / Fornecedor', tipo: 'texto' }, { id: 'doc', rotulo: 'CPF/CNPJ', tipo: 'texto' },
      { id: 'notas', rotulo: 'Notas', tipo: 'numero' }, { id: 'valor', rotulo: 'Valor', tipo: 'moeda' },
      { id: 'ticket', rotulo: 'Ticket médio', tipo: 'moeda' }, { id: 'tipos', rotulo: 'Tipos', tipo: 'texto' },
      { id: 'ultima', rotulo: 'Última nota', tipo: 'data' },
    ],
    linhas,
    total: { nome: 'Total', notas: validas.length, valor: arred(validas.reduce((s, l) => s + v(l), 0)) },
    observacao: OBS_CANCELADAS(canceladas),
  };
}

// ---------------------------------------------------------------------------
// Formatação (CSV / tela / PDF)
// ---------------------------------------------------------------------------
export function fmtCelula(c: Celula, tipo: TipoColuna): string {
  if (c == null || c === '') return '';
  if (tipo === 'moeda') return Number(c).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (tipo === 'numero') return Number(c).toLocaleString('pt-BR');
  if (tipo === 'pct') return `${(Number(c) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (tipo === 'data') { const s = String(c); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s; }
  return String(c);
}

/** CSV para Excel brasileiro: `;`, vírgula decimal, BOM é por conta de quem baixa. */
export function relatorioCsv(r: Relatorio): string {
  const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const celula = (c: Celula, t: TipoColuna) => {
    if (c == null || c === '') return '';
    if (t === 'moeda' || t === 'numero') return String(c).replace('.', ',');
    if (t === 'pct') return String(arred(Number(c) * 100)).replace('.', ',');
    return esc(fmtCelula(c, t));
  };
  const out = [r.colunas.map((c) => esc(c.rotulo)).join(';')];
  for (const l of r.linhas) out.push(r.colunas.map((c) => celula(l[c.id] ?? null, c.tipo)).join(';'));
  if (r.total) out.push(r.colunas.map((c) => celula(r.total![c.id] ?? null, c.tipo)).join(';'));
  return out.join('\r\n');
}

/** Descrição dos filtros (cabeçalho do PDF/planilha e log). */
export function descreverFiltros(p: {
  conta?: string; aba?: string; de?: string; ate?: string; q?: string; campo?: string; filtros: FiltrosColuna;
}): string[] {
  const f = p.filtros;
  const d = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
  const out: string[] = [];
  out.push(`Empresa: ${p.conta ? p.conta : 'Nova e Castro'}`);
  if (p.aba) out.push(`Notas: ${p.aba === 'entrada' ? 'entrada' : p.aba === 'saida' ? 'saída' : 'todas'}`);
  out.push(`Emissão: ${p.de || p.ate ? `${p.de ? d(p.de) : 'início'} a ${p.ate ? d(p.ate) : 'hoje'}` : 'todo o período'}`);
  if (p.q) out.push(`Busca: "${p.q}"${p.campo && p.campo !== 'auto' ? ` em ${p.campo}` : ''}`);
  if (f.cat.length) out.push(`Tipo: ${f.cat.map((c) => ROTULO_CATEGORIA[c]).join(', ')}`);
  if (f.numero) out.push(`Nº: ${f.numero}`);
  if (f.parte) out.push(`Cliente/fornecedor: ${f.parte}`);
  if (f.pedido) out.push(`Pedido/OS: ${f.pedido}`);
  if (f.maquina) out.push(`Máquina: ${f.maquina}`);
  if (f.vmin != null || f.vmax != null) out.push(`Valor: ${f.vmin != null ? `≥ ${fmtCelula(f.vmin, 'moeda')}` : ''}${f.vmin != null && f.vmax != null ? ' e ' : ''}${f.vmax != null ? `≤ ${fmtCelula(f.vmax, 'moeda')}` : ''}`);
  if (f.situacao) out.push(`Documento: ${f.situacao === 'completa' ? 'guardado (PDF + XML)' : f.situacao === 'incompleta' ? 'falta PDF ou XML' : 'sem documento na Omie'}`);
  return out;
}
