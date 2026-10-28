// Horas e km fantasmas dos mecânicos (José, 20/10/2026) — SÓ SERVIDOR.
// Cruza, por técnico e por dia: o que ele apontou no relatório das OS, o que foi cobrado na OS, a previsão do
// tempário (posvendas_os_previsao) e o carro (frota_dias: km e tempo ligado). Mostra para onde vão as horas e o km:
//  - horas acima do tempário (fantasmas) · horas apontadas e não cobradas · carro ligado sem OS;
//  - km do carro × km da OS (relatório e cobrado) · dias com carro rodando e nenhuma OS.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { paginar } from '@/lib/db/paginar'
import { diasDoRelatorio, parseHoras, normalizarTecnico, type RelatorioTecnico } from '@/lib/pos/horas-tecnico'
import { padronizadorOcorrencias } from './ocorrencias-server'
import { carregarPctComissao } from './gastos-server'
import { GRUPOS } from './painel'
import { fichaTecnico } from './ficha-server'
import { previsoesGuardadas, type AlertaPrevisao } from './previsao-os-server'
import type { SituacaoPrevisao } from './tempario'
import { comCache } from './cache'

type Rec = Record<string, unknown>
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface OSFantasma {
  os: string; cliente: string; dias: string[]; horasRel: number; horasCobradas: number; previstoMin: number | null
  situacao: SituacaoPrevisao | 'sem_analise'; alertas: AlertaPrevisao[]; kmRel: number; kmCobrado: number; kmCarro: number; status: string
}
export interface DiaFantasma { data: string; horasRel: number; os: string[]; kmCarro: number; ligadoH: number; inicio: string | null; fim: string | null; kmRel: number }
export interface TecnicoFantasma {
  tecnico: string; placas: string[]
  totais: {
    ligadoH: number; horasRel: number; horasCobradas: number; horasPrevistas: number; horasRelAnalisadas: number
    acimaTempario: number; naoCobradas: number; ligadoSemOS: number
    kmCarro: number; kmRel: number; kmCobrado: number; kmSemOS: number; kmFantasma: number
    diasCarroSemOS: number; osComAlerta: number; osSemAnalise: number
  }
  dias: DiaFantasma[]; os: OSFantasma[]
}
export interface Fantasmas { mes: string; tecnicos: TecnicoFantasma[]; semTabela: boolean; osSemAnalise: string[]; geradoEm: string }

const COLS_REL = 'IdOs, Status, Ordem_Servico, TecResp1, TecResp2, DataInicio, InicioHora, FinalHora, DataInicio2, InicioHora2, FinalHora2, DataInicio3, InicioHora3, FinaHora3, TotalHora, TotalKm'

export async function fantasmasDoMes(mes: string, forcar = false): Promise<Fantasmas> {
  const r = await comCache(`fantasmas:v1:${mes}`, 10 * 60_000, () => montar(mes), forcar)
  return r.dados
}

