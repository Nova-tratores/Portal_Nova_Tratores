// War Room — cálculo do SNAPSHOT SEMANAL (segunda→domingo) reaproveitando os
// dados dos módulos existentes. Só os deriváveis são preenchidos ('auto'); o
// caixa (saldo inicial não é derivável) fica NULL/manual — o núcleo digita.
//
// Recorte À PROVA DE FUSO: `semanaInicio` já é a segunda em BRT (ver
// segundaDaSemana). Enumeramos os 7 dias-CALENDÁRIO (DD/MM/YYYY) e comparamos
// por igualdade de data — não por timestamp — então o fuso do servidor não
// interfere. (As datas nas tabelas são strings DD/MM/YYYY sem hora.)
//
// Fontes (ver relatório de exploração):
//  - margem_semana + tratores_vendidos: uma query em `vendas_itens` do(s) mês(es)
//    da semana, filtrada por `data_pedido` (DD/MM/YYYY) nos 7 dias.
//  - entradas_patio: `produtos.data_inclusao` (DD/MM/YYYY) dos 7 dias, contando
//    famílias de MÁQUINA (classificarGrupo).
//  - volume_antecipado: reusa a rota /api/dre-financeiro/movimentos/antecipacoes
//    (rota SEM auth; lógica FIFO não é exportada). Se falhar, fica null (manual).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { classificarGrupo } from '@/lib/estoque/cruzamento-familia'
import { carregarPedidosInvalidos, pedidoEhInvalido } from '@/lib/dre-financeiro/calc'
import { farolMargem, farolGiro, farolCaixa } from './constantes'

export interface SnapshotSemanal {
  semana_inicio: string           // segunda YYYY-MM-DD (BRT)
  margem_semana: number | null    // fração
  tratores_vendidos: number | null
  entradas_patio: number | null
  volume_antecipado: number | null
  caixa_30d: number | null        // sempre null aqui (manual)
  caixa_60d: number | null
  caixa_90d: number | null
  farol_margem: string | null
  farol_giro: string | null
  farol_caixa: string | null
  origem: Record<string, 'auto' | 'manual'>
  pendentes_automacao: string[]   // campos que ficaram manuais (p/ resumo do gate)
}

function pad2(n: number) { return String(n).padStart(2, '0') }

// Soma n dias-calendário a uma data YYYY-MM-DD (aritmética pura, sem fuso).
function addDiasISO(iso: string, n: number): { iso: string; br: string; ano: number; mes: number } {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000)
  const ano = dt.getUTCFullYear(), mes = dt.getUTCMonth() + 1, dia = dt.getUTCDate()
  return {
    iso: `${ano}-${pad2(mes)}-${pad2(dia)}`,
    br: `${pad2(dia)}/${pad2(mes)}/${ano}`,
    ano, mes,
  }
}

