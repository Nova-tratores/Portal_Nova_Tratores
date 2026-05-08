'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Car, Clock, MapPin, Route, Timer, CalendarDays, Gauge } from 'lucide-react'

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

export default function BlocoRelatorioMensal({ tecnicos }: { tecnicos: Tecnico[] }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [tecnicoSel, setTecnicoSel] = useState('')
  const [gpsData, setGpsData] = useState<ViagemGPS[]>([])
  const [osData, setOsData] = useState<OSData[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const tecs = useMemo(() => tecnicos.filter(t => t.mecanico_role === 'tecnico'), [tecnicos])
  useEffect(() => { if (tecs.length > 0 && !tecnicoSel) setTecnicoSel(tecs[0].tecnico_nome) }, [tecs, tecnicoSel])

  const carregar = useCallback(async () => {
    if (!tecnicoSel || !mes) return
    setLoading(true)
    const [ano, mesNum] = mes.split('-').map(Number)
    const primeiroDia = `${mes}-01`
    const ultimoDia = `${ano}-${String(mesNum).padStart(2, '0')}-${new Date(ano, mesNum, 0).getDate()}`

    const [{ data: gps }, { data: ords }] = await Promise.all([
      supabase.from('GPS_Viagens')
        .select('*')
        .eq('tecnico_nome', tecnicoSel)
        .gte('data', primeiroDia)
        .lte('data', ultimoDia)
        .order('data'),
      supabase.from('Ordem_Servico')
        .select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Qtd_HR, Qtd_KM, Previsao_Execucao, Data_Fim_Servico, Dias_Execucao, Status, Tipo_Servico')
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
  }, [tecnicoSel, mes])

  useEffect(() => { carregar() }, [carregar])

  const diasDoMes = useMemo(() => {
    const [ano, mesNum] = mes.split('-').map(Number)
    const totalDias = new Date(ano, mesNum, 0).getDate()
    const dias: string[] = []
    for (let d = 1; d <= totalDias; d++) dias.push(`${mes}-${String(d).padStart(2, '0')}`)
    return dias
  }, [mes])

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

  const toggleDay = (dia: string) => {
    setExpandedDays(prev => { const n = new Set(prev); if (n.has(dia)) n.delete(dia); else n.add(dia); return n })
  }

  const prevMes = () => { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 2, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const nextMes = () => { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const nomeMes = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const osConcluidasMes = useMemo(() => osData.filter(o => o.Status === 'Concluída').length, [osData])

  return (
    <div style={{ minHeight: '80vh' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800 }}>
            {tecnicoSel.charAt(0)}
          </div>
          <select
            value={tecnicoSel}
            onChange={e => setTecnicoSel(e.target.value)}
            style={{ padding: '10px 20px 10px 12px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 17, fontWeight: 800, background: '#fff', color: '#111', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          >
            {tecs.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
          </select>
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
      ) : (
        <>
          {/* RESUMO MENSAL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {/* Dias Trabalhados */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><CalendarDays size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Dias Trabalhados</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: '#111', lineHeight: 1 }}>{totais.diasTrabalhados}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 6, fontWeight: 500 }}>{osConcluidasMes} OS concluida(s)</div>
            </div>

            {/* KM Total */}
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

            {/* Tempo Dirigindo */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}><Gauge size={48} /></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tempo Dirigindo</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: '#D97706', lineHeight: 1 }}>{fmtMin(totais.gpsDirigindo)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 6, fontWeight: 500 }}>via rastreamento GPS</div>
            </div>

            {/* Tempo no Cliente */}
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
            {/* Header */}
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
                      {expanded
                        ? <ChevronUp size={15} color="#bbb" />
                        : <ChevronDown size={15} color="#bbb" />}
                    </span>
                  </div>

                  {/* Detalhe expandido */}
                  {expanded && (
                    <div style={{ padding: '14px 20px 18px', background: '#FAFBFC', borderBottom: '1px solid #F0F0F0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: gps ? '1fr 1fr' : '1fr', gap: 14, marginLeft: 100 }}>
                        {/* GPS Card */}
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

                        {/* OS Card */}
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

            {/* TOTAL */}
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
