// Categorias do dashboard: config (categorias_dashboard) + matching de "tipo"
// + agregação dos cards. Portado de server.js (CATEGORIAS_PADRAO,
// carregarCategorias, tipoMatchCategoria, expandirCategoriaFiltro,
// CATEGORIAS_AGRUPADAS, agregarCards).

import { supabase } from './supabase';

export interface CategoriaConfig {
  nome: string;
  palavras_chave: string;
  posicao: number;
}

export const CATEGORIAS_PADRAO: CategoriaConfig[] = [
  { nome: 'Pneus', palavras_chave: 'pneu,pneus', posicao: 1 },
  { nome: 'Pecas Diversas', palavras_chave: 'peca,pecas,outros', posicao: 2 },
  { nome: 'Servicos', palavras_chave: 'servico,servicos', posicao: 3 },
  { nome: 'Lubrificantes', palavras_chave: 'lubrificante,lubrificantes', posicao: 4 },
  { nome: 'Rodas', palavras_chave: 'roda,rodas', posicao: 5 },
];

// Renomeação/agrupamento de categorias contábeis no dashboard.
// Chave = nome amigável exibido; valor = códigos contábeis Omie do grupo.
export const CATEGORIAS_AGRUPADAS: Record<string, string[]> = {
  'Revenda de Peças Oficina': ['1.01.01', '1.01.02', '1.01.92', '1.01.94', '1.01.95', '1.01.96', '1.01.99'],
  'Revenda de Pecas Balcao': ['1.01.03'],
};

// Config carregada do Supabase (categorias_dashboard), cacheada no processo.
// Global (categorias_dashboard não é por conta). TTL para refletir edições do admin.
let categoriasConfig: CategoriaConfig[] = [...CATEGORIAS_PADRAO];
let categoriasLoadedAt = 0;
const CATEGORIAS_TTL_MS = 5 * 60 * 1000;

/** Força recarga da config (ex.: após editar no /admin). */
export async function carregarCategorias(): Promise<void> {
  const { data } = await supabase.from('categorias_dashboard').select('*').order('posicao');
  if (data && data.length > 0) categoriasConfig = data as CategoriaConfig[];
  categoriasLoadedAt = Date.now();
}

/** Retorna a config de categorias (carrega do Supabase 1x, com TTL). */
export async function getCategoriasConfig(): Promise<CategoriaConfig[]> {
  if (Date.now() - categoriasLoadedAt >= CATEGORIAS_TTL_MS) {
    try {
      await carregarCategorias();
    } catch {
      // mantém o último valor conhecido / padrão
    }
  }
  return categoriasConfig;
}

const norm = (s: string): string =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Verifica se um `tipo` casa com as palavras-chave de uma categoria. */
export function tipoMatchCategoria(tipo: string | null | undefined, catConfig: CategoriaConfig): boolean {
  if (!tipo || !catConfig) return false;
  const t = norm(tipo);
  const palavras = catConfig.palavras_chave.split(',').map(norm);
  return palavras.some((p) => {
    if (!p) return false;
    if (t === p) return true;
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(?:^|[\\s_/\\-])' + escaped + '(?:$|[\\s_/\\-])');
    return regex.test(t);
  });
}

/** Resolve a descrição final de uma categoria considerando o agrupamento. */
export function descricaoCategoriaAgrupada(codigo: string, mapaCategorias: Record<string, string>): string {
  for (const [nomeGrupo, codigos] of Object.entries(CATEGORIAS_AGRUPADAS)) {
    if (codigos.includes(codigo)) return nomeGrupo;
  }
  return mapaCategorias[codigo] || codigo;
}

/** Expande um filtro (código avulso ou nome de grupo) em array de códigos. */
export function expandirCategoriaFiltro(filtro: string | null | undefined): string[] | null {
  if (!filtro) return null;
  if (CATEGORIAS_AGRUPADAS[filtro]) return CATEGORIAS_AGRUPADAS[filtro];
  return [filtro];
}

export interface ItemVenda {
  tipo?: string | null;
  familia?: string | null;
  valor_total?: number | string | null;
  quantidade?: number | string | null;
  codigo_categoria?: string | null;
  cmc_unitario?: number | string | null;
}

export interface AgregarCardsResult {
  card1: number;
  card2: number;
  card3: number;
  cards: number[];
  custosCards: number[];
  nomesCat: string[];
}

const numv = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

/**
 * Agrega itens em N cards por categoria + "Pecas Diversas" (catch-all).
 * Se `filtroCategoria` for informado, filtra os itens pelo código antes.
 * Portado de agregarCards (server.js:1139).
 */
export function agregarCards(
  itens: ItemVenda[],
  filtroCategoria: string | null,
  cats: CategoriaConfig[],
): AgregarCardsResult {
  const valores = new Array(cats.length).fill(0);
  const custos = new Array(cats.length).fill(0);
  let pecasEOutros = 0;
  let custoPecasEOutros = 0;

  const codigosFiltro = filtroCategoria ? expandirCategoriaFiltro(filtroCategoria) : null;

  itens.forEach((item) => {
    if (codigosFiltro && !codigosFiltro.includes(item.codigo_categoria || '')) return;

    const familia = item.familia || '';
    const famNorm = norm(familia);
    const ehPecas = famNorm === '' || famNorm.includes('peca') || famNorm.includes('pecas');

    const vt = numv(item.valor_total);
    const cmcU = numv(item.cmc_unitario);
    const qtd = numv(item.quantidade);
    const ct = cmcU > 0 && qtd > 0 ? cmcU * qtd : 0;

    let matched = false;
    for (let i = 0; i < cats.length; i++) {
      if (tipoMatchCategoria(item.tipo, cats[i])) {
        valores[i] += vt;
        custos[i] += ct;
        matched = true;
        break;
      }
    }
    if (!matched && ehPecas) {
      pecasEOutros += vt;
      custoPecasEOutros += ct;
    }
  });

  return {
    card1: valores[0] || 0,
    card2: valores[1] || 0,
    card3: pecasEOutros,
    cards: valores.concat([pecasEOutros]),
    custosCards: custos.concat([custoPecasEOutros]),
    nomesCat: cats.map((c) => c.nome).concat(['Pecas Diversas']),
  };
}
