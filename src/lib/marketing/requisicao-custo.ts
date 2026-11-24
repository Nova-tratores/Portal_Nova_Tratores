/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Requisição ↔ custo do Marketing (24/11/2026, José: "esse custo tem que estar relacionado às requisições,
// e lá em Requisições também conseguimos lançar como custo de um evento").
//
// O custo continua sendo um mkt_custos com vinculo_tipo='requisicao' (valor SNAPSHOT — ver custos/route.ts).
// O que é da requisição (quem pediu, notas, boleto, recibo, itens) NÃO é copiado: é lido AO VIVO da requisição
// sempre que alguém abre o custo. Assim, nota anexada depois na requisição aparece no Marketing sozinha.
// =============================================================================
import { db } from './db';
import { parseValorMisto } from './custos';
import { sugerirCategoria } from './categorizar';

/** Colunas de anexo da requisição (iguais a lib/requisicoes/anexos.ts — lá é cliente, aqui servidor). */
const CAMPOS_ANEXO = [
  { field: 'foto_nf', label: 'Nota Fiscal' },
  { field: 'foto_nf2', label: 'Nota Fiscal 2' },
  { field: 'foto_nf3', label: 'Nota Fiscal 3' },
  { field: 'foto_nf4', label: 'Nota Fiscal 4' },
  { field: 'foto_nf5', label: 'Nota Fiscal 5' },
  { field: 'boleto_fornecedor', label: 'Boleto' },
  { field: 'recibo_fornecedor', label: 'Recibo / Outros' },
] as const;

const ehDoDrive = (v: any) => String(v || '').startsWith('SupaAtualizarReq_Images/');

function urlAnexo(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (caminho.startsWith('http')) return caminho;
  if (ehDoDrive(caminho)) return null;   // arquivo antigo do Google Drive: sem link direto
  return db.storage.from('requisicoes').getPublicUrl(caminho).data.publicUrl;
}

/** "fulano@x.com" → nome do financeiro_usu; texto comum fica como está. */
export async function nomesDosSolicitantes(brutos: (string | null | undefined)[]): Promise<Record<string, string>> {
  const emails = [...new Set(brutos.map((s) => String(s || '').trim()).filter((s) => s.includes('@')))];
  const mapa: Record<string, string> = {};
  if (emails.length) {
    const { data } = await db.from('financeiro_usu').select('nome, email').in('email', emails);
    for (const u of data ?? []) if (u.email && u.nome) mapa[String(u.email).trim()] = u.nome;
  }
  return mapa;
}

export const nomeSolicitante = (bruto: any, mapa: Record<string, string>) => {
  const s = String(bruto || '').trim();
  return s ? (mapa[s] || s) : null;
};

/** { "6628": "Maria Souza", ... } para os custos que apontam pra requisição. */
export async function solicitantesPorReq(refs: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(refs.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return {};
  const { data } = await db.from('Requisicao').select('id, solicitante').in('id', ids);
  const mapa = await nomesDosSolicitantes((data ?? []).map((r: any) => r.solicitante));
  const out: Record<string, string> = {};
  for (const r of data ?? []) { const n = nomeSolicitante(r.solicitante, mapa); if (n) out[String(r.id)] = n; }
  return out;
}

/** Custo que veio de requisição ganha `req_solicitante` (quem pediu). Falha aqui não derruba a tela. */
export async function comSolicitante<T extends { vinculo_tipo?: any; vinculo_ref?: any }>(custos: T[]): Promise<(T & { req_solicitante?: string })[]> {
  const refs = custos.filter((c) => c.vinculo_tipo === 'requisicao' && c.vinculo_ref).map((c) => String(c.vinculo_ref));
  if (!refs.length) return custos;
  const mapa = await solicitantesPorReq(refs).catch(() => ({} as Record<string, string>));
  return custos.map((c) => (c.vinculo_tipo === 'requisicao' && mapa[String(c.vinculo_ref)] ? { ...c, req_solicitante: mapa[String(c.vinculo_ref)] } : c));
}

/** Tudo o que a tela mostra de uma requisição: dados, quem pediu, itens e anexos (com link). */
export async function detalheDaRequisicao(id: number) {
  const { data: r, error } = await db.from('Requisicao').select('*').eq('id', id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!r) return null;
  const mapa = await nomesDosSolicitantes([r.solicitante]);
  const obs = String(r.obs || '').replace(/\[APPSHEET_ID:.*?\]/g, '').trim();
  return {
    id: r.id,
    titulo: r.titulo || `Requisição #${r.id}`,
    tipo: r.tipo ?? null,
    setor: r.setor ?? null,
    status: r.status ?? null,
    data: r.data ?? null,
    criada_em: r.created_at ?? null,
    fornecedor: r.fornecedor ?? null,
    numero_nota: r.numero_nota ?? null,
    valorCru: r.valor_despeza ?? null,
    valor: parseValorMisto(r.valor_despeza),
    solicitante: nomeSolicitante(r.solicitante, mapa),
    obs,
    anexos: CAMPOS_ANEXO
      .map((c) => ({ label: c.label, url: urlAnexo(r[c.field]), noDrive: ehDoDrive(r[c.field]) }))
      .filter((a) => a.url || a.noDrive),
  };
}

/** Linha de mkt_custos montada a partir da requisição (mesmo formato do "Lançar" da busca de documentos). */
export function custoDaRequisicao(d: NonNullable<Awaited<ReturnType<typeof detalheDaRequisicao>>>) {
  return {
    descricao: d.titulo,
    categoria: sugerirCategoria({ descricao: d.titulo, tipoRequisicao: d.tipo, fornecedor: d.fornecedor }),
    categoria_sugerida: true,
    fornecedor: d.fornecedor || null,
    data: d.data ? String(d.data).slice(0, 10) : null,
    valor: d.valor,
    valor_fonte: d.valor,
    sincronizado_em: new Date().toISOString(),
    vinculo_tipo: 'requisicao',
    vinculo_ref: String(d.id),
    vinculo_label: [d.tipo, d.setor, d.numero_nota ? `NF ${d.numero_nota}` : null].filter(Boolean).join(' · ') || d.titulo,
    status: 'confirmado',
  };
}
