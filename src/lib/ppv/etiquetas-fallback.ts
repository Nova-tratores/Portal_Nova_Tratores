// Fallback das ETIQUETAS do PPV: quando a peça ainda não está no espelho
// `produtos_caracteristicas` (sync diário/manual de /ajustes/caracteristicas),
// completa com o espelho `produtos` (sync diário do Visual Estoque), que recebe
// o cadastro novo da Omie na madrugada seguinte. A peça vem SEM locação
// (#PRATELEIRA/#ANDAR/#CAIXA) — isso só existe nas características.
// Lib pura (sem banco) — testada em __tests__/etiquetas-fallback.test.ts.
import { decodeOmieTexto } from '@/lib/omie/texto';

export interface ItemEtiqueta {
  conta_omie: string;
  codigo: string;
  descricao: string | null;
  caracteristicas: Record<string, string> | null;
  chegou?: string | null;
  /** 'produtos' = veio do fallback (sem características/locação ainda). */
  origem?: 'caracteristicas' | 'produtos';
}

export interface ProdutoEspelho {
  conta_omie: string | null;
  codigo: string | null;
  codigo_produto: number | string | null;
  descricao: string | null;
  familia_nome?: string | null;
  inativo?: boolean | null;
}

/** `produtos.conta_omie` é minúscula ('castro'); o resto do portal usa 'CASTRO'. */
export function normalizarConta(c: unknown): string {
  return String(c ?? '').trim().toUpperCase();
}

/** Mesma regra de `familiaCaractPermitida` do sync: peça = família "Peças" ou sem família. */
export function pecaElegivel(p: ProdutoEspelho): boolean {
  if (p.inativo) return false;
  const f = String(p.familia_nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/^#/, '');
  return f === '' || f === 'n/d' || f === 'nd' || f === 'pecas';
}

export function produtoParaItem(p: ProdutoEspelho, chegou?: string | null): ItemEtiqueta {
  return {
    conta_omie: normalizarConta(p.conta_omie),
    codigo: String(p.codigo ?? p.codigo_produto ?? ''),
    // `produtos` guarda o texto escapado pela API da Omie (12&quot;, O&apos;RING)
    descricao: p.descricao != null ? decodeOmieTexto(p.descricao) : null,
    caracteristicas: null,
    ...(chegou !== undefined ? { chegou } : {}),
    origem: 'produtos',
  };
}

/** Índices por `CONTA|sku` e `CONTA|id Omie` (só peças elegíveis). */
export function indexarProdutos(produtos: ProdutoEspelho[]) {
  const porSku = new Map<string, ProdutoEspelho>();
  const porId = new Map<string, ProdutoEspelho>();
  for (const p of produtos) {
    if (!pecaElegivel(p)) continue;
    const conta = normalizarConta(p.conta_omie);
    if (p.codigo) porSku.set(`${conta}|${p.codigo}`, p);
    if (p.codigo_produto != null) porId.set(`${conta}|${String(p.codigo_produto)}`, p);
  }
  return { porSku, porId };
}

/**
 * Busca: junta aos itens do espelho de características as peças do `produtos`
 * que ainda não estão lá (mesma conta+código), ordenadas por descrição.
 */
export function mesclarFallbackBusca(itens: ItemEtiqueta[], produtos: ProdutoEspelho[], limite = 150): ItemEtiqueta[] {
  const vistos = new Set(itens.map((i) => `${i.conta_omie}|${i.codigo}`));
  const extras: ItemEtiqueta[] = [];
  for (const p of produtos) {
    if (!pecaElegivel(p)) continue;
    const item = produtoParaItem(p);
    if (!item.codigo) continue;
    const k = `${item.conta_omie}|${item.codigo}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    extras.push(item);
  }
  extras.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR'));
  return [...itens, ...extras].slice(0, limite);
}
