'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Car, Clock, MapPin } from 'lucide-react'

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

  return (
    <div style={{ background: '#F9FAFB', minHeight: '80vh', margin: '-20px', padding: 20, borderRadius: 12 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <select
          value={tecnicoSel}
          onChange={e => setTecnicoSel(e.target.value)}
          style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid #E5E7EB', fontSize: 16, fontWeight: 700, background: '#fff' }}
        >
          {tecs.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMes} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#111', textTransform: 'capitalize', minWidth: 200, textAlign: 'center' }}>{nomeMes}</span>
          <button onClick={nextMes} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronRight size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Carregando...</div>
      ) : (
        <>
          {/* RESUMO MENSAL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>Dias Trabalhados</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: '#111' }}>{totais.diasTrabalhados}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>KM Total</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div><div style={{ fontSize: 12, color: '#1E3A5F', fontWeight: 600 }}>GPS</div><div style={{ fontSize: 34, fontWeight: 900, color: '#1E3A5F' }}>{Math.round(totais.gpsKm)}</div></div>
                <span style={{ fontSize: 20, color: '#D1D5DB' }}>vs</span>
                <div><div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>OS</div><div style={{ fontSize: 34, fontWeight: 900, color: '#6B7280' }}>{Math.round(totais.osKm)}</div></div>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>Tempo Dirigindo (GPS)</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: '#D97706' }}>{fmtMin(totais.gpsDirigindo)}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>Tempo no Cliente</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div><div style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>GPS</div><div style={{ fontSize: 34, fontWeight: 900, color: '#065F46' }}>{fmtMin(totais.gpsCliente)}</div></div>
                <span style={{ fontSize: 20, color: '#D1D5DB' }}>vs</span>
                <div><div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>OS</div><div style={{ fontSize: 34, fontWeight: 900, color: '#6B7280' }}>{totais.osHoras}h</div></div>
              </div>
            </div>
          </div>

          {/* TABELA DIÁRIA */}
          <div style={{ background: '#fff', borderRadius: '12px 12px 0 0', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr 1fr 1fr 36px', padding: '12px 16px', background: '#F3F4F6', borderBottom: '1px solid #E5E7EB', fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
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

              return (
                <div key={dia}>
                  <div
                    onClick={() => toggleDay(dia)}
                    style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr 1fr 1fr 36px', padding: '11px 16px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', fontSize: 15, alignItems: 'center', background: expanded ? '#F9FAFB' : '#fff' }}
                  >
                    <span style={{ fontWeight: 700, color: '#111' }}>{diaNum} <span style={{ fontWeight: 400, color: '#999', fontSize: 12 }}>{diaSemana}</span></span>
                    <span style={{ fontWeight: 600, color: '#1E3A5F' }}>{gpsCalc.km > 0 ? `${gpsCalc.km} km` : '-'}</span>
                    <span style={{ color: '#555' }}>{osCalc.km > 0 ? `${osCalc.km} km` : '-'}
                      {diffKm !== 0 && gpsCalc.km > 0 && osCalc.km > 0 && <span style={{ fontSize: 11, marginLeft: 3, color: Math.abs(diffKm) > 20 ? '#DC2626' : '#6B7280' }}>({diffKm > 0 ? '+' : ''}{Math.round(diffKm)})</span>}
                    </span>
                    <span style={{ color: '#D97706', fontWeight: 600 }}>{fmtMin(gpsCalc.tempoDirigindo)}</span>
                    <span style={{ color: '#065F46', fontWeight: 600 }}>{fmtMin(gpsCalc.tempoCliente)}</span>
                    <span style={{ color: '#555' }}>{osCalc.horas > 0 ? `${osCalc.horas}h` : '-'}
                      {diffHoras !== 0 && gpsCalc.tempoCliente > 0 && osCalc.horas > 0 && <span style={{ fontSize: 11, marginLeft: 3, color: Math.abs(diffHoras) > 60 ? '#DC2626' : '#6B7280' }}>({diffHoras > 0 ? '+' : ''}{fmtMin(Math.abs(diffHoras))})</span>}
                    </span>
                    <span>{expanded ? <ChevronUp size={15} color="#999" /> : <ChevronDown size={15} color="#999" />}</span>
                  </div>
                  {expanded && (
                    <div style={{ padding: '12px 16px 16px 126px', background: '#FAFAFA', borderBottom: '1px solid #E5E7EB' }}>
                      {gps && (
                        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#EFF6FF', borderRadius: 8, fontSize: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Car size={14} style={{ color: '#1E3A5F' }} />
                            <span style={{ fontWeight: 700, color: '#1E3A5F' }}>GPS - {gps.placa}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: '#333' }}>
                            <span>Saiu: {fmtHora(gps.saida_loja)}</span>
                            <span>Chegou: {fmtHora(gps.chegada_cliente)}</span>
                            <span>Saiu cli: {fmtHora(gps.saida_cliente)}</span>
                            <span>Voltou: {fmtHora(gps.retorno_loja)}</span>
                            <span style={{ fontWeight: 700 }}>{gps.km_total} km</span>
                          </div>
                          {gps.eventos && gps.eventos.filter((e: any) => e.tipo === 'chegada_cliente' || e.tipo === 'saida_cliente').length > 2 && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#555', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {gps.eventos.filter((e: any) => e.tipo === 'chegada_cliente' || e.tipo === 'saida_cliente').map((e: any, i: number) => (
                                <span key={i} style={{ background: e.tipo === 'chegada_cliente' ? '#D1FAE5' : '#FEE2E2', padding: '2px 8px', borderRadius: 4 }}>
                                  {e.tipo === 'chegada_cliente' ? 'Chegou' : 'Saiu'} {fmtHora(e.horario)} {e.destino_nome ? `(${e.destino_nome})` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {ords.length > 0 ? ords.map(o => (
                        <div key={o.Id_Ordem} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14 }}>
                          <span style={{ fontWeight: 700, color: '#111', minWidth: 75 }}>OS {o.Id_Ordem}</span>
                          <span style={{ flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.Os_Cliente}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#D97706' }}><Clock size={12} />{parseFloat(String(o.Qtd_HR || 0)) || 0}h</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#1E3A5F' }}><MapPin size={12} />{parseFloat(String(o.Qtd_KM || 0)) || 0}km</span>
                          <span style={{ fontSize: 11, color: '#999', padding: '2px 8px', background: o.Status === 'Concluída' ? '#D1FAE5' : '#FEF3C7', borderRadius: 4 }}>{o.Status}</span>
                        </div>
                      )) : (
                        <div style={{ fontSize: 14, color: '#999', fontStyle: 'italic' }}>Sem OS neste dia</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* TOTAL */}
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr 1fr 1fr 36px', padding: '14px 16px', background: '#111', borderRadius: '0 0 12px 12px', fontSize: 15, fontWeight: 700, color: '#fff' }}>
            <span>TOTAL</span>
            <span>{Math.round(totais.gpsKm)} km</span>
            <span>{Math.round(totais.osKm)} km</span>
            <span>{fmtMin(totais.gpsDirigindo)}</span>
            <span>{fmtMin(totais.gpsCliente)}</span>
            <span>{totais.osHoras}h</span>
            <span></span>
          </div>
        </>
      )}
    </div>
  )
}
