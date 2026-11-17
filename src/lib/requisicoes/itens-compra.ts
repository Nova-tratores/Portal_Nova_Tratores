// Itens da nova requisição ("O que vai comprar?", 17/11/2026) — regras puras.
export type ItemCompra = { link: string; produto: string; qtd: string; valor: string };
export type MaisInfo = { itens: ItemCompra[]; fornecedor: string };
export const ITEM_VAZIO: ItemCompra = { link: '', produto: '', qtd: '1', valor: '' };
export const MAIS_INFO_VAZIO: MaisInfo = { itens: [{ ...ITEM_VAZIO }], fornecedor: '' };

export const num = (v: string) => { const s = String(v || '').replace(/[^\d,.]/g, ''); if (!s) return 0; return s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0 : parseFloat(s) || 0; };
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const itemUsado = (i: ItemCompra) => !!(i.link.trim() || i.produto.trim() || num(i.valor));
export const totalItens = (m: MaisInfo) => m.itens.filter(itemUsado).reduce((s, i) => s + (num(i.qtd) || 1) * num(i.valor), 0);

/** o que a requisição recebe ao ser criada: valor total, linhas para as observações e um título se faltar */
export function dadosDosItens(m: MaisInfo): { total: number; linhasObs: string[]; tituloSugerido: string } {
  const usados = m.itens.filter(itemUsado);
  const linhasObs = usados.map((i) => {
    const q = num(i.qtd) || 1;
    const partes = [`${q} × ${i.produto.trim() || 'item'}`];
    if (num(i.valor)) partes.push(`${brl(num(i.valor))} cada = ${brl(q * num(i.valor))}`);
    if (i.link.trim()) partes.push(i.link.trim());
    return `• ${partes.join(' — ')}`;
  });
  const primeiro = usados.find((i) => i.produto.trim())?.produto.trim() || '';
  const tituloSugerido = primeiro ? (usados.length > 1 ? `${primeiro} E MAIS ${usados.length - 1} ITEM(NS)` : primeiro).toUpperCase().slice(0, 120) : '';
  return { total: totalItens(m), linhasObs, tituloSugerido };
}

