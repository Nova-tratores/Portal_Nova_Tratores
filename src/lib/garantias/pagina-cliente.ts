// =============================================================================
// PÁGINA DA GARANTIA (QR code do adesivo) — regras PURAS (testadas).
//
// A página pública /garantia manda eventos de uso e dúvidas para
// /api/garantia-cliente/*. Tudo que chega de lá é texto de quem não tem login:
// aqui se valida e se corta antes de gravar, e se agrega para o painel.
// =============================================================================

export const TIPOS_EVENTO = [
  'visita', 'pergunta_rapida', 'faq', 'busca', 'busca_sem_resultado',
  'whatsapp', 'consulta_trator', 'duvida_enviada', 'salvou_celular',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const STATUS_DUVIDA = ['nova', 'respondida', 'arquivada'] as const;
export type StatusDuvida = (typeof STATUS_DUVIDA)[number];

export const URL_PAGINA = 'https://portal.novatratores.com/garantia';

export type EventoValido = { tipo: TipoEvento; valor: string | null; sessao: string | null };
export type DuvidaValida = { nome: string; chassi_final: string | null; mensagem: string; sessao: string | null };

/** Texto livre: tira controle, junta espaços e corta no tamanho. */
export function limparTexto(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

function limparSessao(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{6,40}$/.test(s) ? s : null;
}

/** Evento de uso. Devolve null se o tipo não é conhecido. */
export function validarEvento(corpo: unknown): EventoValido | null {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const tipo = String(c.tipo ?? '') as TipoEvento;
  if (!TIPOS_EVENTO.includes(tipo)) return null;
  // Busca é guardada em minúsculas: "Bateria" e "bateria" contam juntas.
  const bruto = limparTexto(c.valor, 200).replace(/\n/g, ' ');
  const valor = tipo === 'busca' || tipo === 'busca_sem_resultado' ? bruto.toLowerCase() : bruto;
  return { tipo, valor: valor || null, sessao: limparSessao(c.sessao) };
}

/** Dúvida do formulário. Devolve a mensagem de erro em vez de lançar. */
export function validarDuvida(corpo: unknown): { ok: true; duvida: DuvidaValida } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const nome = limparTexto(c.nome, 120).replace(/\n/g, ' ');
  const mensagem = limparTexto(c.mensagem, 2000);
  const chassi = limparTexto(c.chassi_final, 40).replace(/\n/g, ' ');
  if (!nome) return { ok: false, erro: 'Informe seu nome.' };
  if (!mensagem) return { ok: false, erro: 'Escreva a sua dúvida.' };
  return { ok: true, duvida: { nome, chassi_final: chassi || null, mensagem, sessao: limparSessao(c.sessao) } };
}

export type ItemContagem = { valor: string; total: number };

/** Conta os eventos de um tipo por valor, do mais frequente para o menos. */
export function rankingPorValor(
  eventos: { tipo: string; valor: string | null }[],
  tipo: TipoEvento,
  limite = 15,
): ItemContagem[] {
  const mapa = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== tipo || !e.valor) continue;
    mapa.set(e.valor, (mapa.get(e.valor) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => b.total - a.total || a.valor.localeCompare(b.valor, 'pt-BR'))
    .slice(0, limite);
}

export type ResumoUso = {
  visitas: number;
  pessoas: number;
  whatsapp: number;
  consultas: number;
  duvidasEnviadas: number;
  salvaramNoCelular: number;
  porDia: { dia: string; visitas: number }[];
};

/** Números do topo do painel. `dia` em AAAA-MM-DD no fuso de São Paulo. */
export function resumirUso(eventos: { tipo: string; sessao: string | null; criado_em: string }[]): ResumoUso {
  const conta = (t: string) => eventos.filter((e) => e.tipo === t).length;
  const sessoes = new Set(eventos.filter((e) => e.tipo === 'visita' && e.sessao).map((e) => e.sessao));
  const dias = new Map<string, number>();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const e of eventos) {
    if (e.tipo !== 'visita') continue;
    const d = fmt.format(new Date(e.criado_em));
    dias.set(d, (dias.get(d) ?? 0) + 1);
  }
  return {
    visitas: conta('visita'),
    pessoas: sessoes.size,
    whatsapp: conta('whatsapp'),
    consultas: conta('consulta_trator'),
    duvidasEnviadas: conta('duvida_enviada'),
    salvaramNoCelular: conta('salvou_celular'),
    porDia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, visitas]) => ({ dia, visitas })),
  };
}
