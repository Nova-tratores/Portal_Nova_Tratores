// Scraping de imagens do Bing. Porta a lógica do app legado (server.js ~846-907).
// FRÁGIL: depende do HTML do Bing (regex sobre `murl&quot;:&quot;...`) e pode ser
// bloqueado por User-Agent/rate-limit. Usar somente server-side (route handlers).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0";

export async function buscarImagensBing(termo: string, limite = 5): Promise<string[]> {
  if (!termo) return [];
  const resp = await fetch(
    `https://www.bing.com/images/search?q=${encodeURIComponent(termo)}&form=HDRSC2&first=1`,
    { headers: { "User-Agent": UA } },
  );
  const html = await resp.text();
  const urls = html.match(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g);
  if (!urls || urls.length === 0) return [];
  return urls
    .slice(0, limite)
    .map((u) => u.replace("murl&quot;:&quot;", "").replace("&quot;", ""));
}
