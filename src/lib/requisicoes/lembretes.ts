// Requisição parada: lembretes para quem abriu + gestor, e ida automática ao
// financeiro quando o comprovante chega (Henri, 09–10/11/2026). PURO: sem banco.
//
// Decisões:
//  - Comprovante = nota fiscal (foto_nf..foto_nf5) ou recibo. Boleto NÃO conta
//    (pode chegar antes da peça/serviço).
//  - Vai sozinha ao financeiro com comprovante + valor + fornecedor. Alimentação
//    manual só precisa do comprovante (já era assim no card). Alimentação criada
//    pela OS (origem auto_alimentacao_os) NÃO: ela vai ao financeiro quando a OS
//    é concluída, já com o valor final (lib/pos/alimentacao-os.ts).
//  - Lembretes só para requisições abertas a partir de REQ_LEMBRETES_DESDE, todos
//    os tipos: 3 dias → aviso para quem abriu; 7 → tarefa na Pendências; 15 → o
//    gestor direto (Organograma) recebe a lista. Cada nível dispara UMA vez.

export const STATUS_ABERTOS = ['pedido', 'completa', 'aguardando'] as const;
export const CAMPOS_COMPROVANTE = ['foto_nf', 'foto_nf2', 'foto_nf3', 'foto_nf4', 'foto_nf5', 'recibo_fornecedor'] as const;
export const ORIGEM_ALIMENTACAO_OS = 'auto_alimentacao_os';
export const REQ_LEMBRETES_DESDE_PADRAO = '2026-11-10';

/** Dias de requisição aberta que disparam cada nível. */
export const NIVEIS = [
  { nivel: 1, dias: 3, alvo: 'solicitante' },
  { nivel: 2, dias: 7, alvo: 'tarefa' },
  { nivel: 3, dias: 15, alvo: 'gestor' },
] as const;
export type Nivel = 1 | 2 | 3;

export interface ReqLembrete {
  id: number;
  titulo?: string | null;
  tipo?: string | null;
  status?: string | null;
  origem?: string | null;
  solicitante?: string | null;
  fornecedor?: string | null;
  valor_despeza?: string | number | null;
  created_at?: string | null;
  [campo: string]: unknown;
}

const preenchido = (v: unknown) => v != null && String(v).trim() !== '' && String(v).trim() !== 'null';

/** Texto BR ("1.304,60") ou US ("1304.60") → número. */
export function valorReq(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const estaAberta = (r: ReqLembrete) => (STATUS_ABERTOS as readonly string[]).includes(String(r.status || '').toLowerCase());
export const ehAlimentacao = (r: ReqLembrete) => String(r.tipo || '').toLowerCase().startsWith('alimenta');
export const ehAlimentacaoDaOS = (r: ReqLembrete) => r.origem === ORIGEM_ALIMENTACAO_OS;
export const temComprovante = (r: ReqLembrete) => CAMPOS_COMPROVANTE.some((c) => preenchido(r[c]));

/** O que falta para a requisição ir ao financeiro (vazio = pronta). */
export function oQueFalta(r: ReqLembrete): string[] {
  const falta: string[] = [];
  if (!temComprovante(r)) falta.push('a nota ou o recibo');
  if (ehAlimentacao(r)) return falta;
  const v = valorReq(r.valor_despeza);
  if (!(v != null && v > 0)) falta.push('o valor');
  if (!preenchido(r.fornecedor)) falta.push('o fornecedor');
  return falta;
}

/** Pode ir sozinha ao financeiro agora? */
export function prontaParaFinanceiro(r: ReqLembrete): boolean {
  return estaAberta(r) && !ehAlimentacaoDaOS(r) && oQueFalta(r).length === 0;
}

/** "a nota ou o recibo, o valor e o fornecedor" */
export function juntarFalta(falta: string[]): string {
  if (falta.length <= 1) return falta[0] || '';
  return `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}`;
}

const DIA_MS = 86_400_000;
export function diasAberta(createdAt: string | null | undefined, agora: Date): number {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / DIA_MS) : 0;
}

