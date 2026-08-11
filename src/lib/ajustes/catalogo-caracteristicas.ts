// Propõe valores para as características "Sistema" e "Sub-sistema" na Omie (NOVA)
// a partir do catálogo de peças (tabelas catalogo_figuras / catalogo_pecas).
//
//   Sistema     = catalogo_figuras.secao
//   Sub-sistema = catalogo_figuras.name (o conjunto/figura; não há coluna própria)
//   peça→produto: catalogo_pecas.code  ==  produtos.codigo (SKU)
//
// Regras (decididas com o utilizador):
//  - Só propõe quando o valor é ÚNICO para aquele SKU (uma peça aparece em várias
//    figuras/seções). Se ambíguo, fica em branco (revisão manual na tela).
//  - Normaliza o código: tira o prefixo "RP-" (muitos SKU Mahindra são "RP-<code>"),
//    maiúsculas, sem acentos, só alfanumérico. Sem isto o match cai de ~1423 p/ ~620.
//  - Normaliza o VALOR só em casing/acentos (junta MOTOR/Motor) e grava a forma
//    canónica (a grafia mais frequente no catálogo). A tela deixa rever/deselecionar.
//
// A ESCRITA na Omie é feita pela rota existente /api/ajustes/caracteristicas/aplicar-tipo
// (aplicarTipoLote), que já trata throttle + bloqueio/retoma + mirror em
// produtos_caracteristicas. Aqui só montamos a proposta. Ambas as características
// já existem na Omie NOVA (texto livre).

import { supabase } from './supabase';

const foldAcc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normCode = (s: string) => foldAcc(String(s).trim().toUpperCase()).replace(/[^A-Z0-9]/g, '');
const normCodeProd = (s: string) => normCode(String(s).trim().replace(/^RP-/i, ''));
const keyFold = (s: string) => foldAcc(String(s || '').trim().toUpperCase()).replace(/\s+/g, ' ').trim();

export interface ItemProposta {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  sistema: string;      // '' = ambíguo/sem
  subsistema: string;   // ''
  sistemaAtual: string;
  subAtual: string;
  precisaSistema: boolean; // proposta não vazia e != atual
  precisaSub: boolean;
}

export interface SistemaInfo {
  nome: string;    // grafia canónica
  produtos: number; // nº de produtos NOVA (com match) que tocam esse sistema
}

export interface Proposta {
  itens: ItemProposta[];
  sistemas: SistemaInfo[]; // todos os sistemas distintos entre os produtos com match
  resumo: {
    produtosNova: number;
    comMatch: number;
    semMatch: number;
    sistemaUnico: number;
    subUnico: number;
    ambosAmbiguos: number;
    aEscrever: number; // itens na lista (>=1 proposta pendente)
    jaPreenchidos: number;
  };
}

// Escolhe a grafia canónica de um fold = a mais frequente no catálogo.
function canonOf(m: Map<string, Map<string, number>>, fold: string): string {
  const mm = m.get(fold);
  if (!mm) return '';
  let best = '', bc = -1;
  for (const [raw, c] of mm) if (c > bc) { bc = c; best = raw; }
  return best;
}
function bump(m: Map<string, Map<string, number>>, fold: string, raw: string) {
  let mm = m.get(fold);
  if (!mm) { mm = new Map(); m.set(fold, mm); }
  mm.set(raw, (mm.get(raw) || 0) + 1);
}

let _cache: { at: number; data: Proposta } | null = null;
const TTL_MS = 15 * 60 * 1000;

