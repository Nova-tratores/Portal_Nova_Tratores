// Contato do alvo de uma quest ou de um negócio (app de vendas) — regras puras, sem banco.
// O vendedor abre a quest/o card do negócio e precisa LIGAR / chamar no WhatsApp / saber onde é.
// Os números vêm de vários lugares (cadastro Omie, CRM, descrição da quest) e
// costumam vir sujos: "(14) 998378238", "14 3351-6049 / 14 99762-7413", sem DDD.
// Sem número ou sem endereço/local, o app oferece "Pedir ao suporte" (Mariano).

export type OrigemTelefone = 'omie' | 'crm' | 'quest' | 'contato' | 'suporte';
export interface TelefoneQuest {
  /** só dígitos com DDD (10 ou 11), sem o 55 */
  numero: string;
  /** "(14) 99837-8238" */
  exibir: string;
  celular: boolean;
  origem: OrigemTelefone;
  /** de quem é o número (pessoa cadastrada na propriedade), quando se sabe */
  nome?: string | null;
}
export type FaltaContato = 'telefone' | 'whatsapp' | 'endereco';

/** "(14) 99837-8238" / "(14) 3351-6049". */
export function formatarTelefone(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * Todos os telefones com DDD de um texto. Separa por "/", ";", "," e " e ";
 * aceita o 55 na frente. Celular = 11 dígitos com 9 depois do DDD. Número sem
 * DDD (8–9 dígitos) é descartado: ligar para ele daria em outra cidade.
 */
export function telefonesDoTexto(texto: string | null | undefined, origem: OrigemTelefone, nome?: string | null): TelefoneQuest[] {
  const out: TelefoneQuest[] = [];
  const partes = String(texto || '').split(/[\/;,|\n]|\s+e\s+|\s+ou\s+/i);
  for (const p of partes) {
    let d = p.replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1); // "014 …"
    if (d.length !== 10 && d.length !== 11) continue;
    if (Number(d.slice(0, 2)) < 11) continue; // DDD inválido
    // celular gravado antes do 9º dígito ("(43) 9157-8141"): fixo começa com 2–5
    if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
    out.push({ numero: d, exibir: formatarTelefone(d), celular: d.length === 11 && d[2] === '9', origem, ...(nome?.trim() ? { nome: nome.trim() } : {}) });
  }
  return out;
}

/** Junta as fontes sem repetir o número; celular primeiro, mantendo a ordem de confiança. */
export function juntarTelefones(...listas: TelefoneQuest[][]): TelefoneQuest[] {
  const vistos = new Set<string>();
  const todos: TelefoneQuest[] = [];
  for (const l of listas) for (const t of l) {
    if (vistos.has(t.numero)) continue;
    vistos.add(t.numero);
    todos.push(t);
  }
  return [...todos.filter((t) => t.celular), ...todos.filter((t) => !t.celular)];
}

/** O que falta para o vendedor conseguir falar com o cliente e chegar lá. */
export function faltaContato(c: { telefones: TelefoneQuest[]; temLocal: boolean; endereco: string | null }): FaltaContato[] {
  const f: FaltaContato[] = [];
  if (!c.telefones.length) f.push('telefone');
  else if (!c.telefones.some((t) => t.celular)) f.push('whatsapp');
  if (!c.temLocal && !String(c.endereco || '').trim()) f.push('endereco');
  return f;
}

export const ROTULO_FALTA: Record<FaltaContato, string> = {
  telefone: 'telefone',
  whatsapp: 'celular / WhatsApp',
  endereco: 'endereço / localização',
};

/** Texto da notificação para o suporte. */
export function textoPedidoSuporte(p: {
  vendedor: string; cliente: string | null; cidade: string | null; trator: string | null;
  falta: FaltaContato[]; obs?: string | null; questId?: number | null;
  /** negócio do funil ("Pulverizador KUHN ARBO 2000"), quando o pedido vem do card de Negócios */
  negocio?: string | null;
}): { titulo: string; descricao: string } {
  const oque = p.falta.map((f) => ROTULO_FALTA[f]).join(' e ') || 'contato';
  const alvo = p.cliente || p.trator || p.negocio || (p.questId ? `quest #${p.questId}` : 'cliente');
  const onde = p.negocio ? 'um negócio' : 'uma quest';
  const titulo = `${p.vendedor} pede ${oque}: ${alvo}`.slice(0, 200);
  const linhas = [
    `O vendedor ${p.vendedor} está com ${onde} e não achou ${oque} no cadastro.`,
    [p.cliente && `Cliente: ${p.cliente}`, p.cidade && `Cidade: ${p.cidade}`, p.trator && `Trator: ${p.trator}`, p.negocio && `Negócio: ${p.negocio}`].filter(Boolean).join(' · '),
    p.obs ? `Recado: ${String(p.obs).trim().slice(0, 300)}` : '',
    'Abra o pedido para preencher: o vendedor é avisado e o contato aparece na quest dele.',
  ].filter(Boolean);
  return { titulo, descricao: linhas.join('\n').slice(0, 1000) };
}

