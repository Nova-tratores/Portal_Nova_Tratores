// Ler o link da cotação (José, 17/11/2026: "se colocar o link, você não consegue pegar o preço e o produto/fornecedor?").
// Regras PURAS: da página do produto tira nome, preço e loja, nesta ordem de confiança:
//   1) JSON-LD schema.org Product (Mercado Livre, Magalu, lojas VTEX/Shopify/Nuvemshop…) → name, offers.price, seller
//   2) metas Open Graph / produto (og:title, product:price:amount, og:price:amount, itemprop=price)
//   3) <title> e o nome do site (og:site_name) ou o domínio.
// Nada é inventado: o que não achar volta vazio e a pessoa preenche.

export type DadosDoLink = { produto: string; preco: number | null; fornecedor: string; site: string; imagem: string; fonte: 'json-ld' | 'meta' | 'titulo' | '' };

const decodificar = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();

/** "1.234,56", "1234.56", 1234.56, "R$ 99,90" → número */
export function precoDe(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).replace(/[^\d,.]/g, '');
  if (!s) return null;
  let n: number;
  if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  else n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function meta(html: string, nomes: string[]): string {
  for (const nome of nomes) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${nome}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${nome}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m && m[1].trim()) return decodificar(m[1]);
  }
  return '';
}

type Obj = Record<string, unknown>;
function produtosJsonLd(html: string): Obj[] {
  const achados: Obj[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const visitar = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(visitar); return; }
    const o = x as Obj;
    const tipo = o['@type'];
    if (tipo === 'Product' || (Array.isArray(tipo) && tipo.includes('Product'))) achados.push(o);
    if (o['@graph']) visitar(o['@graph']);
  };
  while ((m = re.exec(html))) {
    try { visitar(JSON.parse(m[1].trim())); } catch { /* bloco quebrado: ignora */ }
  }
  return achados;
}

function precoDaOferta(offers: unknown): { preco: number | null; vendedor: string } {
  const lista = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const of of lista as Obj[]) {
    const preco = precoDe(of.price ?? of.lowPrice ?? (of.priceSpecification as Obj | undefined)?.price);
    const seller = of.seller as Obj | undefined;
    const vendedor = typeof seller?.name === 'string' ? seller.name : '';
    if (preco) return { preco, vendedor };
    if (Array.isArray(of.offers)) { const r = precoDaOferta(of.offers); if (r.preco) return r; }
  }
  return { preco: null, vendedor: '' };
}

const siteDe = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
/** "loja.exemplo.com.br" → "Loja Exemplo" (só quando a página não diz o nome) */
const nomeDoDominio = (host: string) => {
  const partes = host.split('.').filter((p) => !['com', 'br', 'net', 'org', 'www', 'loja', 'shop', 'store'].includes(p));
  const base = partes[partes.length - 1] || host;
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export function lerDadosDoHtml(html: string, url: string): DadosDoLink {
  const site = siteDe(url);
  const nomeSite = meta(html, ['og:site_name', 'application-name']) || nomeDoDominio(site);
  const imagem = meta(html, ['og:image', 'twitter:image']);
  for (const p of produtosJsonLd(html)) {
    const { preco, vendedor } = precoDaOferta(p.offers);
    const nome = typeof p.name === 'string' ? decodificar(p.name) : '';
    if (nome || preco) {
      const marcaOuLoja = vendedor || nomeSite;
      const img = typeof p.image === 'string' ? p.image : Array.isArray(p.image) && typeof p.image[0] === 'string' ? p.image[0] : imagem;
      return { produto: nome, preco, fornecedor: decodificar(marcaOuLoja), site, imagem: img, fonte: 'json-ld' };
    }
  }
  const tituloMeta = meta(html, ['og:title', 'twitter:title']);
  const precoMeta = precoDe(meta(html, ['product:price:amount', 'og:price:amount', 'price', 'twitter:data1']));
  if (tituloMeta || precoMeta) return { produto: tituloMeta, preco: precoMeta, fornecedor: nomeSite, site, imagem, fonte: 'meta' };
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let titulo = t ? decodificar(t[1]).replace(/\s*[|\-–]\s*[^|\-–]+$/, '') : '';
  // título que é só o nome da loja (home, erro, busca) não é produto
  const so = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (titulo && (so(titulo).length < 6 || so(nomeSite).includes(so(titulo)) || so(titulo).includes(so(nomeSite)) || /n[aã]o (foi poss[ií]vel|encontr)|404|erro/i.test(titulo)
    // 1–2 palavras sem número ("Mercado Libre", "Magazine Luiza") é nome de loja, não produto
    || (titulo.trim().split(/\s+/).length <= 2 && !/\d/.test(titulo)))) titulo = '';
  return { produto: titulo, preco: null, fornecedor: titulo || site ? nomeSite : '', site, imagem, fonte: titulo ? 'titulo' : '' };
}

/** endereço que o servidor pode buscar (só http/https e nada da rede interna) */
export function urlPublica(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
    const h = x.hostname.toLowerCase();
    if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null; // IP direto: não
    return x;
  } catch { return null; }
}
