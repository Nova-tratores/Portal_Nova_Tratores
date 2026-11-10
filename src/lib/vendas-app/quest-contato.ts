// Contato do alvo de uma quest (app de vendas) — regras puras, sem banco.
// O vendedor abre a quest e precisa LIGAR / chamar no WhatsApp / saber onde é.
// Os números vêm de vários lugares (cadastro Omie, CRM, descrição da quest) e
// costumam vir sujos: "(14) 998378238", "14 3351-6049 / 14 99762-7413", sem DDD.
// Sem número ou sem endereço/local, o app oferece "Pedir ao suporte" (Mariano).

export type OrigemTelefone = 'omie' | 'crm' | 'quest';
export interface TelefoneQuest {
  /** só dígitos com DDD (10 ou 11), sem o 55 */
  numero: string;
  /** "(14) 99837-8238" */
  exibir: string;
  celular: boolean;
  origem: OrigemTelefone;
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
export function telefonesDoTexto(texto: string | null | undefined, origem: OrigemTelefone): TelefoneQuest[] {
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
    out.push({ numero: d, exibir: formatarTelefone(d), celular: d.length === 11 && d[2] === '9', origem });
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
  falta: FaltaContato[]; obs?: string | null; questId: number;
}): { titulo: string; descricao: string } {
  const oque = p.falta.map((f) => ROTULO_FALTA[f]).join(' e ') || 'contato';
  const alvo = p.cliente || p.trator || `quest #${p.questId}`;
  const titulo = `${p.vendedor} pede ${oque}: ${alvo}`.slice(0, 200);
  const linhas = [
    `O vendedor ${p.vendedor} está com uma quest e não achou ${oque} no cadastro.`,
    [p.cliente && `Cliente: ${p.cliente}`, p.cidade && `Cidade: ${p.cidade}`, p.trator && `Trator: ${p.trator}`].filter(Boolean).join(' · '),
    p.obs ? `Recado: ${String(p.obs).trim().slice(0, 300)}` : '',
    'Atualize no cadastro do cliente na Omie: o app do vendedor puxa sozinho na próxima sincronização.',
  ].filter(Boolean);
  return { titulo, descricao: linhas.join('\n').slice(0, 1000) };
}

/** Falta escolhida pelo vendedor → só valores conhecidos, sem repetir. */
export function normalizarFalta(v: unknown): FaltaContato[] {
  const ok: FaltaContato[] = ['telefone', 'whatsapp', 'endereco'];
  const arr = Array.isArray(v) ? v : [];
  return ok.filter((f) => arr.includes(f));
}
