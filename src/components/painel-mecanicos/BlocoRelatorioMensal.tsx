'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Car, Clock, MapPin, Route, Timer, CalendarDays, Gauge, Users, Target, TrendingUp } from 'lucide-react'

interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }

interface ViagemGPS {
  tecnico_nome: string; data: string; placa: string
  saida_loja: string | null; chegada_cliente: string | null
  saida_cliente: string | null; retorno_loja: string | null
  eventos: any[]; posicoes_total: number; km_total: number
}

interface OSData {
  Id_Ordem: string; Os_Cliente: string; Os_Tecnico: string; Os_Tecnico2: string
  Qtd_HR: number | string | null; Qtd_KM: number | string | null
  Previsao_Execucao: string | null; Data_Fim_Servico: string | null
  Dias_Execucao: string | null; Status: string; Tipo_Servico: string
}

interface AgendaRow {
  id: number; data: string; tecnico_nome: string; id_ordem: string | null
  cliente: string; status: string; qtd_horas: number
}

function normNome(a: string, b: string): boolean {
  if (!a || !b) return false
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(p => p.length > 2)
  const pa = norm(a), pb = norm(b)
  if (!pa.length || !pb.length || pa[0] !== pb[0]) return false
  if (pa.length === 1 || pb.length === 1) return true
  const s = new Set(pa.slice(1)); return pb.slice(1).some(p => s.has(p))
}

function diffMin(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  try { return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) } catch { return 0 }
}

function fmtMin(min: number): string {
  if (min <= 0) return '-'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
}