export async function montarProposta(opts: { force?: boolean } = {}): Promise<Proposta> {
  if (!opts.force && _cache && Date.now() - _cache.at < TTL_MS) return _cache.data;

  // 1) figuras: id -> {secao, name}
  const figuras = new Map<string, { secao: string | null; name: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('catalogo_figuras').select('id, secao, name').range(from, from + 999);
    if (error) throw new Error('catalogo_figuras: ' + error.message);
    for (const f of data as { id: string; secao: string | null; name: string | null }[]) figuras.set(f.id, { secao: f.secao, name: f.name });
    if (!data || data.length < 1000) break;
  }

  // 2) peças: por normCode -> Set de secoes(fold) e figuras(fold); + canónicos
  const porCode = new Map<string, { sec: Set<string>; fig: Set<string> }>();
  const canonSec = new Map<string, Map<string, number>>();
  const canonFig = new Map<string, Map<string, number>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('catalogo_pecas').select('code, figura_id').range(from, from + 999);
    if (error) throw new Error('catalogo_pecas: ' + error.message);
    for (const p of data as { code: string | null; figura_id: string | null }[]) {
      if (p.code == null) continue;
      const raw = String(p.code).trim();
      if (!raw || raw === '-') continue;
      const k = normCode(raw);
      if (!k || p.figura_id == null) continue;
      const f = figuras.get(p.figura_id);
      if (!f) continue;
      let e = porCode.get(k);
      if (!e) { e = { sec: new Set(), fig: new Set() }; porCode.set(k, e); }
      if (f.secao && String(f.secao).trim()) { const fold = keyFold(f.secao); e.sec.add(fold); bump(canonSec, fold, String(f.secao).trim()); }
      if (f.name && String(f.name).trim()) { const fold = keyFold(f.name); e.fig.add(fold); bump(canonFig, fold, String(f.name).trim()); }
    }
    if (!data || data.length < 1000) break;
  }

  // 3) produtos NOVA
  const produtos: { codigo: string; codigo_produto: number; descricao: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('produtos')
      .select('codigo, codigo_produto, descricao')
      .eq('conta_omie', 'nova').eq('arquivado', false)
      .order('codigo_produto').range(from, from + 999);
    if (error) throw new Error('produtos: ' + error.message);
    for (const p of data as { codigo: string | null; codigo_produto: number; descricao: string | null }[]) {
      if (p.codigo == null) continue;
      produtos.push({ codigo: String(p.codigo).trim(), codigo_produto: Number(p.codigo_produto), descricao: String(p.descricao || '') });
    }
    if (!data || data.length < 1000) break;
  }

  // 4) valores atuais das características (mirror local; conta_omie = 'NOVA')
  const atuais = new Map<number, { sistema: string; sub: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('produtos_caracteristicas')
      .select('codigo_produto, caracteristicas')
      .eq('conta_omie', 'NOVA').range(from, from + 999);
    if (error) throw new Error('produtos_caracteristicas: ' + error.message);
    for (const r of data as { codigo_produto: number; caracteristicas: Record<string, string> | null }[]) {
      const c = r.caracteristicas || {};
      atuais.set(Number(r.codigo_produto), { sistema: String(c['Sistema'] || ''), sub: String(c['Sub-sistema'] || '') });
    }
    if (!data || data.length < 1000) break;
  }

  // 5) montar itens
  const itens: ItemProposta[] = [];
  const sistemasMap = new Map<string, Set<number>>(); // sistema canónico -> produtos
  let comMatch = 0, semMatch = 0, sistemaUnico = 0, subUnico = 0, ambosAmbiguos = 0, jaPreenchidos = 0;
  for (const p of produtos) {
    const e = porCode.get(normCodeProd(p.codigo));
    if (!e) { semMatch++; continue; }
    comMatch++;
    // todos os sistemas que tocam este produto (mesmo que seja ambíguo/já preenchido)
    for (const fold of e.sec) {
      const nome = canonOf(canonSec, fold);
      if (!nome) continue;
      let s = sistemasMap.get(nome);
      if (!s) { s = new Set(); sistemasMap.set(nome, s); }
      s.add(p.codigo_produto);
    }
    const sistema = e.sec.size === 1 ? canonOf(canonSec, [...e.sec][0]) : '';
    const subsistema = e.fig.size === 1 ? canonOf(canonFig, [...e.fig][0]) : '';
    if (sistema) sistemaUnico++;
    if (subsistema) subUnico++;
    if (!sistema && !subsistema) { ambosAmbiguos++; continue; }
    const at = atuais.get(p.codigo_produto) || { sistema: '', sub: '' };
    const precisaSistema = !!sistema && sistema !== at.sistema;
    const precisaSub = !!subsistema && subsistema !== at.sub;
    if (!precisaSistema && !precisaSub) { jaPreenchidos++; continue; }
    itens.push({
      codigo_produto: p.codigo_produto, codigo: p.codigo, descricao: p.descricao,
      sistema, subsistema, sistemaAtual: at.sistema, subAtual: at.sub, precisaSistema, precisaSub,
    });
  }
  itens.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));

  const sistemas: SistemaInfo[] = [...sistemasMap.entries()]
    .map(([nome, s]) => ({ nome, produtos: s.size }))
    .sort((a, b) => b.produtos - a.produtos || a.nome.localeCompare(b.nome, 'pt-BR'));

  const data: Proposta = {
    itens,
    sistemas,
    resumo: {
      produtosNova: produtos.length, comMatch, semMatch,
      sistemaUnico, subUnico, ambosAmbiguos, aEscrever: itens.length, jaPreenchidos,
    },
  };
  _cache = { at: Date.now(), data };
  return data;
}
