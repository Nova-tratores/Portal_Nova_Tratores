// =============================================================================
// INTELIGÊNCIA DE VENDAS — matéria completa das notícias do boletim (lib PURA).
// José, 19/10/2026: "com imagens, e quando clicar na notícia abrir um modal praticamente
// idêntico ao da notícia, porém lá no final deixa o link". O robô abre cada matéria e
// guarda a foto e os parágrafos; aqui ficam as partes sem rede.
// =============================================================================
import { decodificarEntidades } from './noticias';

/** Foto de um <item> do RSS: media:content/thumbnail, enclosure de imagem ou 1º <img> da descrição. */
export function imagemDoRSS(bloco: string): string | null {
  const ok = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? decodificarEntidades(u) : null);
  const media = bloco.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (media && !/medium=["'](?!image)|type=["'](?!image)/i.test(media[0])) { const u = ok(media[1]); if (u) return u; }
  const enc = bloco.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (enc && /image|\.(jpe?g|png|webp)/i.test(enc[0])) { const u = ok(enc[1]); if (u) return u; }
  const html = decodificarEntidades(bloco.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
  return ok(html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]);
}

export interface Artigo { imagem: string | null; paragrafos: string[]; autor: string | null }

const LIXO = /cookies?|assine|assinante|newsletter|leia (também|mais)|clique aqui|todos os direitos|direitos reservados|siga o |siga a |inscreva-se|baixe o app|receba as notícias|whatsapp|telegram|publicidade|compartilhe|copiar link|comentários|faça login|cadastre-se/i;
const TAGS_FORA = /<(script|style|noscript|svg|nav|header|footer|aside|form|figcaption|button|select|iframe)\b[\s\S]*?<\/\1>/gi;
const MIOLO = [
  /itemprop=["']articleBody["']/i,
  /<article[\s>]/i,
  /class=["'][^"']*(?:content-text|entry-content|post-content|article-body|article__body|materia-conteudo|texto-materia|td-post-content|single-content|news-body)[^"']*["']/i,
];

/**
 * HTML de uma matéria → foto principal (og:image) e os parágrafos do texto. Sem
 * biblioteca: prefere o miolo da matéria e descarta menu, CSS, aviso de cookie e
 * chamada para outras matérias. Até 40 parágrafos / ~9 mil caracteres.
 */
export function extrairArtigo(html: string, base: string): Artigo {
  const meta = (nome: string) => {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${nome}["']`, 'i'));
    return a ? decodificarEntidades(a[1]).trim() : null;
  };
  const abs = (u: string | null) => {
    if (!u) return null;
    try { const x = new URL(u, base).toString(); return /^https?:/i.test(x) ? x : null; } catch { return null; }
  };
  const imagem = abs(meta('og:image') || meta('twitter:image') || meta('twitter:image:src'));
  const autor = meta('author') || meta('article:author');

  let h = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(TAGS_FORA, ' ');
  const ini = MIOLO.map((re) => h.search(re)).find((i) => i >= 0);
  if (ini != null) {
    const fim = h.lastIndexOf('</article>');
    h = h.slice(ini, fim > ini ? fim : undefined);
  }
  const vistos = new Set<string>();
  const paragrafos: string[] = [];
  let total = 0;
  for (const m of h.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    const t = decodificarEntidades(m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (t.length < 60 || t.split(' ').length < 9 || LIXO.test(t)) continue;
    if (/[{}]|;\s*$/.test(t)) continue; // CSS/JS que escapou
    if ((t.match(/[a-zà-ú]/gi) || []).length / t.length < 0.6) continue;
    const k = t.slice(0, 80).toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    paragrafos.push(t);
    total += t.length;
    if (paragrafos.length >= 40 || total > 9000) break;
  }
  return { imagem, paragrafos, autor };
}

// ── Google Notícias: link de redirecionamento → link real da matéria ────────
export const ehLinkGoogle = (u: string) => /^https:\/\/news\.google\.com\/(rss\/)?articles\//i.test(u);
export const idDoLinkGoogle = (u: string) => u.split('/articles/')[1]?.split('?')[0] || '';

/** Da página do artigo no Google Notícias: carimbo de tempo e assinatura que a API interna pede. */
export function parametrosGoogle(html: string): { ts: number; sg: string } | null {
  const ts = html.match(/data-n-a-ts="(\d+)"/)?.[1], sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  return ts && sg ? { ts: Number(ts), sg } : null;
}

export function corpoGoogle(id: string, ts: number, sg: string): string {
  const interno = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, ts, sg]);
  return 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', interno, null, 'generic']]]));
}

export function urlDaRespostaGoogle(texto: string): string | null {
  const u = texto.match(/garturlres\\",\\"(https?:[^\\"]+)/)?.[1];
  return u && !/news\.google\.com/.test(u) ? u : null;
}
