// Monitor de uso — normalização de rota (PURA, sem banco).
//
// A rota gravada é SÓ o pathname, com os segmentos dinâmicos trocados por
// `[id]`/`[token]`, para que /pos/123 e /pos/456 contem na mesma linha e para
// nunca gravar query string (carrega CNPJ, cliente, chave de NF).

/** Rotas que o navegador chama sozinho (sinos, chat, badges). Prefixo. */
export const ROTAS_AUTOMATICAS = [
  '/api/notificacoes',
  '/api/chat',
  '/api/financeiro/caixa-email',
  '/api/tratorilson/solicitacoes',
  '/api/tratorilson/perguntas',
  '/api/lembretes',
  '/api/audit/log',
  '/api/uso/',
  '/api/conhecimento',          // botão "?" e novidades: consulta a cada troca de rota
  '/api/trabalho/hoje',
  '/api/cameras/vigia',
  '/api/financeiro/config-envio',
];

/** Prefixos cujo segmento seguinte é SEMPRE dinâmico, mesmo sem cara de id. */
const CAUDA_DINAMICA: Array<[string, string]> = [
  ['/feedbacks/atendimento/', '[clienteKey]'],
  ['/cheque/', '[token]'],
  ['/assinar/', '[token]'],
  ['/q/', '[token]'],
  ['/p/', '[id]'],
  ['/agro/imovel/', '[cod]'],
  ['/api/agro/imovel/', '[cod]'],
  ['/api/assinar/', '[token]'],
  ['/api/q/', '[token]'],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERO = /^\d+$/;
const CODIGO = /^(os|ppv|pv|req|nf|sc)-?\d+$/i;       // OS-0777, PPV-0505, REQ-12
const TOKEN = /^[A-Za-z0-9_-]{22,}$/;                  // base64url de randomBytes(16+)
const HEX_LONGO = /^[0-9a-f]{24,}$/i;

/** Normaliza um pathname para a chave de contagem. Devolve '' se não deve contar. */
export function normalizarRota(pathname: string | null | undefined): string {
  let p = String(pathname || '').trim();
  if (!p) return '';
  // tira query/hash e barra final
  p = p.split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  // internos do Next e estáticos não contam
  if (p.startsWith('/_next') || p === '/favicon.ico' || /\.(png|jpg|jpeg|svg|ico|css|js|map|woff2?)$/i.test(p)) return '';
  if (p === '/login' || p === '/') return '';

  for (const [prefixo, nome] of CAUDA_DINAMICA) {
    if (p.startsWith(prefixo) && p.length > prefixo.length) {
      const resto = p.slice(prefixo.length).split('/');
      resto[0] = nome;
      p = prefixo + resto.join('/');
      break;
    }
  }

  const segs = p.split('/').map((s, i) => {
    if (i === 0 || !s) return s;
    if (s.startsWith('[')) return s;
    if (UUID.test(s) || HEX_LONGO.test(s)) return '[id]';
    if (NUMERO.test(s)) return '[id]';
    if (CODIGO.test(s)) return '[id]';
    if (TOKEN.test(s) && !/^[a-z-]+$/.test(s)) return '[token]';
    return s;
  });
  const out = segs.join('/');
  return out.length > 200 ? out.slice(0, 200) : out;
}

/** Módulo (1º segmento) de uma rota de página; '/api/x/y' → 'api:x'. */
export function moduloDaRota(rota: string): string {
  const segs = String(rota || '').split('/').filter(Boolean);
  if (!segs.length) return '';
  if (segs[0] === 'api') return 'api:' + (segs[1] || '');
  return segs[0];
}

export function ehRotaAutomatica(rota: string): boolean {
  const r = String(rota || '');
  return ROTAS_AUTOMATICAS.some((pre) => r === pre.replace(/\/$/, '') || r.startsWith(pre));
}

/** Dia (YYYY-MM-DD) no fuso de São Paulo — é o "dia" que o usuário vê. */
export function diaLocal(d: Date = new Date()): string {
  // -03:00 sem horário de verão desde 2019.
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return sp.toISOString().slice(0, 10);
}
