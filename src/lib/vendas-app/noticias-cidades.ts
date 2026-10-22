// Notícias REAIS das cidades do vendedor (app de vendas). Uma busca no Google
// Notícias por cidade, só matérias que citam a cidade no título ou no resumo.
// Regras puras; a rota /api/crm-vendas/noticias baixa e guarda em cache.
import { cidadeNorm, textoNorm } from '@/lib/inteligencia-vendas/normalizar';
import { tirarVeiculoDoTitulo, type ItemRSS } from '@/lib/inteligencia-vendas/noticias';

export interface MunicipioIBGE { ibge: number; nome: string; uf: string }
export interface NoticiaCidade { titulo: string; link: string; fonte: string | null; publicadoEm: string | null; cidade: string; uf: string }

const NOME_UF: Record<string, string> = { SP: 'São Paulo', PR: 'Paraná', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul' };

/**
 * Cidades do vendedor (texto livre, várias grafias: "CARLOPOLIS (PR)", "Carlópolis")
 * → municípios do IBGE, sem repetir. Grafia que não existe no IBGE fica de fora.
 */
export function municipiosDoVendedor(textos: string[], ibge: Map<string, MunicipioIBGE>, ufsTentar = ['SP', 'PR']): MunicipioIBGE[] {
  const out = new Map<number, MunicipioIBGE>();
  for (const t of textos) {
    const c = cidadeNorm(t);
    if (!c.nome) continue;
    const m = (c.uf ? [c.uf] : ufsTentar).map((uf) => ibge.get(`${c.nome}|${uf}`)).find(Boolean);
    if (m) out.set(m.ibge, m);
  }
  return [...out.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Busca do Google Notícias da cidade nos últimos `dias`. */
export function urlBuscaCidade(m: MunicipioIBGE, dias = 7): string {
  const q = `"${m.nome}" "${NOME_UF[m.uf] || m.uf}" when:${dias}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

/** A matéria fala da cidade? (nome inteiro, sem acento, como palavra) */
export function mencionaCidade(texto: string, cidade: string): boolean {
  const alvo = textoNorm(cidade);
  if (!alvo) return false;
  return ` ${textoNorm(texto).replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${alvo.replace(/[^a-z0-9]+/g, ' ')} `);
}

/** Itens do RSS de uma cidade → notícias dela (sem as que não citam a cidade). */
export function noticiasDaCidade(itens: ItemRSS[], m: MunicipioIBGE): NoticiaCidade[] {
  return itens
    .filter((i) => mencionaCidade(`${i.titulo} ${i.descricao || ''}`, m.nome))
    .map((i) => ({ titulo: tirarVeiculoDoTitulo(i.titulo, i.fonte), link: i.link, fonte: i.fonte, publicadoEm: i.publicadoEm, cidade: m.nome, uf: m.uf }));
}

/** Junta as cidades: sem título repetido (a mesma matéria sai em vários sites), mais nova primeiro. */
export function juntarNoticias(listas: NoticiaCidade[][], limite = 40): NoticiaCidade[] {
  const vistas = new Set<string>();
  const out: NoticiaCidade[] = [];
  const todas = listas.flat().sort((a, b) => (Date.parse(b.publicadoEm || '') || 0) - (Date.parse(a.publicadoEm || '') || 0));
  for (const n of todas) {
    const k = textoNorm(n.titulo).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    out.push(n);
  }
  return out.slice(0, limite);
}