/** Falta escolhida pelo vendedor → só valores conhecidos, sem repetir. */
export function normalizarFalta(v: unknown): FaltaContato[] {
  const ok: FaltaContato[] = ['telefone', 'whatsapp', 'endereco'];
  const arr = Array.isArray(v) ? v : [];
  return ok.filter((f) => arr.includes(f));
}

// ─── Resposta do suporte (Mariano preenche o pedido no portal) ─────────────────
export interface RespostaSuporte {
  telefone: string | null; celular: string | null; endereco: string | null;
  lat: number | null; lng: number | null;
  respondido_por: string | null; respondido_em: string | null;
}
export interface PontoContato { nome: string; lat: number; lng: number; origem: string; quando: string | null; quem: string | null }

/**
 * Junta ao contato o que o suporte informou (mais recente primeiro). Telefones do
 * suporte vêm na frente (alguém conferiu); o endereço do suporte vale sobre o do
 * cadastro; o ponto do suporte entra depois de "o vendedor viu o trator aqui".
 */
export function mesclarSuporte<L extends PontoContato>(
  c: { telefones: TelefoneQuest[]; endereco: string | null; locais: L[] },
  respostas: RespostaSuporte[],
): { telefones: TelefoneQuest[]; endereco: string | null; locais: (L | PontoContato)[] } {
  if (!respostas.length) return c;
  const ordem = [...respostas].sort((a, b) => String(b.respondido_em || '').localeCompare(String(a.respondido_em || '')));
  const doSuporte = ordem.flatMap((r) => [
    ...telefonesDoTexto(r.celular, 'suporte'),
    ...telefonesDoTexto(r.telefone, 'suporte'),
  ]);
  const endereco = ordem.map((r) => String(r.endereco || '').trim()).find(Boolean) || c.endereco;
  const locais: (L | PontoContato)[] = [...c.locais];
  const r = ordem.find((x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)) && x.lat != null && x.lng != null && Number(x.lat) !== 0);
  if (r && !locais.some((l) => Math.abs(l.lat - Number(r.lat)) < 0.0005 && Math.abs(l.lng - Number(r.lng)) < 0.0005)) {
    const ponto: PontoContato = { nome: 'Local informado pelo suporte', lat: Number(r.lat), lng: Number(r.lng), origem: 'suporte', quando: r.respondido_em, quem: r.respondido_por };
    const iVisita = locais.findLastIndex((l) => l.origem === 'visita');
    locais.splice(iVisita + 1, 0, ponto);
  }
  return { telefones: juntarTelefones(doSuporte, c.telefones), endereco, locais };
}

/** Recado ao vendedor quando o suporte responde o pedido. */
export function textoRespostaVendedor(p: {
  alvo: string | null; respondidoPor: string | null;
  telefone: string | null; celular: string | null; endereco: string | null; temLocal: boolean; obs?: string | null;
}): { titulo: string; corpo: string } {
  const tels = juntarTelefones(telefonesDoTexto(p.celular, 'suporte'), telefonesDoTexto(p.telefone, 'suporte')).map((t) => t.exibir);
  const partes = [
    tels.length ? `Telefone: ${tels.join(', ')}` : '',
    String(p.endereco || '').trim() ? `Endereço: ${String(p.endereco).trim()}` : '',
    p.temLocal ? 'Localização no mapa' : '',
  ].filter(Boolean);
  const quem = String(p.respondidoPor || 'O suporte').trim();
  const corpo = [
    `${quem} atualizou o contato${p.alvo ? ` de ${p.alvo}` : ''}.`,
    partes.join(' · '),
    p.obs ? `Recado: ${String(p.obs).trim().slice(0, 300)}` : '',
    'Abra a quest: o contato já aparece lá.',
  ].filter(Boolean).join('\n');
  return { titulo: 'Contato atualizado pelo suporte', corpo: corpo.slice(0, 1000) };
}

/** A resposta precisa trazer pelo menos um dado útil. */
export function respostaVazia(r: { telefone?: string | null; celular?: string | null; endereco?: string | null; lat?: number | null }): boolean {
  const tels = [...telefonesDoTexto(r.telefone, 'suporte'), ...telefonesDoTexto(r.celular, 'suporte')];
  return !tels.length && !String(r.endereco || '').trim() && r.lat == null;
}
