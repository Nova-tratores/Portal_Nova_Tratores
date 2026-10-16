// Painel do pós-vendas (José, 16/10/2026) — leitura no banco. Regras em ./painel.ts.
//
// Fontes:
//  - Horas trabalhadas: Ordem_Servico_Tecnicos (app do técnico) — colunas explícitas
//    (select=* estoura o tempo: fotos e assinaturas na linha).
//  - OS faturadas no período: Ordem_Servico.faturado_omie_em (faturar pelo portal / carimbo
//    da conferência) OU a data da nota no espelho do Omie (os_servicos_itens, conta NOVA).
//    OS que só existe no Omie entra com as linhas de hora/km de lá e "Sem técnico".
//  - Peças: PPVs da OS (valorPecasPorPPV). Custo de terceiros: requisições da OS.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_OS } from '@/lib/pos/constants'
import { getConfigPOS } from '@/lib/pos/config'
import { valorPecasPorPPV } from '@/lib/pos/pecas-ppv'
import { diasDoRelatorio, normalizarTecnico, dataIso, type RelatorioTecnico } from '@/lib/pos/horas-tecnico'
import { parseValorMisto } from '@/lib/marketing/custos'
import { carregarDiretorio } from '@/lib/agenda/server'
import { normTexto } from '@/lib/agenda/regras'
import { SEM_TECNICO, type DiaRegistrado, type OSFaturada } from './painel'
import { CODIGOS_INTERNOS } from '@/lib/pos/omie-espelho'

const INTERNOS = new Set(CODIGOS_INTERNOS.map((c) => normTexto(c.codigo)))

const semZeros = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')
const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

