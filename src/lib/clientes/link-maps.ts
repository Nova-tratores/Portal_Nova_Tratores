// Coordenada a partir de um link do Google Maps (José, 29/10/2026: "não deve só escolher uma localização do carro no POS
// antes de faturar, tem que conseguir colocar um link do Maps"). PURA — usada na tela e no servidor.
// Aceita: ".../@-23.19,-49.38,17z", "?q=-23.19,-49.38", "ll=", "!3d-23.19!4d-49.38" (o ponto do lugar, mais exato que o @),
// "/place/-23.19,-49.38" e o texto "-23.19, -49.38" colado direto. Link curto (maps.app.goo.gl, goo.gl/maps) não traz a
// coordenada: o servidor segue o redirecionamento e passa a URL final por aqui (ehLinkCurto).

export interface Coordenada { lat: number; lng: number }

const valida = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

const N = '(-?\\d{1,3}(?:\\.\\d+)?)';

export function coordenadaDoTexto(entrada: string): Coordenada | null {
  let t = String(entrada || '').trim();
  if (!t) return null;
  try { t = decodeURIComponent(t); } catch { /* fica como veio */ }
  const tentar = (re: RegExp): Coordenada | null => {
    const m = t.match(re);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    return valida(lat, lng) ? { lat, lng } : null;
  };
  return (
    tentar(new RegExp(`!3d${N}!4d${N}`)) ||
    tentar(new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=(?:loc:)?${N}\\s*,\\s*\\+?${N}`)) ||
    tentar(new RegExp(`/place/${N}\\s*,\\s*\\+?${N}`)) ||
    tentar(new RegExp(`@${N},${N}`)) ||
    tentar(new RegExp(`^${N}\\s*[,;\\s]\\s*${N}$`))
  );
}

/** link que só o servidor resolve (encurtado, sem a coordenada no texto) */
export function ehLinkCurto(entrada: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(String(entrada || '').trim());
}

/** só segue redirecionamento destes endereços (o servidor não vira proxy aberto) */
export function hostPermitido(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'g.co' || h === 'maps.google.com' || h === 'www.google.com'
      || h === 'google.com' || /^(www\.)?google\.com\.br$/.test(h) || h === 'maps.google.com.br';
  } catch { return false; }
}
