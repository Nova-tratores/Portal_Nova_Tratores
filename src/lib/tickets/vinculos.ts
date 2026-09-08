// Tickets ↔ Requisições — tipos e funções PURAS (client-safe, testáveis).
// NÃO importar @/lib/supabase nem ./server aqui: o client do browser instancia
// no topo e explode no vitest sem env. O parse de valor vem de marketing/custos
// (puro, já testado, aceita "1.234,56" e "800.00" — valor_despeza é TEXT misto).
import { parseValorMisto } from '@/lib/marketing/custos'

export type VinculoTipo = 'requisicao'

export interface TicketVinculo {
  id: string
  ticket_id: string
  vinculo_tipo: VinculoTipo
  vinculo_ref: string          // "Requisicao".id como texto
  vinculo_label: string        // snapshot "#6423 TÍTULO"
  criado_por: string | null
  created_at: string
}

export interface RequisicaoResumo {
  id: number
  titulo: string
  status: string
  tipo: string
  setor: string
  fornecedor: string
  solicitante: string
  data: string | null
  numero_nota: string
  valor: number | null         // parseado; null se vazio
  valor_cru: string            // texto original — nunca somar em SQL
}

export interface CotacaoResumo {
  n: number                    // slot 1..5 de req_cotacao
  fornecedor: string
  servico_material: string
  valor: number | null
  valor_cru: string
  obs: string
  anexo: string                // path cru no bucket `requisicoes` ('' = sem anexo)
  anexo_url: string | null     // resolvido pelo chamador (lib fica pura)
}

export interface TicketVinculoEnriquecido extends TicketVinculo {
  existe: boolean              // false = a requisição sumiu (fica o label snapshot)
  requisicao?: RequisicaoResumo
  cotacoes: CotacaoResumo[]
}

// Colunas lidas de "Requisicao" pro resumo (todas conferidas contra o banco em
// api/financeiro/rastreio e api/marketing/custos/sugestoes).
export const COLS_REQ_RESUMO =
  'id, titulo, tipo, setor, status, data, solicitante, fornecedor, numero_nota, valor_despeza'

// Colunas do Kanban de requisições (Kanban.tsx) + lixeira.
export const STATUS_REQ_INFO: Record<string, { label: string; cor: string; fundo: string }> = {
  pedido:     { label: 'Pedido realizado',       cor: '#ea580c', fundo: 'rgba(234,88,12,.12)' },
  completa:   { label: 'Atualizada por técnico', cor: '#2563eb', fundo: 'rgba(37,99,235,.12)' },
  aguardando: { label: 'Aguardando fornecedor',  cor: '#7c3aed', fundo: 'rgba(124,58,237,.12)' },
  financeiro: { label: 'Enviado financeiro',     cor: '#059669', fundo: 'rgba(5,150,105,.12)' },
  lixeira:    { label: 'Lixeira',                cor: '#6b7280', fundo: 'rgba(107,114,128,.12)' },
}

export function statusReqInfo(status: string | null | undefined) {
  return STATUS_REQ_INFO[String(status || '')] || { label: String(status || '—'), cor: '#6b7280', fundo: 'rgba(107,114,128,.12)' }
}

function texto(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

// Amostra real de req_cotacao: "150,00", "R$ 1.980,00" — o prefixo "R$" faria
// o parse virar 0. Fica só dígito, vírgula, ponto e sinal antes de interpretar.
function valorOuNull(v: unknown): number | null {
  const s = texto(v).replace(/[^\d,.\-]/g, '')
  if (!s || !/\d/.test(s)) return null
  return parseValorMisto(s)
}

export function resumoRequisicao(r: Record<string, unknown>): RequisicaoResumo {
  const id = Number(r.id)
  const valor_cru = texto(r.valor_despeza)
  return {
    id,
    titulo: texto(r.titulo) || `Requisição #${id}`,
    status: texto(r.status),
    tipo: texto(r.tipo),
    setor: texto(r.setor),
    fornecedor: texto(r.fornecedor),
    solicitante: texto(r.solicitante),
    data: texto(r.data) || null,
    numero_nota: texto(r.numero_nota),
    valor: valorOuNull(valor_cru),
    valor_cru,
  }
}

// Rótulo humano gravado no vínculo (snapshot). Corta em 140 pra não virar parágrafo.
export function labelRequisicao(r: { id: number | string; titulo?: string | null }): string {
  return `#${r.id} ${texto(r.titulo)}`.trim().slice(0, 140)
}

// req_cotacao é "wide": fornecedor1..5, servico_material1..5, valor1..5, obs1..5, anexo1..5.
// Um slot conta só se fornecedorN estiver preenchido; buracos (1,2,4) são preservados.
// `urlAnexo` resolve path → URL pública (o chamador passa; sem ele, anexo_url = null).
export function normalizarCotacoes(
  row: Record<string, unknown> | null | undefined,
  urlAnexo: (path: string) => string | null = () => null,
): CotacaoResumo[] {
  if (!row) return []
  const out: CotacaoResumo[] = []
  for (let n = 1; n <= 5; n++) {
    const fornecedor = texto(row[`fornecedor${n}`])
    if (!fornecedor) continue
    const valor_cru = texto(row[`valor${n}`])
    const anexo = texto(row[`anexo${n}`])
    out.push({
      n,
      fornecedor,
      servico_material: texto(row[`servico_material${n}`]),
      valor: valorOuNull(valor_cru),
      valor_cru,
      obs: texto(row[`obs${n}`]),
      anexo,
      anexo_url: anexo ? urlAnexo(anexo) : null,
    })
  }
  return out
}

// Busca do seletor: "6423" | "#6423" → por id; texto → ilike título/fornecedor;
// vazio → recentes. Remove , ( ) porque quebram a sintaxe do .or() do PostgREST.
export type BuscaInterpretada =
  | { modo: 'id'; id: number }
  | { modo: 'texto'; texto: string }
  | { modo: 'recentes' }

export function interpretarBusca(q: string | null | undefined): BuscaInterpretada {
  const s = texto(q)
  if (!s) return { modo: 'recentes' }
  const m = s.match(/^#?(\d+)$/)
  if (m) return { modo: 'id', id: Number(m[1]) }
  const limpo = s.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!limpo) return { modo: 'recentes' }
  return { modo: 'texto', texto: limpo }
}

export function formatarBRL(valor: number | null, cru = ''): string {
  if (valor === null) return cru || '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