async function montar(mes: string): Promise<Fantasmas> {
  const de = `${mes}-01`
  const ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const antes = new Date(Date.parse(de) - 20 * 86400_000).toISOString().slice(0, 10)
  const { tecnicos: todos, padronizar } = await padronizadorOcorrencias()
  const pct = await carregarPctComissao(padronizar, new Set(todos)).catch(() => ({} as Record<string, number>))
  const tecnicos = Object.keys(pct).filter((t) => !GRUPOS[t]).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // relatórios que têm dia no mês (um por OS: o enviado, senão o mais novo)
  const rels = (await paginar((x, y) => sb.from('Ordem_Servico_Tecnicos').select(COLS_REL).gte('DataInicio', antes).lte('DataInicio', ate).order('IdOs').range(x, y))).data as Rec[]
  const porOS = new Map<string, Rec>()
  for (const rr of rels.sort((a, b) => num(b.IdOs) - num(a.IdOs))) {
    const k = String(rr.Ordem_Servico || ''); if (!k) continue
    const ja = porOS.get(k)
    if (!ja || (String(ja.Status).toLowerCase() !== 'enviado' && String(rr.Status).toLowerCase() === 'enviado')) porOS.set(k, rr)
  }
  const ids = [...porOS.keys()]
  const osInfo = new Map<string, Rec>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Qtd_HR, Qtd_KM, Status').in('Id_Ordem', ids.slice(i, i + 200))
    for (const o of (data || []) as Rec[]) osInfo.set(String(o.Id_Ordem), o)
  }
  let semTabela = false
  const prev = await previsoesGuardadas(ids).catch(() => { semTabela = true; return new Map() })

  // carros: os que a ficha considera em uso pelo técnico no mês
  const placasDe = new Map<string, string[]>()
  for (const t of tecnicos) {
    try {
      const f = (await fichaTecnico(t, mes)) as { frota?: { vinculo?: { emUso?: string[]; cadastro?: string[] } } }
      const v = f.frota?.vinculo
      placasDe.set(t, (v?.emUso?.length ? v.emUso : v?.cadastro || []).map(placaLimpa))
    } catch { placasDe.set(t, []) }
  }
  const todasPlacas = [...new Set([...placasDe.values()].flat())]
  const frota = todasPlacas.length ? (await paginar((x, y) => sb.from('frota_dias').select('placa, data, km_total, tempo_ligado_min, primeira_partida, ultimo_desligamento').gte('data', de).lte('data', ate).order('data').order('placa').range(x, y))).data as Rec[] : []

  const saida: TecnicoFantasma[] = []
  const semAnalise = new Set<string>()
  for (const t of tecnicos) {
    const placas = placasDe.get(t) || []
    // dias apontados pelo técnico (ele é TecResp1 ou TecResp2)
    const dias = new Map<string, DiaFantasma>()
    const osDele = new Map<string, { horas: number; dias: Set<string> }>()
    for (const [osId, rel] of porOS) {
      const tecs = [rel.TecResp1, rel.TecResp2].map((x) => padronizar(normalizarTecnico(x)))
      if (!tecs.includes(t)) continue
      for (const d of diasDoRelatorio(rel as unknown as RelatorioTecnico)) {
        if (d.data < de || d.data > ate) continue
        const dd = dias.get(d.data) || { data: d.data, horasRel: 0, os: [], kmCarro: 0, ligadoH: 0, inicio: null, fim: null, kmRel: 0 }
        dd.horasRel = r2(dd.horasRel + d.horas); if (!dd.os.includes(osId)) dd.os.push(osId)
        dias.set(d.data, dd)
        const o = osDele.get(osId) || { horas: 0, dias: new Set<string>() }
        o.horas += d.horas; o.dias.add(d.data); osDele.set(osId, o)
      }
    }
    // carro de cada dia do mês (inclusive dias sem OS)
    for (const p of placas) for (const f of frota) {
      if (placaLimpa(f.placa) !== p) continue
      const dd = dias.get(String(f.data)) || { data: String(f.data), horasRel: 0, os: [], kmCarro: 0, ligadoH: 0, inicio: null, fim: null, kmRel: 0 }
      dd.kmCarro = r1(dd.kmCarro + num(f.km_total)); dd.ligadoH = r2(dd.ligadoH + num(f.tempo_ligado_min) / 60)
      dd.inicio = dd.inicio || (f.primeira_partida as string) || null; dd.fim = (f.ultimo_desligamento as string) || dd.fim
      dias.set(String(f.data), dd)
    }
    // km do relatório: o TotalKm da OS repartido pelos dias dela
    const osList: OSFantasma[] = []
    for (const [osId, o] of osDele) {
      const rel = porOS.get(osId)!, info = osInfo.get(osId) || {}
      const kmRel = num(rel.TotalKm)
      const ds = [...o.dias].sort()
      for (const d of ds) { const dd = dias.get(d)!; dd.kmRel = r1(dd.kmRel + kmRel / ds.length) }
      // km do carro "dessa OS": o do dia, dividido entre as OS daquele dia
      const kmCarro = ds.reduce((s, d) => { const dd = dias.get(d)!; return s + dd.kmCarro / Math.max(1, dd.os.length) }, 0)
      const pv = prev.get(osId)
      if (!pv) semAnalise.add(osId)
      // horas do relatório ficam com cada técnico (o app lança o mesmo dia para os dois); a OS inteira pro tempário
      osList.push({
        os: osId, cliente: String(info.Os_Cliente || ''), dias: ds, horasRel: r2(o.horas), horasCobradas: r2(num(info.Qtd_HR)),
        previstoMin: pv?.minutosPrevistos ?? null, situacao: pv ? pv.situacao : 'sem_analise', alertas: pv?.alertas || [],
        kmRel: r1(kmRel), kmCobrado: r1(num(info.Qtd_KM)), kmCarro: r1(kmCarro), status: String(info.Status || ''),
      })
    }
    osList.sort((a, b) => (b.dias[0] || '').localeCompare(a.dias[0] || ''))
    const ds = [...dias.values()].sort((a, b) => b.data.localeCompare(a.data))
    const analisadas = osList.filter((o) => o.previstoMin != null)
    const tot = {
      ligadoH: r1(ds.reduce((s, d) => s + d.ligadoH, 0)),
      horasRel: r1(osList.reduce((s, o) => s + o.horasRel, 0)),
      horasCobradas: r1(osList.reduce((s, o) => s + o.horasCobradas, 0)),
      horasPrevistas: r1(analisadas.reduce((s, o) => s + (o.previstoMin || 0) / 60, 0)),
      horasRelAnalisadas: r1(analisadas.reduce((s, o) => s + o.horasRel, 0)),
      acimaTempario: r1(analisadas.reduce((s, o) => s + Math.max(0, o.horasRel - (o.previstoMin || 0) / 60), 0)),
      naoCobradas: r1(osList.reduce((s, o) => s + Math.max(0, o.horasRel - o.horasCobradas), 0)),
      ligadoSemOS: r1(ds.filter((d) => !d.os.length).reduce((s, d) => s + d.ligadoH, 0)),
      kmCarro: Math.round(ds.reduce((s, d) => s + d.kmCarro, 0)),
      kmRel: Math.round(osList.reduce((s, o) => s + o.kmRel, 0)),
      kmCobrado: Math.round(osList.reduce((s, o) => s + o.kmCobrado, 0)),
      kmSemOS: Math.round(ds.filter((d) => !d.os.length).reduce((s, d) => s + d.kmCarro, 0)),
      kmFantasma: 0,
      diasCarroSemOS: ds.filter((d) => !d.os.length && d.kmCarro > 5).length,
      osComAlerta: osList.filter((o) => o.situacao === 'muito_acima' || o.situacao === 'acima' || o.situacao === 'rapido').length,
      osSemAnalise: osList.filter((o) => o.situacao === 'sem_analise').length,
    }
    tot.kmFantasma = Math.max(0, tot.kmCarro - tot.kmRel)
    saida.push({ tecnico: t, placas, totais: tot, dias: ds, os: osList })
  }
  return { mes, tecnicos: saida, semTabela, osSemAnalise: [...semAnalise], geradoEm: new Date().toISOString() }
}
