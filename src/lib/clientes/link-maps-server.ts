// Link do Google Maps → coordenada, no SERVIDOR: o link curto (maps.app.goo.gl) só mostra a coordenada depois de seguir
// o redirecionamento, e o navegador não consegue (CORS). Só segue hosts do Google (hostPermitido), até 5 saltos.
import { coordenadaDoTexto, hostPermitido, type Coordenada } from './link-maps';

export async function coordenadaDoLink(entrada: string): Promise<Coordenada | null> {
  const direto = coordenadaDoTexto(entrada);
  if (direto) return direto;
  let url = String(entrada || '').trim();
  if (!/^https?:\/\//i.test(url) || !hostPermitido(url)) return null;
  for (let salto = 0; salto < 5; salto++) {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (PortalNovaTratores)' }, signal: AbortSignal.timeout(8000) });
    const destino = r.headers.get('location');
    if (destino) {
      const prox = new URL(destino, url).toString();
      const c = coordenadaDoTexto(prox);
      if (c) return c;
      if (!hostPermitido(prox)) return null;
      url = prox;
      continue;
    }
    // sem redirecionamento: a página do Google traz a coordenada no corpo (meta/og ou "@lat,lng")
    const html = (await r.text()).slice(0, 400_000);
    const m = html.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) || html.match(/center=(-?\d{1,3}\.\d+)%2C(-?\d{1,3}\.\d+)/) || html.match(/\[null,null,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/);
    return m ? coordenadaDoTexto(`${m[1]},${m[2]}`) : null;
  }
  return null;
}