type Rec = Record<string, unknown>

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 50000; de += 1000) {
    const { data, error } = await montar(de, de + 999)
    if (error) throw new Error(error.message)
    const l = (data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

/** Nome de exibição do técnico: o do cadastro do portal quando o nome casa (inclusive o "nome de técnico"). */
async function padronizador() {
  const dir = await carregarDiretorio()
  const porId = new Map(dir.pessoas.map((p) => [p.id, p.nome]))
  const tecnicos = dir.pessoas.filter((p) => p.tecnico).map((p) => p.nome)
  const padronizar = (nome: unknown): string => {
    const s = String(nome ?? '').trim()
    if (!s) return ''
    const id = dir.porNome.get(normTexto(s))
    return (id && porId.get(id)) || normalizarTecnico(s)
  }
  return { tecnicos, padronizar }
}

const COLS_OS = 'Id_Ordem, Ordem_Omie, Os_Cliente, Os_Tecnico, Os_Tecnico2, Servico_Interno, Status, Qtd_HR, Valor_HR, Qtd_KM, Valor_KM, Desconto_Hora, Desconto_KM, Valor_Total, ID_PPV, faturado_omie_em'
const COLS_REL = 'IdOs, Ordem_Servico, TecResp1, TecResp2, DataInicio, InicioHora, FinalHora, DataInicio2, InicioHora2, FinalHora2, DataInicio3, InicioHora3, FinaHora3, TotalHora'

export interface BasePainel {
  tecnicos: string[]
  dias: DiaRegistrado[]
  faturadas: OSFaturada[]
  /** horas registradas de TODAS as datas por OS (para repartir horas cobradas) */
  diasTodos: DiaRegistrado[]
}

/** Tudo que o painel precisa entre `de` e `ate` (YYYY-MM-DD). */
export async function carregarBase(de: string, ate: string): Promise<BasePainel> {
  const { tecnicos, padronizar } = await padronizador()
  const cfg = await getConfigPOS().catch(() => null) as { valor_hora?: number; valor_km?: number } | null
  const vhPadrao = num(cfg?.valor_hora) || 193, vkPadrao = num(cfg?.valor_km) || 3.6

  // 1) linhas faturadas do Omie (NOVA) nos meses do período → data do faturamento por nº da OS
  const meses: { mes: number; ano: number }[] = []
  for (let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7)); a * 100 + m <= Number(ate.slice(0, 4)) * 100 + Number(ate.slice(5, 7)); m === 12 ? (a++, m = 1) : m++) meses.push({ mes: m, ano: a })
  const itens: Rec[] = []
  for (const { mes, ano } of meses) {
    itens.push(...await paginar((x, y) => sb.from('os_servicos_itens').select('numero_os, data, tipo, qtde, valor_total, descricao, contrato').eq('conta_omie', 'NOVA').eq('mes', mes).eq('ano', ano).range(x, y)))
  }
  const omiePorNum = new Map<string, { data: string; horas: number; km: number; vh: number; vk: number; outros: number; contrato: string }>()
  for (const i of itens) {
    const d = dataIso(i.data)
    if (!d || d < de || d > ate) continue
    const n = semZeros(i.numero_os)
    const o = omiePorNum.get(n) || { data: d, horas: 0, km: 0, vh: 0, vk: 0, outros: 0, contrato: '' }
    if (i.contrato) o.contrato = String(i.contrato)
    if (i.tipo === 'HR') { o.horas += num(i.qtde); o.vh += num(i.valor_total) }
    else if (i.tipo === 'KM') { o.km += num(i.qtde); o.vk += num(i.valor_total) }
    else o.outros += num(i.valor_total)
    omiePorNum.set(n, o)
  }

  // 2) OS do portal: faturadas pelo portal no período + as que casam com o Omie
  const deIso = `${de}T00:00:00-03:00`, ateIso = `${ate}T23:59:59-03:00`
  const osMap = new Map<string, Rec>()
  for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).gte('faturado_omie_em', deIso).lte('faturado_omie_em', ateIso).range(x, y))) osMap.set(String(o.Id_Ordem), o)
  const nums = [...omiePorNum.keys()]
  for (let i = 0; i < nums.length; i += 200) {
    const pad = nums.slice(i, i + 200).flatMap((n) => [n.padStart(15, '0'), n])
    for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).in('Ordem_Omie', pad).range(x, y))) osMap.set(String(o.Id_Ordem), o)
  }

  // 3) relatórios do app: do período (horas) + das OS faturadas (pesos das horas cobradas)
  const relPeriodo = await paginar((x, y) => sb.from('Ordem_Servico_Tecnicos').select(COLS_REL).gte('DataInicio', somar(de, -20)).lte('DataInicio', ate).range(x, y))
  const idsFat = [...osMap.keys()]
  const relFat: Rec[] = []
  for (let i = 0; i < idsFat.length; i += 200) relFat.push(...await paginar((x, y) => sb.from('Ordem_Servico_Tecnicos').select(COLS_REL).in('Ordem_Servico', idsFat.slice(i, i + 200)).range(x, y)))
  const relatorios = new Map<string, Rec>()
  for (const r of [...relPeriodo, ...relFat]) relatorios.set(String(r.IdOs), r)
  // OS dos relatórios que ainda não vieram (para saber se é interna)
  const faltam = [...new Set([...relatorios.values()].map((r) => String(r.Ordem_Servico || '')).filter((id) => id && !osMap.has(id)))]
  for (let i = 0; i < faltam.length; i += 200) for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).in('Id_Ordem', faltam.slice(i, i + 200)).range(x, y))) osMap.set(String(o.Id_Ordem), o)

  const diasTodos: DiaRegistrado[] = []
  for (const r of relatorios.values()) {
    const os = osMap.get(String(r.Ordem_Servico || ''))
    const interna = !!os?.Servico_Interno
    const base = diasDoRelatorio(r as unknown as RelatorioTecnico)
    for (const t of [r.TecResp1, r.TecResp2]) {
      const tec = padronizar(t)
      if (!tec) continue
      for (const d of base) diasTodos.push({ os: d.os, data: d.data, tecnico: tec, horas: d.horas, interna })
    }
  }

  // 4) peças e custo de terceiros das OS faturadas
  const osFat = [...osMap.values()].filter((o) => {
    if (o.Servico_Interno || /cancel/i.test(String(o.Status || ''))) return false
    const n = semZeros(o.Ordem_Omie)
    const d = o.faturado_omie_em ? diaSP(String(o.faturado_omie_em)) : omiePorNum.get(n)?.data
    return !!d && d >= de && d <= ate
  })
  const ppvs = osFat.flatMap((o) => String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean))
  const pecas = await valorPecasPorPPV(ppvs)
  const custos = new Map<string, Record<string, number>>()
  const ids = osFat.map((o) => String(o.Id_Ordem))
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Requisicao').select('ordem_servico, valor_despeza, tipo, status').in('ordem_servico', ids.slice(i, i + 200))
    for (const r of (data || []) as Rec[]) {
      if (/lixeira|cancel/i.test(String(r.status || ''))) continue
      const v = parseValorMisto(r.valor_despeza)
      if (!v) continue
      const m = custos.get(String(r.ordem_servico)) || {}
      const tipo = String(r.tipo || 'Outros')
      m[tipo] = (m[tipo] || 0) + v
      custos.set(String(r.ordem_servico), m)
    }
  }

  const faturadas: OSFaturada[] = []
  // toda OS do portal (inclusive interna e cancelada) — o que sobra no Omie é só de lá
  const numsDoPortal = new Set([...osMap.values()].map((o) => semZeros(o.Ordem_Omie)).filter(Boolean))
  for (const o of osFat) {
    const n = semZeros(o.Ordem_Omie)
    const vh = num(o.Valor_HR) || vhPadrao, vk = num(o.Valor_KM) || vkPadrao
    const servico = Math.max(0, num(o.Qtd_HR) * vh - num(o.Desconto_Hora))
    const kmValor = Math.max(0, num(o.Qtd_KM) * vk - num(o.Desconto_KM))
    const vPecas = String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean).reduce((s, p) => s + (pecas.get(p) || 0), 0)
    // Valor_Total gravado pode estar velho (OS-0670: R$ 2.660 sem o PPV-0412 de R$ 7.388): o bruto é a
    // soma das partes, e o que o total gravado tiver A MAIS (requisições cobradas, extras) entra em "outros"
    const partes = servico + kmValor + vPecas
    const bruto = Math.max(partes, num(o.Valor_Total))
    const cp = custos.get(String(o.Id_Ordem)) || {}
    faturadas.push({
      os: String(o.Id_Ordem), numeroOmie: n || null, cliente: String(o.Os_Cliente || ''),
      data: o.faturado_omie_em ? diaSP(String(o.faturado_omie_em)) : omiePorNum.get(n)!.data,
      em: o.faturado_omie_em ? String(o.faturado_omie_em) : null,
      tecnicos: [...new Set([o.Os_Tecnico, o.Os_Tecnico2].map(padronizar).filter(Boolean))],
      horasCobradas: num(o.Qtd_HR), km: num(o.Qtd_KM), servico, kmValor, pecas: vPecas,
      outros: bruto - servico - kmValor - vPecas, bruto,
      custo: Object.values(cp).reduce((s, v) => s + v, 0), custoPorTipo: cp,
    })
  }
  // OS que só existe no Omie (sem OS no portal)
  for (const [n, o] of omiePorNum) {
    if (numsDoPortal.has(n)) continue
    // só serviço do pós-vendas (tem hora ou km) e que não seja contrato interno ("-pgo" = montadora paga, entra)
    if (!(o.horas > 0 || o.km > 0)) continue
    if (INTERNOS.has(normTexto(o.contrato)) && !/-pgo$/i.test(o.contrato)) continue
    faturadas.push({
      os: `OMIE ${n}`, numeroOmie: n, cliente: '', data: o.data, em: null, tecnicos: [],
      horasCobradas: o.horas, km: o.km, servico: o.vh, kmValor: o.vk, pecas: 0, outros: o.outros,
      bruto: o.vh + o.vk + o.outros, custo: 0,
    })
  }

  return { tecnicos, faturadas, diasTodos, dias: diasTodos.filter((d) => d.data >= de && d.data <= ate) }
}

function somar(dia: string, n: number) { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export { SEM_TECNICO }
