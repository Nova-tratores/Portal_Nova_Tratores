// Carreira (divisões Ferro → Diamante) e comissão dos técnicos, para a aba Ocorrências
// (José, 17/10/2026). Regras puras em ./carreira.ts e ./comissao.ts.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { padronizadorOcorrencias, ocorrenciasEntre } from './ocorrencias-server'
import { carregarBase } from './painel-server'
import { carregarPendencias } from './pendencias-server'
import { comissoesRH } from './rh-server'
import { casarNome } from './ocorrencias-painel'
import { carreiraDe, chaveOS, contarOSLimpas, pesoOcorrencia, type CarreiraTecnico, type MesEntrada } from './carreira'
import { previsaoPagamento, projetarMes, type ComissaoMes } from './comissao'
import { comissaoDoTecnico } from './comissao-detalhe'
import { ajustesDeComissao, pctsDasOS } from './comissao-server'
import { lerRegrasComissao } from './regras-comissao-server'
import { comCache } from './cache'
import { carregarDiretorio } from '@/lib/agenda/server'

type Rec = Record<string, unknown>
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const mesAntes = (m: string) => { const [a, mm] = m.split('-').map(Number); return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}` }

export interface ComissaoTecnico {
  tecnico: string
  pct: number
  atual: ComissaoMes & { projecao: number; rh: { valor: number; status: string } | null; pagamento: string }
  anterior: ComissaoMes & { rh: { valor: number; status: string } | null; pagamento: string }
}

export async function carreiraEComissoes(forcar = false): Promise<{ mesAtual: string; carreira: CarreiraTecnico[]; comissoes: ComissaoTecnico[]; inicioSistema: string; fotos: Record<string, string>; pontosMes: Record<string, number> }> {
  const r = await comCache('carreira:v5', 10 * 60_000, gerar, forcar)
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
  const porPessoa = new Map<string, Record<string, MesEntrada>>()
  const mesDe = (t: string, mes: string) => { const m = (porPessoa.get(t) || {}); porPessoa.set(t, m); return (m[mes] ||= { pontos: 0, qtd: 0, osLimpas: 0 }) }
  for (const o of ocs) {
    const x = mesDe(o.tecnico, o.data.slice(0, 7))
    x.pontos += pesoOcorrencia(o); if (o.vale) x.qtd++
  }
  // OS fechadas sem problema dão pontos (José, 22/10/2026): sem ocorrência VALENDO ligada a ela (de qualquer
  // técnico) e sem pendência da Mahindra. Fechada = faturada (inclui garantia) ou interna fechada.
  const comProblema = new Set<string>()
  for (const o of ocsTodas) if (o.vale && o.idOrdem) for (const id of String(o.idOrdem).split(/[,;\s]+/)) if (chaveOS(id)) comProblema.add(chaveOS(id))
  const pm = await sb.from('Ordem_Servico').select('Id_Ordem, Ordem_Omie').not('pendencia_mahindra', 'is', null).limit(5000)
  for (const r of (pm.data || []) as Rec[]) { if (chaveOS(r.Id_Ordem)) comProblema.add(chaveOS(r.Id_Ordem)); if (chaveOS(r.Ordem_Omie)) comProblema.add(chaveOS(r.Ordem_Omie)) }
  // OS que gerou RESSERVIÇO também não é limpa (sql/pos-resservico.sql; sem a coluna, segue sem isso)
  const rs = await sb.from('Ordem_Servico').select('Id_Ordem, Ordem_Omie').not('resservico', 'is', null).limit(5000)
  for (const r of (rs.error ? [] : (rs.data || [])) as Rec[]) { if (chaveOS(r.Id_Ordem)) comProblema.add(chaveOS(r.Id_Ordem)); if (chaveOS(r.Ordem_Omie)) comProblema.add(chaveOS(r.Ordem_Omie)) }
  const baseCarreira = await carregarBase(`${inicioSistema}-01`, hoje)
  const limpas = contarOSLimpas([...baseCarreira.faturadas, ...(baseCarreira.internasFechadas || [])], comProblema)
  for (const [t, meses] of Object.entries(limpas)) for (const [mes, q] of Object.entries(meses)) mesDe(t, mes).osLimpas = q
  const carreira = tecnicos
    .filter((t) => { const e = eq.get(t); return !e?.demissao || e.demissao >= mesAtual })
    .map((t) => {
      const adm = eq.get(t)?.admissao
      const inicio = adm && adm > inicioSistema ? adm : inicioSistema
      return carreiraDe(t, inicio, mesAtual, porPessoa.get(t) || {})
    })
    .sort((a, b) => b.saldoAgora - a.saldoAgora || a.tecnico.localeCompare(b.tecnico, 'pt-BR'))

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
  const base = { ...baseCarreira, faturadas: baseCarreira.faturadas.filter((o) => o.data >= `${mesAnt}-01`), internasFechadas: (baseCarreira.internasFechadas || []).filter((o) => o.data >= `${mesAnt}-01`) }
  const pend = await carregarPendencias(new Set(base.faturadas.map((o) => o.os)), padronizar).catch(() => [])
  // mesma conta da ficha do técnico (comissao-detalhe.ts): técnicos do Omie + ajustes manuais por OS —
  // bateu com o RH até o centavo em 10 de 12 meses×técnico (jul–set/2026)
  const ajustes = await ajustesDeComissao([...new Set([...base.faturadas, ...base.internasFechadas].flatMap((o) => [o.numeroOmie || o.os, o.os]).filter(Boolean))] as string[]).catch(() => new Map())
  const regras = await lerRegrasComissao().catch(() => undefined)
  const pctPorOS = await pctsDasOS([...new Set([...base.faturadas, ...base.internasFechadas, ...pend].map((o) => o.os))]).catch(() => new Map())
  const calc = (mes: string) => Object.fromEntries(Object.keys(pct).map((t) => {
    const c = comissaoDoTecnico({ tecnico: t, mes, hoje, pct: pct[t], faturadas: base.faturadas, internas: base.internasFechadas, pendencias: mes === mesAtual ? pend : [], ajustes, regras, pctPorOS })
    return [t, { faturadas: c.faturadas, internas: c.internas, total: c.total, aguardando: c.aguardando, qtdOS: c.qtdOS } as ComissaoMes]
  }))
  const calcAtual = calc(mesAtual), calcAnt = calc(mesAnt)
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
  // pontos descontados no mês (sem peso), como os escudos de 100 pts das Ocorrências
  const pontosMes: Record<string, number> = {}
  for (const o of ocs) if (o.vale && o.data.startsWith(mesAtual)) pontosMes[o.tecnico] = (pontosMes[o.tecnico] || 0) + o.pontos
  return { mesAtual, carreira, comissoes, inicioSistema, fotos, pontosMes }
}
