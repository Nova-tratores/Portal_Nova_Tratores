// Proteção contra SSRF: valida uma URL antes do servidor fazer fetch nela.
//
// O risco: uma rota que baixa uma URL vinda do cliente pode ser levada a acessar
// endereços INTERNOS (metadados da nuvem em 169.254.169.254, serviços em
// 127.0.0.1 / 10.x / 192.168.x, etc.) e vazar o conteúdo. Aqui resolvemos o host
// e bloqueamos qualquer URL que aponte pra uma faixa interna — URLs públicas
// (Supabase Storage, etc.) continuam permitidas.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipInterno(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;                                 // 10.0.0.0/8
    if (p[0] === 127) return true;                                // loopback
    if (p[0] === 0) return true;                                  // 0.0.0.0/8
    if (p[0] === 169 && p[1] === 254) return true;                // link-local / metadados
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;    // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true;                // 192.168.0.0/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;   // CGNAT 100.64.0.0/10
    return false;
  }
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;                     // loopback / unspecified
  if (s.startsWith('::ffff:')) return ipInterno(s.slice(7));      // IPv4 mapeado em IPv6
  if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true; // link-local / ULA
  return false;
}

// Devolve true se a URL é segura pra o servidor buscar (http/https e host que
// NÃO resolve pra endereço interno). Qualquer erro/dúvida → false (nega).
export async function urlSegura(rawUrl: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname;
  try {
    if (isIP(host)) return !ipInterno(host);
    const enderecos = await lookup(host, { all: true });
    if (!enderecos.length) return false;
    return enderecos.every((e) => !ipInterno(e.address));
  } catch {
    return false;
  }
}