function fmtHora(iso: string | null): string {
  if (!iso) return '-'
  try { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` } catch { return '-' }
}

function calcGPS(viagem: ViagemGPS) {
  const eventos = viagem.eventos || []
  let tempoDirigindo = 0, tempoCliente = 0

  let ultimaSaida: string | null = null
  for (const ev of eventos) {
    if (ev.tipo === 'saida_loja' || ev.tipo === 'saida_cliente') {
      ultimaSaida = ev.horario
    } else if ((ev.tipo === 'chegada_cliente' || ev.tipo === 'retorno_loja') && ultimaSaida) {
      tempoDirigindo += diffMin(ultimaSaida, ev.horario)
      ultimaSaida = null
    }
  }

  let ultimaChegada: string | null = null
  for (const ev of eventos) {
    if (ev.tipo === 'chegada_cliente') {
      ultimaChegada = ev.horario
    } else if (ev.tipo === 'saida_cliente' && ultimaChegada) {
      tempoCliente += diffMin(ultimaChegada, ev.horario)
      ultimaChegada = null
    }
  }

  return { tempoDirigindo, tempoCliente, km: viagem.km_total || 0 }
}

function calcOS(ordens: OSData[]) {
  let horasTotal = 0, kmTotal = 0
  for (const o of ordens) {
    horasTotal += parseFloat(String(o.Qtd_HR || 0)) || 0
    kmTotal += parseFloat(String(o.Qtd_KM || 0)) || 0
  }
  return { horas: horasTotal, km: kmTotal }
}

type ViewMode = 'individual' | 'todos'

export default function BlocoRelatorioMensal({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [tecnicoSel, setTecnicoSel] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('todos')
  const [gpsData, setGpsData] = useState<ViagemGPS[]>([])
  const [osData, setOsData] = useState<OSData[]>([])
  const [allGpsData, setAllGpsData] = useState<ViagemGPS[]>([])
  const [allOsData, setAllOsData] = useState<OSData[]>([])
  const [agendaData, setAgendaData] = useState<AgendaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const tecs = useMemo(() => tecnicos.filter(t => t.mecanico_role === 'tecnico'), [tecnicos])
  useEffect(() => { if (tecs.length > 0 && !tecnicoSel) setTecnicoSel(tecs[0].tecnico_nome) }, [tecs, tecnicoSel])

  const [ano, mesNum] = useMemo(() => mes.split('-').map(Number), [mes])
  const primeiroDia = `${mes}-01`
  const ultimoDia = `${ano}-${String(mesNum).padStart(2, '0')}-${new Date(ano, mesNum, 0).getDate()}`
  const hoje = new Date().toISOString().split('T')[0]

  // Carregar dados do tecnico individual
  const carregarIndividual = useCallback(async () => {
    if (!tecnicoSel || !mes) return
    setLoading(true)
    const [{ data: gps }, { data: ords }] = await Promise.all([
      supabase.from('GPS_Viagens').select('*').eq('tecnico_nome', tecnicoSel).gte('data', primeiroDia).lte('data', ultimoDia).order('data'),
      supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Qtd_HR, Qtd_KM, Previsao_Execucao, Data_Fim_Servico, Dias_Execucao, Status, Tipo_Servico')
        .or(`Os_Tecnico.ilike.%${tecnicoSel.split(' ')[0]}%,Os_Tecnico2.ilike.%${tecnicoSel.split(' ')[0]}%`)
        .not('Status', 'eq', 'Cancelada')
    ])
    setGpsData((gps || []) as ViagemGPS[])
    const orsFiltradas = ((ords || []) as OSData[]).filter(o => {
      if (!(normNome(tecnicoSel, o.Os_Tecnico) || normNome(tecnicoSel, o.Os_Tecnico2))) return false
      if (o.Dias_Execucao) return o.Dias_Execucao.split(',').some(d => d.trim().startsWith(mes))
      if (o.Previsao_Execucao) return o.Previsao_Execucao.startsWith(mes)
      return false
    })
    setOsData(orsFiltradas)
    setLoading(false)
    setExpandedDays(new Set())
  }, [tecnicoSel, mes, primeiroDia, ultimoDia])

  // Carregar dados de TODOS os tecnicos
  const carregarTodos = useCallback(async () => {
    if (!mes) return
    setLoading(true)
    const [{ data: gps }, { data: ords }, { data: agenda }] = await Promise.all([
      supabase.from('GPS_Viagens').select('*').gte('data', primeiroDia).lte('data', ultimoDia).order('data'),
      supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Qtd_HR, Qtd_KM, Previsao_Execucao, Data_Fim_Servico, Dias_Execucao, Status, Tipo_Servico')
        .not('Status', 'eq', 'Cancelada'),
      supabase.from('agenda_visao').select('id, data, tecnico_nome, id_ordem, cliente, status, qtd_horas')
        .gte('data', primeiroDia).lte('data', ultimoDia)
    ])
    setAllGpsData((gps || []) as ViagemGPS[])
    setAllOsData(((ords || []) as OSData[]).filter(o => {
      if (o.Dias_Execucao) return o.Dias_Execucao.split(',').some(d => d.trim().startsWith(mes))
      if (o.Previsao_Execucao) return o.Previsao_Execucao.startsWith(mes)
      return false
    }))
    setAgendaData((agenda || []) as AgendaRow[])
    setLoading(false)
  }, [mes, primeiroDia, ultimoDia])

  useEffect(() => {
    if (viewMode === 'individual') carregarIndividual()
    else carregarTodos()
  }, [viewMode, carregarIndividual, carregarTodos])

  const diasDoMes = useMemo(() => {
    const totalDias = new Date(ano, mesNum, 0).getDate()
    const dias: string[] = []
    for (let d = 1; d <= totalDias; d++) dias.push(`${mes}-${String(d).padStart(2, '0')}`)
    return dias
  }, [mes, ano, mesNum])

  // === INDIVIDUAL VIEW DATA ===
  const gpsPorDia = useMemo(() => {
    const m: Record<string, ViagemGPS> = {}
    gpsData.forEach(g => { m[g.data] = g })
    return m
  }, [gpsData])

  const osPorDia = useMemo(() => {
    const m: Record<string, OSData[]> = {}
    osData.forEach(o => {
      if (o.Dias_Execucao) {
        o.Dias_Execucao.split(',').forEach(d => {
          const dia = d.trim()
          if (dia.startsWith(mes)) { if (!m[dia]) m[dia] = []; m[dia].push(o) }
        })
      } else if (o.Previsao_Execucao?.startsWith(mes)) {
        const dia = o.Previsao_Execucao
        if (!m[dia]) m[dia] = []; m[dia].push(o)
      }
    })
    return m
  }, [osData, mes])

  const totais = useMemo(() => {
    let gpsDirigindo = 0, gpsCliente = 0, gpsKm = 0, osHoras = 0, osKm = 0, diasTrabalhados = 0
    for (const dia of diasDoMes) {
      const gps = gpsPorDia[dia]; const ords = osPorDia[dia] || []
      if (gps || ords.length > 0) diasTrabalhados++
      if (gps) { const c = calcGPS(gps); gpsDirigindo += c.tempoDirigindo; gpsCliente += c.tempoCliente; gpsKm += c.km }
      if (ords.length > 0) { const c = calcOS(ords); osHoras += c.horas; osKm += c.km }
    }
    return { gpsDirigindo, gpsCliente, gpsKm, osHoras, osKm, diasTrabalhados }
  }, [diasDoMes, gpsPorDia, osPorDia])

  // === ALL TECHNICIANS VIEW DATA ===
  const todosTecData = useMemo(() => {
    if (viewMode !== 'todos') return []
    return tecs.map(tec => {
      const tecGps = allGpsData.filter(g => normNome(tec.tecnico_nome, g.tecnico_nome))
      const tecOs = allOsData.filter(o => normNome(tec.tecnico_nome, o.Os_Tecnico) || normNome(tec.tecnico_nome, o.Os_Tecnico2))
      const tecAgenda = agendaData.filter(a => a.tecnico_nome === tec.tecnico_nome)

      let gpsKm = 0, gpsDirigindo = 0, gpsCliente = 0, diasGPS = 0
      let osHoras = 0, osKm = 0, osConcluidas = 0, osTotal = 0
      let osFuturas = 0, horasFuturas = 0, kmFuturos = 0

      const diasComGps = new Set<string>()
      tecGps.forEach(g => {
        const c = calcGPS(g)
        gpsKm += c.km; gpsDirigindo += c.tempoDirigindo; gpsCliente += c.tempoCliente
        diasComGps.add(g.data)
      })
      diasGPS = diasComGps.size

      tecOs.forEach(o => {
        osTotal++
        const h = parseFloat(String(o.Qtd_HR || 0)) || 0
        const km = parseFloat(String(o.Qtd_KM || 0)) || 0
        osHoras += h; osKm += km
        if (o.Status === 'Concluida' || o.Status === 'Concluída') osConcluidas++
        // Futuras: Previsao_Execucao > hoje
        if (o.Previsao_Execucao && o.Previsao_Execucao > hoje) {
          osFuturas++; horasFuturas += h; kmFuturos += km
        }
      })

      // Periodos agendados no mes (cada item na agenda_visao = 1 periodo por dia)
      const diasAgendados = new Set<string>()
      tecAgenda.forEach(a => diasAgendados.add(a.data))
      const periodosAgendados = diasAgendados.size

      // Dias uteis restantes no mes (seg-sab)
      let diasUteisTotal = 0, diasUteisFuturos = 0
      diasDoMes.forEach(d => {
        const dow = new Date(d + 'T12:00:00').getDay()
        if (dow >= 1 && dow <= 6) {
          diasUteisTotal++
          if (d > hoje) diasUteisFuturos++
        }
      })

      // Meta: 44 periodos no mes (22 dias * 2 periodos)
      const metaPeriodos = 44
      const periodosRealizados = diasGPS // dias com GPS = dias trabalhados
      const periodosRestantes = Math.max(0, metaPeriodos - periodosAgendados)

      return {
        nome: tec.tecnico_nome,
        gpsKm: Math.round(gpsKm), gpsDirigindo, gpsCliente, diasGPS,
        osHoras, osKm: Math.round(osKm), osConcluidas, osTotal,
        osFuturas, horasFuturas, kmFuturos: Math.round(kmFuturos),
        periodosAgendados, periodosRealizados, periodosRestantes, metaPeriodos,
        diasUteisTotal, diasUteisFuturos,
      }
    })
  }, [viewMode, tecs, allGpsData, allOsData, agendaData, diasDoMes, hoje])

  const toggleDay = (dia: string) => {
    setExpandedDays(prev => { const n = new Set(prev); if (n.has(dia)) n.delete(dia); else n.add(dia); return n })
  }

  const prevMes = () => { const d = new Date(ano, mesNum - 2, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const nextMes = () => { const d = new Date(ano, mesNum, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const nomeMes = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const osConcluidasMes = useMemo(() => osData.filter(o => o.Status === 'Concluída').length, [osData])

  return (
    <div style={{ minHeight: '80vh' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Toggle Todos / Individual */}
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
            <button onClick={() => setViewMode('todos')} style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
              background: viewMode === 'todos' ? '#111' : 'transparent',
              color: viewMode === 'todos' ? '#fff' : '#6B7280',
            }}><Users size={14} /> Todos</button>
            <button onClick={() => setViewMode('individual')} style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
              background: viewMode === 'individual' ? '#111' : 'transparent',
              color: viewMode === 'individual' ? '#fff' : '#6B7280',
            }}>Individual</button>
          </div>

          {viewMode === 'individual' && (
            <>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800 }}>
                {tecnicoSel.charAt(0)}
              </div>
              <select value={tecnicoSel} onChange={e => setTecnicoSel(e.target.value)}
                style={{ padding: '10px 20px 10px 12px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 17, fontWeight: 800, background: '#fff', color: '#111', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                {tecs.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
              </select>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 4 }}>
          <button onClick={prevMes} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555' }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#111', textTransform: 'capitalize', minWidth: 180, textAlign: 'center', letterSpacing: '-0.02em' }}>{nomeMes}</span>
          <button onClick={nextMes} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555' }}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa', fontSize: 14, fontWeight: 500 }}>Carregando dados...</div>
      ) : viewMode === 'todos' ? (
        /* ======================================= */
        /* === VISAO TODOS OS TECNICOS =========== */
        /* ======================================= */
        <div>
          {/* TABELA COMPARATIVA */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #F0F0F0', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', zIndex: 1 }}>Tecnico</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>Dias GPS</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>KM GPS</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>KM OS</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>Dirigindo</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>No Cliente</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>Horas OS</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>OS Total</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center' }}>OS Concl.</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#1E3A5F' }}>OS Futuras</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#1E3A5F' }}>Hrs Futuras</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#1E3A5F' }}>KM Futuros</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#065F46' }}>Agendados</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#065F46' }}>Meta</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', background: '#065F46' }}>Faltam</th>
                </tr>
              </thead>
              <tbody>
                {todosTecData.map((tec, idx) => {
                  const pctMeta = tec.metaPeriodos > 0 ? Math.round((tec.periodosAgendados / tec.metaPeriodos) * 100) : 0
                  const corMeta = pctMeta >= 90 ? '#065F46' : pctMeta >= 60 ? '#D97706' : '#DC2626'
                  const bgMeta = pctMeta >= 90 ? '#D1FAE5' : pctMeta >= 60 ? '#FEF3C7' : '#FEE2E2'
                  return (
                    <tr key={tec.nome} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111', fontSize: 14, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#FAFAFA', zIndex: 1, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                            {tec.nome.charAt(0)}
                          </div>
                          {tec.nome.split(' ').slice(0, 2).join(' ')}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#111', fontSize: 16 }}>{tec.diasGPS}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#1E40AF' }}>{tec.gpsKm}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 500, color: '#6B7280' }}>{tec.osKm}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#D97706' }}>{fmtMin(tec.gpsDirigindo)}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#065F46' }}>{fmtMin(tec.gpsCliente)}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 500, color: '#6B7280' }}>{tec.osHoras}h</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#111', fontSize: 16 }}>{tec.osTotal}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '3px 10px', borderRadius: 6, fontSize: 13 }}>{tec.osConcluidas}</span>
                      </td>
                      {/* Futuras */}
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0F4FF' }}>
                        <span style={{ fontWeight: 700, color: '#1E40AF', fontSize: 16 }}>{tec.osFuturas}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0F4FF', fontWeight: 600, color: '#3B82F6' }}>{tec.horasFuturas}h</td>
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0F4FF', fontWeight: 600, color: '#3B82F6' }}>{tec.kmFuturos}</td>
                      {/* Meta */}
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0FDF4' }}>
                        <span style={{ fontWeight: 800, color: corMeta, fontSize: 16 }}>{tec.periodosAgendados}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0FDF4', fontWeight: 700, color: '#6B7280' }}>{tec.metaPeriodos}</td>
                      <td style={{ padding: '12px', textAlign: 'center', background: '#F0FDF4' }}>
                        <span style={{
                          fontWeight: 800, fontSize: 14, padding: '4px 12px', borderRadius: 6,
                          background: bgMeta, color: corMeta,
                        }}>
                          {tec.periodosRestantes > 0 ? tec.periodosRestantes : 'OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* TOTAL */}
              <tfoot>
                <tr style={{ background: '#111', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                  <td style={{ padding: '14px 16px', fontWeight: 800, position: 'sticky', left: 0, background: '#111', zIndex: 1 }}>TOTAL</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{todosTecData.reduce((s, t) => s + t.diasGPS, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#93C5FD' }}>{todosTecData.reduce((s, t) => s + t.gpsKm, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#9CA3AF' }}>{todosTecData.reduce((s, t) => s + t.osKm, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#FCD34D' }}>{fmtMin(todosTecData.reduce((s, t) => s + t.gpsDirigindo, 0))}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#6EE7B7' }}>{fmtMin(todosTecData.reduce((s, t) => s + t.gpsCliente, 0))}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#9CA3AF' }}>{todosTecData.reduce((s, t) => s + t.osHoras, 0)}h</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{todosTecData.reduce((s, t) => s + t.osTotal, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#6EE7B7' }}>{todosTecData.reduce((s, t) => s + t.osConcluidas, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#93C5FD' }}>{todosTecData.reduce((s, t) => s + t.osFuturas, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#93C5FD' }}>{todosTecData.reduce((s, t) => s + t.horasFuturas, 0)}h</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#93C5FD' }}>{todosTecData.reduce((s, t) => s + t.kmFuturos, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#6EE7B7' }}>{todosTecData.reduce((s, t) => s + t.periodosAgendados, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#9CA3AF' }}>{todosTecData.reduce((s, t) => s + t.metaPeriodos, 0)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#FCA5A5' }}>{todosTecData.reduce((s, t) => s + t.periodosRestantes, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Barra de progresso por tecnico */}
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {todosTecData.map(tec => {
              const pct = tec.metaPeriodos > 0 ? Math.min(100, Math.round((tec.periodosAgendados / tec.metaPeriodos) * 100)) : 0
              const corBarra = pct >= 90 ? '#065F46' : pct >= 60 ? '#D97706' : '#DC2626'
              return (
                <div key={tec.nome} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #F0F0F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: '#111', fontSize: 14 }}>{tec.nome.split(' ').slice(0, 2).join(' ')}</span>
                    <span style={{ fontWeight: 800, color: corBarra, fontSize: 16 }}>{tec.periodosAgendados}/{tec.metaPeriodos}</span>
                  </div>
                  <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: corBarra, borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                    <span>{tec.osFuturas} OS futuras ({tec.horasFuturas}h)</span>
                    <span style={{ fontWeight: 700, color: corBarra }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ======================================= */
        /* === VISAO INDIVIDUAL =================== */
        /* ======================================= */
        <>
          {/* RESUMO MENSAL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><CalendarDays size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Dias Trabalhados</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: '#111', lineHeight: 1 }}>{totais.diasTrabalhados}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 6, fontWeight: 500 }}>{osConcluidasMes} OS concluida(s)</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><Route size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Quilometragem</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 38, fontWeight: 900, color: '#1E40AF', lineHeight: 1 }}>{Math.round(totais.gpsKm)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF', marginTop: 2 }}>km GPS</div>
                </div>
                <div style={{ fontSize: 16, color: '#D1D5DB', fontWeight: 300 }}>/</div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#9CA3AF', lineHeight: 1 }}>{Math.round(totais.osKm)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', marginTop: 2 }}>km OS</div>
                </div>
              </div>
              {totais.gpsKm > 0 && totais.osKm > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: Math.abs(totais.gpsKm - totais.osKm) > 50 ? '#DC2626' : '#6B7280' }}>
                  Diferenca: {Math.round(totais.gpsKm - totais.osKm)} km
                </div>
              )}
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><Gauge size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tempo Dirigindo</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: '#D97706', lineHeight: 1 }}>{fmtMin(totais.gpsDirigindo)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 6, fontWeight: 500 }}>via rastreamento GPS</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><Timer size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tempo no Cliente</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 38, fontWeight: 900, color: '#065F46', lineHeight: 1 }}>{fmtMin(totais.gpsCliente)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46', marginTop: 2 }}>GPS</div>
                </div>
                <div style={{ fontSize: 16, color: '#D1D5DB', fontWeight: 300 }}>/</div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#9CA3AF', lineHeight: 1 }}>{totais.osHoras}h</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', marginTop: 2 }}>OS</div>
                </div>
              </div>
            </div>
          </div>

          {/* TABELA DIARIA */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #F0F0F0', overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 1fr 40px',
              padding: '14px 20px', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0',
              fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <span>Dia</span>
              <span>KM GPS</span>
              <span>KM OS</span>
              <span>Dirigindo</span>
              <span>No Cliente</span>
              <span>Horas OS</span>
              <span></span>
            </div>

            {diasDoMes.map(dia => {
              const gps = gpsPorDia[dia]
              const ords = osPorDia[dia] || []
              if (!gps && ords.length === 0) return null
              const gpsCalc = gps ? calcGPS(gps) : { tempoDirigindo: 0, tempoCliente: 0, km: 0 }
              const osCalc = calcOS(ords)
              const expanded = expandedDays.has(dia)
              const diaSemana = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })
              const diaNum = dia.split('-')[2]
              const diffKm = gpsCalc.km - osCalc.km
              const diffHoras = gpsCalc.tempoCliente - osCalc.horas * 60
              const temGPS = gpsCalc.km > 0

              return (
                <div key={dia}>
                  <div
                    onClick={() => toggleDay(dia)}
                    style={{
                      display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 1fr 40px',
                      padding: '12px 20px', borderBottom: expanded ? 'none' : '1px solid #F5F5F5',
                      cursor: 'pointer', fontSize: 14, alignItems: 'center',
                      background: expanded ? '#F9FAFB' : '#fff',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = '#FAFBFC' }}
                    onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}
                  >
                    <span>
                      <span style={{ fontWeight: 800, color: '#111', fontSize: 16 }}>{diaNum}</span>
                      <span style={{ fontWeight: 500, color: '#bbb', fontSize: 11, marginLeft: 4 }}>{diaSemana}</span>
                    </span>
                    <span style={{ fontWeight: 700, color: temGPS ? '#1E40AF' : '#ddd' }}>
                      {gpsCalc.km > 0 ? `${gpsCalc.km} km` : '-'}
                    </span>
                    <span style={{ color: '#555', fontWeight: 500 }}>
                      {osCalc.km > 0 ? `${osCalc.km} km` : '-'}
                      {diffKm !== 0 && gpsCalc.km > 0 && osCalc.km > 0 && (
                        <span style={{ fontSize: 10, marginLeft: 4, padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: Math.abs(diffKm) > 20 ? '#FEE2E2' : '#F3F4F6', color: Math.abs(diffKm) > 20 ? '#DC2626' : '#6B7280' }}>
                          {diffKm > 0 ? '+' : ''}{Math.round(diffKm)}
                        </span>
                      )}
                    </span>
                    <span style={{ color: '#D97706', fontWeight: 700 }}>{fmtMin(gpsCalc.tempoDirigindo)}</span>
                    <span style={{ color: '#065F46', fontWeight: 700 }}>{fmtMin(gpsCalc.tempoCliente)}</span>
                    <span style={{ color: '#555', fontWeight: 500 }}>
                      {osCalc.horas > 0 ? `${osCalc.horas}h` : '-'}
                      {diffHoras !== 0 && gpsCalc.tempoCliente > 0 && osCalc.horas > 0 && (
                        <span style={{ fontSize: 10, marginLeft: 4, padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: Math.abs(diffHoras) > 60 ? '#FEE2E2' : '#F3F4F6', color: Math.abs(diffHoras) > 60 ? '#DC2626' : '#6B7280' }}>
                          {diffHoras > 0 ? '+' : ''}{fmtMin(Math.abs(diffHoras))}
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      {expanded ? <ChevronUp size={15} color="#bbb" /> : <ChevronDown size={15} color="#bbb" />}
                    </span>
                  </div>

                  {expanded && (
                    <div style={{ padding: '14px 20px 18px', background: '#FAFBFC', borderBottom: '1px solid #F0F0F0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: gps ? '1fr 1fr' : '1fr', gap: 14, marginLeft: 100 }}>
                        {gps && (
                          <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '14px 16px', border: '1px solid #DBEAFE' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                              <Car size={14} style={{ color: '#1E40AF' }} />
                              <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13 }}>GPS</span>
                              {gps.placa && <span style={{ fontSize: 11, fontWeight: 600, color: '#3B82F6', background: '#DBEAFE', padding: '1px 8px', borderRadius: 4 }}>{gps.placa}</span>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
                              <div><span style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>Saiu loja</span><div style={{ fontWeight: 700, color: '#1E3A8A' }}>{fmtHora(gps.saida_loja)}</div></div>
                              <div><span style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>Chegou cliente</span><div style={{ fontWeight: 700, color: '#1E3A8A' }}>{fmtHora(gps.chegada_cliente)}</div></div>
                              <div><span style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>Saiu cliente</span><div style={{ fontWeight: 700, color: '#1E3A8A' }}>{fmtHora(gps.saida_cliente)}</div></div>
                              <div><span style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>Retornou</span><div style={{ fontWeight: 700, color: '#1E3A8A' }}>{fmtHora(gps.retorno_loja)}</div></div>
                            </div>
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#1E40AF', background: '#DBEAFE', padding: '3px 10px', borderRadius: 6 }}>{gps.km_total} km</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '3px 10px', borderRadius: 6 }}>{fmtMin(gpsCalc.tempoDirigindo)} dirigindo</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '3px 10px', borderRadius: 6 }}>{fmtMin(gpsCalc.tempoCliente)} cliente</span>
                            </div>
                            {gps.eventos && gps.eventos.filter((e: any) => e.tipo === 'chegada_cliente' || e.tipo === 'saida_cliente').length > 2 && (
                              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {gps.eventos.filter((e: any) => e.tipo === 'chegada_cliente' || e.tipo === 'saida_cliente').map((e: any, i: number) => (
                                  <span key={i} style={{ fontSize: 11, fontWeight: 600, background: e.tipo === 'chegada_cliente' ? '#D1FAE5' : '#FEE2E2', color: e.tipo === 'chegada_cliente' ? '#065F46' : '#991B1B', padding: '2px 8px', borderRadius: 4 }}>
                                    {e.tipo === 'chegada_cliente' ? 'Chegou' : 'Saiu'} {fmtHora(e.horario)} {e.destino_nome ? `(${e.destino_nome})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #F0F0F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <Clock size={14} style={{ color: '#555' }} />
                            <span style={{ fontWeight: 800, color: '#333', fontSize: 13 }}>Ordens de Servico</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#999', background: '#F3F4F6', padding: '1px 8px', borderRadius: 4 }}>{ords.length}</span>
                          </div>
                          {ords.length > 0 ? ords.map(o => (
                            <div key={o.Id_Ordem} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                              <span style={{ fontWeight: 800, color: '#111', fontSize: 12, background: '#F3F4F6', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                {o.Id_Ordem}
                              </span>
                              <span style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{o.Os_Cliente}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#D97706', fontWeight: 700, fontSize: 12 }}>{parseFloat(String(o.Qtd_HR || 0)) || 0}h</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#1E40AF', fontWeight: 700, fontSize: 12 }}>{parseFloat(String(o.Qtd_KM || 0)) || 0}km</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                background: o.Status === 'Concluída' ? '#D1FAE5' : o.Status === 'Em Execução' ? '#DBEAFE' : '#FEF3C7',
                                color: o.Status === 'Concluída' ? '#065F46' : o.Status === 'Em Execução' ? '#1E40AF' : '#92400E',
                              }}>{o.Status}</span>
                            </div>
                          )) : (
                            <div style={{ fontSize: 13, color: '#ccc', fontWeight: 500, padding: '12px 0', textAlign: 'center' }}>Sem OS neste dia</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{
              display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 1fr 40px',
              padding: '16px 20px', background: '#111', fontSize: 14, fontWeight: 700, color: '#fff',
            }}>
              <span style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</span>
              <span style={{ color: '#93C5FD' }}>{Math.round(totais.gpsKm)} km</span>
              <span style={{ color: '#9CA3AF' }}>{Math.round(totais.osKm)} km</span>
              <span style={{ color: '#FCD34D' }}>{fmtMin(totais.gpsDirigindo)}</span>
              <span style={{ color: '#6EE7B7' }}>{fmtMin(totais.gpsCliente)}</span>
              <span style={{ color: '#9CA3AF' }}>{totais.osHoras}h</span>
              <span></span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
