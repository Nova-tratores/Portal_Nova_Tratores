// =============================================================================
// Etiquetas e código de cada post (Fase 4 do plano do Marketing, 23/11/2026).
// Lib PURA (testada em __tests__/etiquetas.test.ts).
//
// Etiquetas = seleção rápida, não texto livre: é o que permite comparar depois "que tipo de post traz contato".
// Código curto (ex.: 6075CAB) = vai na mensagem pronta do WhatsApp e na UTM do link do site; quando o cliente
// chama com o código, dá para saber de qual post ele veio.
// =============================================================================

export const TIPOS_POST = [
  { id: 'entrega', label: 'Entrega de máquina' },
  { id: 'oficina', label: 'Técnico / oficina' },
  { id: 'dica', label: 'Dica de uso / manutenção' },
  { id: 'promocao', label: 'Promoção / condição' },
  { id: 'data', label: 'Data comemorativa' },
  { id: 'bastidor', label: 'Bastidor / equipe' },
  { id: 'depoimento', label: 'Depoimento de cliente' },
  { id: 'evento', label: 'Evento' },
] as const;

export const FORMATOS_POST = [
  { id: 'feed', label: 'Feed (foto)' },
  { id: 'carrossel', label: 'Carrossel' },
  { id: 'reels', label: 'Reels / vídeo curto' },
  { id: 'story', label: 'Story' },
  { id: 'video', label: 'Vídeo longo' },
] as const;

export const GANCHOS = [
  { id: 'pergunta', label: 'Pergunta' },
  { id: 'numero', label: 'Número / preço' },
  { id: 'antes_depois', label: 'Antes e depois' },
  { id: 'pessoa', label: 'Pessoa falando' },
  { id: 'outro', label: 'Outro' },
] as const;

export type Etiquetas = { etiqueta_tipo?: string | null; formato?: string | null; gente_real?: boolean | null; gancho?: string | null };

/** Etiquetas que faltam para o post sair (ideia pode ficar sem). Lista vazia = completo. */
export function etiquetasFaltando(e: Etiquetas): string[] {
  const f: string[] = [];
  if (!TIPOS_POST.some((t) => t.id === e.etiqueta_tipo)) f.push('tipo do post');
  if (!FORMATOS_POST.some((t) => t.id === e.formato)) f.push('formato');
  if (typeof e.gente_real !== 'boolean') f.push('se tem gente real');
  if (!GANCHOS.some((t) => t.id === e.gancho)) f.push('gancho');
  return f;
}

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sem I e O (confundem com 1 e 0)

/**
 * Código curto do post: até 4 letras/números da máquina ou do título + 3 letras sorteadas.
 * "Mahindra 6075" → "6075" + "CAB" → "6075CAB". `sorteio` é injetável para o teste.
 */
export function gerarCodigo(base: string, sorteio: () => number = Math.random): string {
  const limpo = String(base || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const numero = /\d{3,5}/.exec(limpo)?.[0];
  const palavras = limpo.replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((p) => !/^(DE|DA|DO|COM|PARA|NOVA|TRATORES)$/.test(p));
  const palavra = palavras.find((p) => p.length >= 4) ?? palavras.find((p) => p.length >= 3);   // "Dia de Campo" → CAMP, não DIA
  const prefixo = (numero || palavra || 'POST').slice(0, 4);
  let fim = '';
  for (let i = 0; i < 3; i++) fim += LETRAS[Math.floor(sorteio() * LETRAS.length) % LETRAS.length];
  return prefixo + fim;
}

/** "(14) 3351-6049" → "551433516049" (só dígitos, com 55). null se não parece telefone. */
export function numeroWhats(s: unknown): string | null {
  let d = String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

/** Link do WhatsApp da empresa com a mensagem pronta contendo o código do post. */
export function linkWhatsDoPost(numero: string, codigo: string, titulo: string): string {
  const msg = `Oi! Vi o post ${codigo}${titulo ? ` (${titulo})` : ''} e queria saber mais.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

/** Link do site com UTM do post: utm_source=<rede>&utm_medium=post&utm_campaign=<código>. */
export function linkSiteDoPost(url: string, rede: string, codigo: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', rede);
  u.searchParams.set('utm_medium', 'post');
  u.searchParams.set('utm_campaign', codigo);
  return u.toString();
}

/** Acha o código de um post dentro de uma mensagem ("Oi, vi o post 6075CAB…"). Para o Chatwoot marcar a origem. */
export function codigoNaMensagem(texto: string, codigos: string[]): string | null {
  const t = String(texto || '').toUpperCase();
  return codigos.find((c) => new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`).test(t)) ?? null;
}