export interface LembretePlanejado { reqId: number; nivel: Nivel; dias: number; falta: string[] }

/**
 * Níveis que a requisição já alcançou e ainda não foram disparados. Só requisição
 * aberta, criada a partir de `desde`, que não seja alimentação da OS e que não
 * esteja pronta (a pronta vai ao financeiro na mesma rodada).
 */
export function planejarLembretes(
  reqs: ReqLembrete[],
  jaEnviados: Set<string>,
  agora: Date,
  desde: string = REQ_LEMBRETES_DESDE_PADRAO,
): LembretePlanejado[] {
  const corte = Date.parse(`${desde}T00:00:00-03:00`);
  const out: LembretePlanejado[] = [];
  for (const r of reqs) {
    if (!estaAberta(r) || ehAlimentacaoDaOS(r)) continue;
    const criada = r.created_at ? Date.parse(r.created_at) : NaN;
    if (!Number.isFinite(criada) || criada < corte) continue;
    const falta = oQueFalta(r);
    if (falta.length === 0) continue;
    const dias = diasAberta(r.created_at, agora);
    for (const n of NIVEIS) {
      if (dias >= n.dias && !jaEnviados.has(`${r.id}:${n.nivel}`)) out.push({ reqId: r.id, nivel: n.nivel as Nivel, dias, falta });
    }
  }
  return out;
}

// ── quem é o solicitante ──────────────────────────────────────────────────────
export interface UsuarioPortal { id: string; nome: string | null; email: string | null; ativo?: boolean | null }

export function normalizarNome(s: string | null | undefined): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@. ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * O solicitante é gravado como nome digitado (às vezes e-mail). Casa por e-mail,
 * nome igual (sem acento/caixa) ou, se for único, pelos dois primeiros nomes
 * ("Dougras Mogrs de Jesus Bomfim" × "… Bonfim"). Nome de uma palavra só
 * ("Lucas") só casa se for exato e único.
 */
export function usuarioDoSolicitante(solicitante: string | null | undefined, usuarios: UsuarioPortal[]): UsuarioPortal | null {
  const s = normalizarNome(solicitante);
  if (!s) return null;
  const ativos = usuarios.filter((u) => u.ativo !== false);
  if (s.includes('@')) return ativos.find((u) => normalizarNome(u.email) === s) || null;
  const exatos = ativos.filter((u) => normalizarNome(u.nome) === s);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return null;
  const partes = s.split(' ');
  if (partes.length < 2) return null;
  const prefixo = partes.slice(0, 2).join(' ');
  const porPrefixo = ativos.filter((u) => {
    const n = normalizarNome(u.nome).split(' ');
    return n.length >= 2 && n.slice(0, 2).join(' ') === prefixo;
  });
  return porPrefixo.length === 1 ? porPrefixo[0] : null;
}

/** Organograma: 'u:<uid>' → gestor (só se o gestor também tem login). */
export function gestorDe(userId: string, org: { pessoa_chave: string; gestor_chave: string | null }[]): string | null {
  const g = org.find((o) => o.pessoa_chave === `u:${userId}`)?.gestor_chave;
  return g && g.startsWith('u:') ? g.slice(2) : null;
}

// ── textos ────────────────────────────────────────────────────────────────────
export const linkReq = (id: number) => `/requisicoes?req=${id}`;

export function linhaReq(r: ReqLembrete, dias: number, falta: string[]): string {
  const t = String(r.titulo || r.tipo || 'Requisição').trim().slice(0, 60);
  return `#${r.id} ${t} · ${dias} dias · falta ${juntarFalta(falta)}`;
}

export function tituloTarefa(r: ReqLembrete, falta: string[]): string {
  return `Requisição #${r.id} parada: falta ${juntarFalta(falta)}`.slice(0, 200);
}