// Normaliza 'D/M/AAAA' → 'DD/MM/AAAA' (tolerante a dias/meses sem zero à esq.).
function normalizaBR(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${pad2(+m[1])}/${pad2(+m[2])}/${m[3]}`
}

interface VendaItem {
  quantidade: number | string
  valor_total: number | string
  cmc_unitario: number | string | null
  data_pedido: string | null
  numero_pedido: string | null
  conta_omie: string | null
  familia: string | null
}

export async function snapshotSemanal(
  semanaInicio: string,
  opts: { origin?: string } = {},
): Promise<SnapshotSemanal> {
  const pendentes: string[] = []
  const origem: Record<string, 'auto' | 'manual'> = {}

  // 7 dias-calendário da semana (BRT), + bordas ISO + meses tocados.
  const dias = Array.from({ length: 7 }, (_, i) => addDiasISO(semanaInicio, i))
  const diasBR = new Set(dias.map((d) => d.br))
  const deISO = dias[0].iso, ateISO = dias[6].iso
  const mesesSet = new Set(dias.map((d) => `${d.ano}-${d.mes}`))
  const orMeses = [...mesesSet]
    .map((k) => { const [a, m] = k.split('-'); return `and(ano.eq.${a},mes.eq.${m})` })
    .join(',')

  // ---- vendas_itens (margem + tratores) --------------------------------
  let margem_semana: number | null = null
  let tratores_vendidos: number | null = null
  try {
    const { data: vendas } = await supabaseAdmin
      .from('vendas_itens')
      .select('quantidade, valor_total, cmc_unitario, data_pedido, numero_pedido, conta_omie, familia')
      .or(orMeses)
      .limit(50000)
    const invalidos = await carregarPedidosInvalidos()
    const daSemana = (vendas || []).filter((v: VendaItem) =>
      diasBR.has(normalizaBR(v.data_pedido) || '') &&
      !pedidoEhInvalido(invalidos, v.conta_omie, v.numero_pedido),
    ) as VendaItem[]

    let receita = 0, margemR = 0, tratores = 0
    for (const v of daSemana) {
      const rec = Number(v.valor_total) || 0
      const qty = Number(v.quantidade) || 0
      const cmv = (Number(v.cmc_unitario) || 0) * qty
      receita += rec
      margemR += rec - cmv
      if (classificarGrupo(v.familia || '') === 'maquina') tratores += qty
    }
    margem_semana = receita > 0 ? +(margemR / receita).toFixed(4) : null
    tratores_vendidos = tratores
    if (margem_semana != null) origem.margem_semana = 'auto'; else pendentes.push('margem_semana')
    origem.tratores_vendidos = 'auto'
  } catch {
    pendentes.push('margem_semana', 'tratores_vendidos')
  }

  // ---- produtos.data_inclusao (entradas de máquina) --------------------
  let entradas_patio: number | null = null
  try {
    const { data: prods } = await supabaseAdmin
      .from('produtos')
      .select('familia_nome, data_inclusao')
      .in('data_inclusao', [...diasBR])
      .limit(10000)
    entradas_patio = (prods || []).filter(
      (p: { familia_nome: string | null }) => classificarGrupo(p.familia_nome || '') === 'maquina',
    ).length
    origem.entradas_patio = 'auto'
  } catch {
    pendentes.push('entradas_patio')
  }

  // ---- volume antecipado (reusa a rota de antecipações) ----------------
  let volume_antecipado: number | null = null
  const origin = process.env.PORTAL_URL || opts.origin
  if (origin) {
    try {
      const url = `${origin}/api/dre-financeiro/movimentos/antecipacoes?de=${deISO}&ate=${ateISO}&conta=todas`
      const r = await fetch(url, { cache: 'no-store' })
      if (r.ok) {
        const j = await r.json()
        const v = Number(j?.totais?.valorCheio)
        if (Number.isFinite(v)) { volume_antecipado = +v.toFixed(2); origem.volume_antecipado = 'auto' }
      }
    } catch { /* deixa manual */ }
  }
  if (volume_antecipado == null) pendentes.push('volume_antecipado')

  // ---- caixa: NÃO derivável (saldo inicial é manual) -------------------
  const caixa_30d = null, caixa_60d = null, caixa_90d = null
  pendentes.push('caixa_30d', 'caixa_60d', 'caixa_90d')

  // ---- faróis (a partir do que foi derivado) ---------------------------
  const excesso = await excessoEntradas4Semanas(semanaInicio, tratores_vendidos, entradas_patio)
  const farol_margem = farolMargem(margem_semana)
  const farol_giro = farolGiro(tratores_vendidos, excesso)
  const farol_caixa = farolCaixa(caixa_90d, volume_antecipado) // null enquanto caixa manual

  return {
    semana_inicio: semanaInicio,
    margem_semana, tratores_vendidos, entradas_patio, volume_antecipado,
    caixa_30d, caixa_60d, caixa_90d,
    farol_margem, farol_giro, farol_caixa,
    origem, pendentes_automacao: pendentes,
  }
}

// Regra do farol de giro: vermelho se entradas > vendidos por 4 semanas seguidas.
// Lê as 3 semanas anteriores + a atual (passada como argumento).
async function excessoEntradas4Semanas(
  semanaInicio: string,
  vendidosAtual: number | null,
  entradasAtual: number | null,
): Promise<boolean> {
  if (entradasAtual == null || vendidosAtual == null) return false
  if (!(entradasAtual > vendidosAtual)) return false
  const { data } = await supabaseAdmin
    .from('war_room_snapshots')
    .select('tratores_vendidos, entradas_patio')
    .lt('semana_inicio', semanaInicio)
    .order('semana_inicio', { ascending: false })
    .limit(3)
  const anteriores = data || []
  if (anteriores.length < 3) return false
  return anteriores.every(
    (s: { tratores_vendidos: number | null; entradas_patio: number | null }) =>
      s.entradas_patio != null && s.tratores_vendidos != null && s.entradas_patio > s.tratores_vendidos,
  )
}
