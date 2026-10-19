// Carreira (divisões Ferro → Diamante) e comissão dos técnicos, para a aba Ocorrências
// (José, 17/10/2026). Regras puras em ./carreira.ts e ./comissao.ts.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { padronizadorOcorrencias, ocorrenciasEntre } from './ocorrencias-server'
import { carregarBase } from './painel-server'
import { carregarPendencias } from './pendencias-server'
import { comissoesRH } from './rh-server'
import { casarNome } from './ocorrencias-painel'
import { carreiraDe, pesoOcorrencia, type CarreiraTecnico } from './carreira'
import { calcularComissoes, previsaoPagamento, projetarMes, type ComissaoMes } from './comissao'
import { comCache } from './cache'
import { carregarDiretorio } from '@/lib/agenda/server'

type Rec = Record<string, unknown>
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const mesAntes = (m: string) => { const [a, mm] = m.split('-').map(Number); return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}` }
const fimDoMes = (m: string) => { const [a, mm] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, '0')}` }

export interface ComissaoTecnico {
  tecnico: string
  pct: number
  atual: ComissaoMes & { projecao: number; rh: { valor: number; status: string } | null; pagamento: string }
  anterior: ComissaoMes & { rh: { valor: number; status: string } | null; pagamento: string }
}

export async function carreiraEComissoes(forcar = false): Promise<{ mesAtual: string; carreira: CarreiraTecnico[]; comissoes: ComissaoTecnico[]; inicioSistema: string; fotos: Record<string, string> }> {
  const r = await comCache('carreira:v2', 10 * 60_000, gerar, forcar)
  return r.dados
}

async function gerar() {
  const hoje = hojeSP(), mesAtual = hoje.slice(0, 7), mesAnt = mesAntes(mesAtual)
  const { tecnicos, padronizar } = await padronizadorOcorrencias()

  // ---- carreira: todas as ocorrências desde a primeira do sistema
  const primeira = await sb.from('tecnico_ocorrencias').select('data').order('data', { ascending: true }).limit(1)
  const inicioSistema = String(((primeira.data || []) as Rec[])[0]?.data || hoje).slice(0, 7)
  const ehTec = new Set(tecnicos)
  const [ocsTodas, equipe] = await Promise.all([
    ocorrenciasEntre(`${inicioSistema}-01`, hoje, padronizar),
    sb.from('posvendas_equipe').select('pessoa, admissao, demissao'),
  ])
  const ocs = ocsTodas.filter((o) => ehTec.has(o.tecnico))
  const eq = new Map(((equipe.data || []) as Rec[]).map((e) => [String(e.pessoa), { admissao: (e.admissao as string) || null, demissao: (e.demissao as string) || null }]))
  const porPessoa = new Map<string, Record<string, { pontos: number; qtd: number }>>()
  for (const o of ocs) {
    const m = (porPessoa.get(o.tecnico) || {}); porPessoa.set(o.tecnico, m)
    const x = (m[o.data.slice(0, 7)] ||= { pontos: 0, qtd: 0 })
    x.pontos += pesoOcorrencia(o); if (o.vale) x.qtd++
  }
  const carreira = tecnicos
    .filter((t) => { const e = eq.get(t); return !e?.demissao || e.demissao >= mesAtual })
    .map((t) => {
      const adm = eq.get(t)?.admissao
      const inicio = adm && adm > inicioSistema ? adm : inicioSistema
      return carreiraDe(t, inicio, mesAtual, porPessoa.get(t) || {})
    })
    .sort((a, b) => b.nivel - a.nivel || b.seFecharAssim - a.seFecharAssim || a.tecnico.localeCompare(b.tecnico, 'pt-BR'))

  // ---- comissão: % de cada técnico (config do painel Omie) + OS do mês passado e deste mês
  const cfg = await sb.from('config_vendedores_relatorio').select('nome, cargo, comissao')
  const pct: Record<string, number> = {}
  for (const c of (cfg.data || []) as Rec[]) {
    const v = Number(String(c.comissao ?? '').replace(',', '.')) || 0
    if (v <= 0 || String(c.cargo || '').toUpperCase() === 'VENDEDOR') continue
    const p = padronizar(c.nome)
    const nome = tecnicos.includes(p) ? p : casarNome(String(c.nome), tecnicos)
    if (nome) pct[nome] = v
  }
  const base = await carregarBase(`${mesAnt}-01`, hoje)
  const pend = await carregarPendencias(new Set(base.faturadas.map((o) => o.os)), padronizar).catch(() => [])
  const calcAtual = calcularComissoes(`${mesAtual}-01`, hoje, pct, base.faturadas, base.internasFechadas, pend)
  const calcAnt = calcularComissoes(`${mesAnt}-01`, fimDoMes(mesAnt), pct, base.faturadas, base.internasFechadas)
  const rh = await comissoesRH([mesAnt, mesAtual], padronizar, tecnicos).catch(() => ({} as Awaited<ReturnType<typeof comissoesRH>>))
  const vazio: ComissaoMes = { faturadas: 0, internas: 0, total: 0, aguardando: 0, qtdOS: 0 }
  const comissoes: ComissaoTecnico[] = Object.keys(pct)
    .filter((t) => { const e = eq.get(t); return !e?.demissao || e.demissao >= mesAnt })
    .map((t) => {
      const a = calcAtual[t] || vazio, b = calcAnt[t] || vazio
      return {
        tecnico: t, pct: pct[t],
        atual: { ...a, projecao: projetarMes(a.total, mesAtual, hoje), rh: rh[t]?.[mesAtual] || null, pagamento: previsaoPagamento(mesAtual) },
        anterior: { ...b, rh: rh[t]?.[mesAnt] || null, pagamento: previsaoPagamento(mesAnt) },
      }
    })
    .sort((x, y) => y.atual.projecao - x.atual.projecao)
  // fotos do portal (financeiro_usu.avatar_url) pelo nome do técnico
  const fotos: Record<string, string> = {}
  try {
    const dir = await carregarDiretorio()
    for (const p of dir.pessoas) if (p.avatar_url && p.tecnico) fotos[tecnicos.includes(p.nome) ? p.nome : padronizar(p.nome)] = p.avatar_url
  } catch { /* sem fotos: iniciais */ }
  return { mesAtual, carreira, comissoes, inicioSistema, fotos }
}
