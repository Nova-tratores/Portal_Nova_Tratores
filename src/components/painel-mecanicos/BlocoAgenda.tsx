'use client'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, Plus, X, Search, MapPin, Trash2, FileText, Truck, Edit3, StickyNote, ExternalLink, Link2, ArrowDown, Navigation, Clock, ChevronDown, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Building2, MapPinned, Coffee } from 'lucide-react'

interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface OrdemServico {
  Id_Ordem: string; Status: string; Os_Cliente: string; Os_Tecnico: string; Os_Tecnico2: string
  Previsao_Execucao: string | null; Previsao_Faturamento: string | null; Tipo_Servico: string; Cidade_Cliente: string
  Endereco_Cliente: string; Cnpj_Cliente: string; Serv_Solicitado: string; Qtd_HR?: string | number | null
  Hora_Inicio_Exec?: string; Hora_Fim_Exec?: string
}
interface AgendaRow {
  id: number; data: string; tecnico_nome: string; id_ordem: string | null
  cliente: string; servico: string; endereco: string; cidade: string
  coordenadas: { lat: number; lng: number } | null
  tempo_ida_min: number; distancia_ida_km: number; qtd_horas: number
  ordem_sequencia: number; status: string; observacoes: string
  gps_saida_oficina?: string; gps_chegada_cliente?: string; gps_saida_cliente?: string; gps_retorno_oficina?: string
  tempo_excedido?: boolean
}
interface ClienteOption { chave: string; display: string }

function normNome(n: string): string[] { return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(p => p.length > 2) }
function matchNome(a: string, b: string) { if (!a || !b) return false; const pA = normNome(a), pB = normNome(b); if (!pA.length || !pB.length || pA[0] !== pB[0]) return false; if (pA.length === 1 || pB.length === 1) return true; const s = new Set(pA.slice(1)); return pB.slice(1).some(p => s.has(p)) }
function extrairSolicitacao(serv: string): string {
  if (!serv) return ''
  const idx = serv.indexOf('Solicitação do cliente:')
  if (idx === -1) return ''
  const after = serv.substring(idx + 'Solicitação do cliente:'.length)
  const fim = after.indexOf('Serviço Realizado')
  return (fim > -1 ? after.substring(0, fim) : after).replace(/\n/g, ' ').trim()
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function getSegunda(offset: number): Date {
  const d = new Date(); const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
  const seg = new Date(d.getFullYear(), d.getMonth(), diff); seg.setHours(0, 0, 0, 0); return seg
}
function getDiasSemana(offset: number): string[] {
  const seg = getSegunda(offset)
  return Array.from({ length: 6 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d.toISOString().split('T')[0] })
}
function calcDiasExecucao(qtdHR: string | number | null | undefined): number {
  const h = parseFloat(String(qtdHR || 0)) || 0; return h <= 0 ? 1 : Math.max(1, Math.ceil(h / 8))
}
/** Calcula a data fim REAL de execução: Previsao_Execucao + dias baseados nas horas */
function fimExecucaoReal(os: { Previsao_Execucao: string | null; Previsao_Faturamento: string | null; Qtd_HR?: string | number | null }): string {
  if (!os.Previsao_Execucao) return ''
  const dias = calcDiasExecucao(os.Qtd_HR)
  if (dias <= 1) return os.Previsao_Execucao
  const inicio = new Date(os.Previsao_Execucao + 'T12:00:00')
  inicio.setDate(inicio.getDate() + dias - 1)
  return inicio.toISOString().split('T')[0]
}
function proximosDiasUteis(diaInicial: string, qtd: number, diasDisponiveis: string[]): string[] {
  const idx = diasDisponiveis.indexOf(diaInicial); return idx === -1 ? [diaInicial] : diasDisponiveis.slice(idx, idx + qtd)
}

const CSS = `
.ag-tab{padding:12px 0;cursor:pointer;border:none;background:#fff;text-align:center;flex:1;transition:all .18s;position:relative}
.ag-tab:hover{background:#F5F7FA}
.ag-tab.active{background:#1E3A5F;color:#fff !important}
.ag-tab.active *{color:#fff !important}
.ag-note-btn{display:inline-flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;padding:5px 10px;border-radius:4px;border:1px solid #E0E0E0;background:#fff;color:#111;transition:all .15s;font-weight:600}
.ag-note-btn:hover{background:#F5F5F5;border-color:#111}
.ag-add-btn{display:flex;align-items:center;justify-content:center;gap:5px;padding:10px;border-radius:0;border:none;border-top:1px solid #E0E0E0;color:#111;font-size:14px;font-weight:700;cursor:pointer;transition:all .12s;background:#FAFAFA;width:100%}
.ag-add-btn:hover{background:#F0F0F0}
.ag-fade-in{animation:agFade .18s ease}
.ag-card{border:none;border-radius:10px;overflow:hidden;transition:box-shadow .18s;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.ag-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.1)}
.ag-seq{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:800;flex-shrink:0}
.ag-route-arrow{display:flex;align-items:center;justify-content:center;color:#CBD5E1;padding:2px 0}
@keyframes agFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
`

type ViewMode = 'dia' | 'mes'

function getMesStr(offset: number = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function BlocoAgenda({ tecnicos, ordens, semanaOffset = 0 }: { tecnicos: Tecnico[]; ordens: OrdemServico[]; semanaOffset?: number }) {
  const [viewMode, setViewMode] = useState<ViewMode>('dia')
  const [mesOffset, setMesOffset] = useState(0)
  const [agendaMes, setAgendaMes] = useState<AgendaRow[]>([])
  const [loadingMes, setLoadingMes] = useState(false)
  const [agendaSemana, setAgendaSemana] = useState<AgendaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [notaSalvando, setNotaSalvando] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<string | null>(null) // "tec|dia" or "obs-{id}"
  const [addKey, setAddKey] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'os' | 'manual'>('os')
  const [buscaOS, setBuscaOS] = useState('')
  const [addSalvando, setAddSalvando] = useState(false)
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [clienteFilter, setClienteFilter] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<{ chave: string; nome: string; endereco: string; cidade: string } | null>(null)
  const [addHoras, setAddHoras] = useState(2)
  const [addObs, setAddObs] = useState('')
  const [carregandoCliente, setCarregandoCliente] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const tecs = useMemo(() => tecnicos.filter(t => t.mecanico_role === 'tecnico'), [tecnicos])
  const dias = useMemo(() => getDiasSemana(semanaOffset), [semanaOffset])
  const hoje = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [diaSel, setDiaSel] = useState('')

  // Inicializar dia selecionado como hoje
  useEffect(() => {
    if (dias.includes(hoje)) setDiaSel(hoje)
    else setDiaSel(dias[0])
  }, [dias, hoje])

  // Todas as ordens não-canceladas por técnico
  const ordensPorTec = useMemo(() => {
    const m: Record<string, OrdemServico[]> = {}
    tecs.forEach(t => {
      m[t.tecnico_nome] = ordens.filter(o => {
        if (o.Status === 'Cancelada') return false
        return matchNome(t.tecnico_nome, o.Os_Tecnico) || matchNome(t.tecnico_nome, o.Os_Tecnico2)
      })
    })
    return m
  }, [tecs, ordens])
  // Ordens que caem no dia selecionado (pela Previsao_Execucao + horas OU Status Execução → hoje)
  const ordensDoDia = useMemo(() => {
    const m: Record<string, OrdemServico[]> = {}
    tecs.forEach(t => {
      m[t.tecnico_nome] = (ordensPorTec[t.tecnico_nome] || []).filter(o => {
        // Se está em execução, aparece no dia de hoje
        if (o.Status === 'Execução' && diaSel === hoje) return true
        if (!o.Previsao_Execucao) return false
        const inicio = o.Previsao_Execucao
        const fim = fimExecucaoReal(o)
        return diaSel >= inicio && diaSel <= fim
      })
    })
    return m
  }, [tecs, ordensPorTec, diaSel, hoje])
  // Ordens em execução (para popup adicionar)
  const ordensExecucao = useMemo(() => ordens.filter(o => o.Status === 'Execução'), [ordens])

  useEffect(() => { fetch('/api/pos/clientes').then(r => r.ok ? r.json() : []).then(setClientes).catch(() => {}) }, [])
  const clientesFiltrados = useMemo(() => {
    if (!clienteFilter) return []; const terms = clienteFilter.toLowerCase().split(/\s+/).filter(Boolean)
    return clientes.filter(c => { const d = c.display.toLowerCase(); return terms.every(t => d.includes(t)) }).slice(0, 12)
  }, [clienteFilter, clientes])

  const carregarSemana = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all(dias.map(d => fetch(`/api/pos/agenda-visao?data=${d}`).then(r => r.ok ? r.json() : [])))
      const rows = results.flat() as AgendaRow[]
      setAgendaSemana(rows)

      // Auto-popular: ordens que deveriam estar na semana mas não estão
      const idsExistentes = new Set(rows.map(r => `${r.data}|${r.id_ordem}|${r.tecnico_nome}`))
      const toSync: Record<string, { nome: string; ordens: any[] }[]> = {}

      tecs.forEach(tec => {
        const tecOrdens = ordensPorTec[tec.tecnico_nome] || []
        tecOrdens.forEach(os => {
          // Para cada dia da semana que cai no range da OS OU Status Execução → hoje
          dias.forEach(dia => {
            let deveMostrar = false
            if (os.Status === 'Execução' && dia === hoje) {
              deveMostrar = true
            } else if (os.Previsao_Execucao) {
              const inicio = os.Previsao_Execucao
              const fim = fimExecucaoReal(os)
              deveMostrar = dia >= inicio && dia <= fim
            }
            if (deveMostrar && !idsExistentes.has(`${dia}|${os.Id_Ordem}|${tec.tecnico_nome}`)) {
              if (!toSync[dia]) toSync[dia] = []
              let tecEntry = toSync[dia].find(t => t.nome === tec.tecnico_nome)
              if (!tecEntry) { tecEntry = { nome: tec.tecnico_nome, ordens: [] }; toSync[dia].push(tecEntry) }
              const totalDias = calcDiasExecucao(os.Qtd_HR)
              const totalH = parseFloat(String(os.Qtd_HR || 0)) || 2
              const hDia = totalDias > 1 ? Math.min(8, totalH / totalDias) : totalH
              tecEntry.ordens.push({
                id: os.Id_Ordem, cliente: os.Os_Cliente, cnpj: os.Cnpj_Cliente,
                endereco: os.Endereco_Cliente, cidade: os.Cidade_Cliente,
                servico: os.Serv_Solicitado, qtdHoras: Math.max(1, Math.round(hDia * 10) / 10),
                horaInicio: os.Hora_Inicio_Exec || '', horaFim: os.Hora_Fim_Exec || '',
                observacoes: extrairSolicitacao(os.Serv_Solicitado || ''),
              })
            }
          })
        })
      })

      // Sync missing entries
      const syncDias = Object.keys(toSync)
      if (syncDias.length > 0) {
        const syncResults = await Promise.all(syncDias.map(dia =>
          fetch('/api/pos/agenda-visao', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dia, tecnicos: toSync[dia] }),
          }).then(r => r.ok ? r.json() : [])
        ))
        const newRows = syncResults.flat() as AgendaRow[]
        if (newRows.length > 0) {
          setAgendaSemana(prev => {
            const existingIds = new Set(prev.map(r => r.id))
            return [...prev, ...newRows.filter(r => !existingIds.has(r.id))]
          })
          // Calc rotas para novos sem rota
          newRows.filter(r => r.tempo_ida_min === 0 && r.endereco).forEach(r => {
            fetch('/api/pos/agenda-visao', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: r.id, calcular: true }),
            }).then(async res => { if (res.ok) { const u = await res.json(); setAgendaSemana(p => p.map(a => a.id === u.id ? u : a)) } }).catch(() => {})
          })
        }
      }
    } catch { }
    setLoading(false)
  }, [dias, tecs, ordensPorTec, hoje])

  const carregarNotas = useCallback(async () => {
    try {
      const r = await fetch(`/api/pos/agenda-notas?datas=${dias.join(',')}`)
      if (r.ok) { const rows = await r.json() as { tecnico_nome: string; data: string; nota: string }[]; const map: Record<string, string> = {}; rows.forEach(n => { if (n.nota) map[`${n.tecnico_nome}|${n.data}`] = n.nota }); setNotas(map) }
    } catch { }
  }, [dias])

  useEffect(() => { carregarSemana(); carregarNotas() }, [carregarSemana, carregarNotas])

  const salvarObs = async (id: number, obs: string) => {
    try { await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, observacoes: obs }) }); setAgendaSemana(p => p.map(a => a.id === id ? { ...a, observacoes: obs } : a)) } catch { }
    setEditingNote(null)
  }

  const salvarNota = async (tecNome: string, dia: string, nota: string) => {
    const key = `${tecNome}|${dia}`; setNotaSalvando(key)
    try { const r = await fetch('/api/pos/agenda-notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico_nome: tecNome, data: dia, nota }) }); if (r.ok) setNotas(p => nota ? { ...p, [key]: nota } : (() => { const n = { ...p }; delete n[key]; return n })()) } catch { }
    setNotaSalvando(null); setEditingNote(null)
  }

  const remover = async (id: number) => { const r = await fetch('/api/pos/agenda-visao', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); if (r.ok) setAgendaSemana(p => p.filter(a => a.id !== id)) }

  const selecionarCliente = async (c: ClienteOption) => {
    setCarregandoCliente(true); setClienteFilter(c.display.split('[')[0].trim())
    try { const r = await fetch(`/api/pos/clientes?id=${encodeURIComponent(c.chave)}`); if (r.ok) { const data = await r.json(); setClienteSelecionado({ chave: c.chave, nome: data.nome, endereco: data.endereco || '', cidade: data.cidade || '' }) } } catch { }
    setCarregandoCliente(false)
  }

  const getUltimaLocalizacao = (tecNome: string, dia: string) => {
    const itemsDia = agendaSemana.filter(a => a.data === dia && a.tecnico_nome === tecNome && a.coordenadas).sort((a, b) => a.ordem_sequencia - b.ordem_sequencia)
    return itemsDia[itemsDia.length - 1] || null
  }

  const adicionarOS = async (tecNome: string, diaInicial: string, os: OrdemServico) => {
    setAddSalvando(true)
    try {
      const totalHoras = parseFloat(String(os.Qtd_HR || 0)) || 2; const diasExec = calcDiasExecucao(os.Qtd_HR); const diasP = proximosDiasUteis(diaInicial, diasExec, dias)
      for (let d = 0; d < diasP.length; d++) {
        const diaA = diasP[d]; const hDia = d < diasP.length - 1 ? 8 : Math.min(8, totalHoras - d * 8); const ultimo = getUltimaLocalizacao(tecNome, diaA)
        const r = await fetch('/api/pos/agenda-visao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: diaA, tecnicos: [{ nome: tecNome, ordens: [{ id: os.Id_Ordem, cliente: os.Os_Cliente, cnpj: os.Cnpj_Cliente, endereco: os.Endereco_Cliente, cidade: os.Cidade_Cliente, servico: os.Serv_Solicitado, qtdHoras: Math.max(1, hDia), observacoes: diasExec > 1 ? `Dia ${d + 1}/${diasExec} · ${extrairSolicitacao(os.Serv_Solicitado || '')}` : extrairSolicitacao(os.Serv_Solicitado || '') }] }] }) })
        if (r.ok) {
          const rows = await r.json() as AgendaRow[]; setAgendaSemana(prev => [...prev.filter(a => a.data !== diaA), ...rows])
          if (d === 0) await fetch('/api/pos/agenda-visao/caminho', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico_nome: tecNome, destino: os.Os_Cliente, cidade: os.Cidade_Cliente || '', motivo: os.Id_Ordem }) }).catch(() => {})
          const ni = rows.find(row => row.tecnico_nome === tecNome && row.id_ordem === os.Id_Ordem && row.tempo_ida_min === 0)
          if (ni) { const cb: Record<string, any> = { id: ni.id, calcular: true }; if (ultimo?.coordenadas) { cb.origemLat = ultimo.coordenadas.lat; cb.origemLng = ultimo.coordenadas.lng }; fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cb) }).then(async r2 => { if (r2.ok) { const u = await r2.json(); setAgendaSemana(p => p.map(a => a.id === u.id ? u : a)) } }) }
        }
      }
    } catch { }
    fecharAdd(); setAddSalvando(false); carregarSemana()
  }

  const adicionarManual = async (tecNome: string, dia: string) => {
    if (!clienteSelecionado) return; setAddSalvando(true)
    try {
      const ultimo = getUltimaLocalizacao(tecNome, dia)
      const r = await fetch('/api/pos/agenda-visao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dia, tecnicos: [{ nome: tecNome, ordens: [{ id: `AG-${Date.now()}`, cliente: clienteSelecionado.nome, cnpj: '', endereco: clienteSelecionado.endereco, cidade: clienteSelecionado.cidade, servico: '', qtdHoras: addHoras, observacoes: addObs }] }] }) })
      if (r.ok) {
        const rows = await r.json() as AgendaRow[]; setAgendaSemana(prev => [...prev.filter(a => a.data !== dia), ...rows])
        await fetch('/api/pos/agenda-visao/caminho', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tecnico_nome: tecNome, destino: clienteSelecionado.nome, cidade: clienteSelecionado.cidade, motivo: addObs || 'Serviço agendado' }) }).catch(() => {})
        const ni = rows.find(row => row.tecnico_nome === tecNome && row.tempo_ida_min === 0 && row.endereco && !agendaSemana.some(exist => exist.id === row.id))
        if (ni) { const cb: Record<string, any> = { id: ni.id, calcular: true }; if (ultimo?.coordenadas) { cb.origemLat = ultimo.coordenadas.lat; cb.origemLng = ultimo.coordenadas.lng }; fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cb) }).then(async r2 => { if (r2.ok) { const u = await r2.json(); setAgendaSemana(p => p.map(a => a.id === u.id ? u : a)) } }) }
      }
    } catch { }
    fecharAdd(); setAddSalvando(false)
  }

  const abrirAdd = (tecNome: string, dia: string) => { setAddKey(`${tecNome}|${dia}`); setAddMode('os'); setBuscaOS(''); setClienteFilter(''); setClienteSelecionado(null); setAddHoras(2); setAddObs('') }
  const fecharAdd = () => { setAddKey(null); setBuscaOS(''); setClienteFilter(''); setClienteSelecionado(null); setAddHoras(2); setAddObs('') }

  // === VISAO MENSAL ===
  const mesStr = useMemo(() => getMesStr(mesOffset), [mesOffset])
  const [anoMes, mesNumMes] = useMemo(() => mesStr.split('-').map(Number), [mesStr])
  const diasDoMes = useMemo(() => {
    const totalDias = new Date(anoMes, mesNumMes, 0).getDate()
    const d: string[] = []
    for (let i = 1; i <= totalDias; i++) d.push(`${mesStr}-${String(i).padStart(2, '0')}`)
    return d
  }, [mesStr, anoMes, mesNumMes])

  const carregarMes = useCallback(async () => {
    setLoadingMes(true)
    try {
      const primeiroDia = `${mesStr}-01`
      const ultimoDia = `${mesStr}-${new Date(anoMes, mesNumMes, 0).getDate()}`
      const r = await fetch(`/api/pos/agenda-visao?de=${primeiroDia}&ate=${ultimoDia}`)
      if (r.ok) setAgendaMes(await r.json())
    } catch { }
    setLoadingMes(false)
  }, [mesStr, anoMes, mesNumMes])

  useEffect(() => { if (viewMode === 'mes') carregarMes() }, [viewMode, carregarMes])

  // Ordens do mes agrupadas por tecnico+dia
  const mesGrid = useMemo(() => {
    const m: Record<string, Record<string, { manha: AgendaRow[]; tarde: AgendaRow[] }>> = {}
    tecs.forEach(tec => {
      m[tec.tecnico_nome] = {}
      diasDoMes.forEach(dia => {
        m[tec.tecnico_nome][dia] = { manha: [], tarde: [] }
      })
    })
    // Preencher com dados da agenda
    agendaMes.forEach(row => {
      if (m[row.tecnico_nome] && m[row.tecnico_nome][row.data]) {
        // Ordenar por sequencia e dividir em manha/tarde
        if (row.ordem_sequencia <= 1) m[row.tecnico_nome][row.data].manha.push(row)
        else m[row.tecnico_nome][row.data].tarde.push(row)
      }
    })
    // Adicionar ordens que deveriam estar no mes mas nao estao na agenda
    tecs.forEach(tec => {
      const tecOrdens = ordensPorTec[tec.tecnico_nome] || []
      tecOrdens.forEach(os => {
        if (!os.Previsao_Execucao) return
        const inicio = os.Previsao_Execucao
        const fim = fimExecucaoReal(os)
        diasDoMes.forEach(dia => {
          if (dia >= inicio && dia <= fim && m[tec.tecnico_nome][dia]) {
            const jaExiste = [...m[tec.tecnico_nome][dia].manha, ...m[tec.tecnico_nome][dia].tarde].some(r => r.id_ordem === os.Id_Ordem)
            if (!jaExiste) {
              const fakeRow: AgendaRow = {
                id: -parseInt(os.Id_Ordem.replace(/\D/g, '') || '0') - diasDoMes.indexOf(dia),
                data: dia, tecnico_nome: tec.tecnico_nome, id_ordem: os.Id_Ordem,
                cliente: os.Os_Cliente, servico: os.Serv_Solicitado, endereco: os.Endereco_Cliente,
                cidade: os.Cidade_Cliente, coordenadas: null, tempo_ida_min: 0, distancia_ida_km: 0,
                qtd_horas: parseFloat(String(os.Qtd_HR || 0)) || 0, ordem_sequencia: 0,
                status: os.Status, observacoes: '',
              }
              if (m[tec.tecnico_nome][dia].manha.length <= m[tec.tecnico_nome][dia].tarde.length) {
                m[tec.tecnico_nome][dia].manha.push(fakeRow)
              } else {
                m[tec.tecnico_nome][dia].tarde.push(fakeRow)
              }
            }
          }
        })
      })
    })
    return m
  }, [tecs, diasDoMes, agendaMes, ordensPorTec])

  // Contagem de periodos por tecnico no mes (meta: 44)
  const periodosDoMes = useMemo(() => {
    const m: Record<string, { agendados: number; realizados: number }> = {}
    tecs.forEach(tec => {
      let agendados = 0, realizados = 0
      diasDoMes.forEach(dia => {
        const cell = mesGrid[tec.tecnico_nome]?.[dia]
        if (!cell) return
        if (cell.manha.length > 0) agendados++
        if (cell.tarde.length > 0) agendados++
        // Realizado = status concluida
        if (cell.manha.some(r => r.status === 'Concluída' || r.status === 'concluida')) realizados++
        if (cell.tarde.some(r => r.status === 'Concluída' || r.status === 'concluida')) realizados++
      })
      m[tec.tecnico_nome] = { agendados, realizados }
    })
    return m
  }, [tecs, diasDoMes, mesGrid])

  const nomeMes = new Date(mesStr + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Contadores por dia
  const countByDay = useMemo(() => {
    const m: Record<string, number> = {}
    dias.forEach(d => { m[d] = agendaSemana.filter(a => a.data === d).length })
    return m
  }, [dias, agendaSemana])

  // Ordens compartilhadas entre 2+ técnicos no dia selecionado
  const sharedOrderIds = useMemo(() => {
    const shared = new Set<string>()
    // Detectar pela agenda (2+ técnicos com mesma ordem)
    const orderTecCount: Record<string, number> = {}
    tecs.forEach(tec => {
      agendaSemana.filter(a => a.data === diaSel && a.tecnico_nome === tec.tecnico_nome).forEach(item => {
        if (item.id_ordem && !item.id_ordem.startsWith('AG-')) {
          orderTecCount[item.id_ordem] = (orderTecCount[item.id_ordem] || 0) + 1
        }
      })
    })
    Object.keys(orderTecCount).filter(k => orderTecCount[k] > 1).forEach(k => shared.add(k))
    // Detectar diretamente pela OS (tem Os_Tecnico e Os_Tecnico2)
    ordens.forEach(o => {
      if (o.Os_Tecnico && o.Os_Tecnico2 && o.Status !== 'Cancelada') {
        const temTec1 = tecs.some(t => matchNome(t.tecnico_nome, o.Os_Tecnico))
        const temTec2 = tecs.some(t => matchNome(t.tecnico_nome, o.Os_Tecnico2))
        if (temTec1 && temTec2) shared.add(o.Id_Ordem)
      }
    })
    return shared
  }, [tecs, agendaSemana, diaSel, ordens])


  if (!diaSel) return null

  const diaObj = new Date(diaSel + 'T12:00:00')
  const isHoje = diaSel === hoje
  const diaPassado = diaSel < hoje

  // Helper para cor de tipo de servico
  const tipoServicoLabel = (tipo: string | undefined) => {
    if (!tipo) return null
    const t = tipo.toLowerCase()
    if (t.includes('intern') || t.includes('oficina')) return { label: 'INT', color: '#7C3AED', bg: '#EDE9FE' }
    if (t.includes('extern') || t.includes('campo') || t.includes('client')) return { label: 'EXT', color: '#0E7490', bg: '#CFFAFE' }
    return { label: tipo.substring(0, 3).toUpperCase(), color: '#6B7280', bg: '#F3F4F6' }
  }

  return (
    <div>
      <style>{CSS}</style>

      {/* == TOGGLE VISAO == */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
          <button onClick={() => setViewMode('dia')} style={{
            padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
            background: viewMode === 'dia' ? '#1E3A5F' : 'transparent',
            color: viewMode === 'dia' ? '#fff' : '#6B7280',
          }}><LayoutGrid size={14} /> Semanal</button>
          <button onClick={() => setViewMode('mes')} style={{
            padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
            background: viewMode === 'mes' ? '#1E3A5F' : 'transparent',
            color: viewMode === 'mes' ? '#fff' : '#6B7280',
          }}><CalendarDays size={14} /> Mensal</button>
        </div>

        {viewMode === 'mes' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 3 }}>
            <button onClick={() => setMesOffset(p => p - 1)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#111', textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>{nomeMes}</span>
            <button onClick={() => setMesOffset(p => p + 1)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555' }}>
              <ChevronRight size={16} />
            </button>
            {mesOffset !== 0 && (
              <button onClick={() => setMesOffset(0)} style={{ fontSize: 11, fontWeight: 600, color: '#111', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Atual</button>
            )}
          </div>
        )}
      </div>

      {/* ============================== */}
      {/* === VISAO MENSAL PANORAMICA === */}
      {/* ============================== */}
      {viewMode === 'mes' && (
        <div>
          {loadingMes ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 14, fontWeight: 500 }}>Carregando mes...</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #D0D0D0', borderRadius: 8, background: '#fff' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: diasDoMes.length * 56 + 200 }}>
                <thead>
                  {/* Linha dos dias */}
                  <tr style={{ background: '#111', color: '#fff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', zIndex: 3, minWidth: 160, borderRight: '2px solid #333', fontSize: 12 }}>
                      Tecnico
                    </th>
                    <th style={{ padding: '4px 6px', textAlign: 'center', position: 'sticky', left: 160, background: '#111', zIndex: 3, borderRight: '2px solid #333', fontSize: 10, minWidth: 60 }}>
                      Periodos<br /><span style={{ color: '#6EE7B7' }}>/ 44</span>
                    </th>
                    {diasDoMes.map(dia => {
                      const d = new Date(dia + 'T12:00:00')
                      const dow = d.getDay()
                      const isDom = dow === 0
                      const isSab = dow === 6
                      const isH = dia === hoje
                      return (
                        <th key={dia} colSpan={2} style={{
                          padding: '4px 2px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                          borderRight: '1px solid #333', minWidth: 54,
                          background: isH ? '#1E3A5F' : isDom ? '#374151' : '#111',
                          color: isDom ? '#6B7280' : '#fff',
                          opacity: isDom ? 0.5 : 1,
                        }}>
                          <div style={{ fontSize: 9, textTransform: 'uppercase' }}>{DIAS_SEMANA[dow]}</div>
                          <div style={{ fontSize: 14, fontWeight: 900 }}>{d.getDate()}</div>
                        </th>
                      )
                    })}
                  </tr>
                  {/* Linha Manhã/Tarde */}
                  <tr style={{ background: '#1E3A5F', color: '#93C5FD', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                    <th style={{ position: 'sticky', left: 0, background: '#1E3A5F', zIndex: 3, borderRight: '2px solid #2D5A8E' }}></th>
                    <th style={{ position: 'sticky', left: 160, background: '#1E3A5F', zIndex: 3, borderRight: '2px solid #2D5A8E' }}></th>
                    {diasDoMes.map(dia => (
                      <React.Fragment key={dia}>
                        <th style={{ padding: '2px 4px', textAlign: 'center', borderRight: '1px solid #2D5A8E', width: 27 }}>M</th>
                        <th style={{ padding: '2px 4px', textAlign: 'center', borderRight: '1px solid #333', width: 27 }}>T</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tecs.map((tec, tecIdx) => {
                    const periodos = periodosDoMes[tec.tecnico_nome] || { agendados: 0, realizados: 0 }
                    const pct = Math.round((periodos.agendados / 44) * 100)
                    const corPct = pct >= 90 ? '#065F46' : pct >= 60 ? '#D97706' : '#DC2626'
                    return (
                      <tr key={tec.user_id} style={{ borderBottom: '1px solid #E8E8E8', background: tecIdx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{
                          padding: '6px 10px', fontWeight: 700, color: '#111', fontSize: 13,
                          position: 'sticky', left: 0, background: tecIdx % 2 === 0 ? '#fff' : '#FAFAFA',
                          zIndex: 2, borderRight: '2px solid #E0E0E0', whiteSpace: 'nowrap',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#1E3A5F', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                              {tec.tecnico_nome.charAt(0)}
                            </div>
                            <span>{tec.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                          </div>
                        </td>
                        <td style={{
                          padding: '4px 6px', textAlign: 'center', position: 'sticky', left: 160,
                          background: tecIdx % 2 === 0 ? '#fff' : '#FAFAFA', zIndex: 2,
                          borderRight: '2px solid #E0E0E0',
                        }}>
                          <div style={{ fontWeight: 900, fontSize: 16, color: corPct }}>{periodos.agendados}</div>
                          <div style={{ fontSize: 9, color: '#999', fontWeight: 600 }}>{periodos.realizados} OK</div>
                        </td>
                        {diasDoMes.map(dia => {
                          const cell = mesGrid[tec.tecnico_nome]?.[dia]
                          const dow = new Date(dia + 'T12:00:00').getDay()
                          const isDom = dow === 0
                          const isH = dia === hoje

                          const renderCell = (items: AgendaRow[], periodo: 'M' | 'T') => {
                            if (isDom) return <td key={`${dia}-${periodo}`} style={{ background: '#F9FAFB', borderRight: periodo === 'T' ? '1px solid #E0E0E0' : '1px solid #F0F0F0', padding: 0, height: 36 }} />
                            if (!items || items.length === 0) return (
                              <td key={`${dia}-${periodo}`} style={{
                                background: isH ? '#F0F4FF' : 'transparent',
                                borderRight: periodo === 'T' ? '1px solid #E0E0E0' : '1px solid #F0F0F0',
                                padding: 0, height: 36,
                              }} />
                            )
                            const item = items[0]
                            const os = item.id_ordem && !item.id_ordem.startsWith('AG-') ? ordens.find(o => o.Id_Ordem === item.id_ordem) : null
                            const isPrimario = os ? matchNome(tec.tecnico_nome, os.Os_Tecnico) : true
                            const isInterno = os?.Tipo_Servico?.toLowerCase().includes('intern') || os?.Tipo_Servico?.toLowerCase().includes('oficina')
                            const isConcluida = item.status === 'Concluída' || item.status === 'concluida'
                            const isExecucao = item.status === 'Execução' || item.status === 'execucao'
                            const isOcioso = !item.id_ordem && !item.cliente

                            let bg = isH ? '#DBEAFE' : '#D1FAE5'
                            let cor = '#065F46'
                            if (isConcluida) { bg = '#D1FAE5'; cor = '#065F46' }
                            else if (isExecucao) { bg = '#DBEAFE'; cor = '#1E40AF' }
                            else if (isInterno) { bg = '#EDE9FE'; cor = '#7C3AED' }
                            else if (isOcioso) { bg = '#FEE2E2'; cor = '#DC2626' }
                            else { bg = '#FEF3C7'; cor = '#92400E' }

                            if (!isPrimario) { bg = '#FEF3C7'; cor = '#B45309' }

                            return (
                              <td key={`${dia}-${periodo}`}
                                title={`${item.cliente || 'Sem cliente'} — ${os?.Id_Ordem || ''} ${isInterno ? '(INT)' : '(EXT)'} ${!isPrimario ? '(AUX)' : ''} ${isOcioso ? 'OCIOSO' : ''}`}
                                style={{
                                  background: bg, borderRight: periodo === 'T' ? '1px solid #E0E0E0' : '1px solid #F0F0F0',
                                  padding: '1px 2px', height: 36, cursor: 'default', position: 'relative',
                                }}>
                                <div style={{ fontSize: 8, fontWeight: 800, color: cor, lineHeight: 1.1, overflow: 'hidden', maxHeight: 34, textAlign: 'center' }}>
                                  {isOcioso ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 32 }}>
                                      <Coffee size={10} />
                                      <span style={{ fontSize: 7 }}>OCIOSO</span>
                                    </div>
                                  ) : (
                                    <>
                                      {!isPrimario && <div style={{ fontSize: 7, fontWeight: 900, color: '#B45309' }}>AUX</div>}
                                      <div>{(item.cliente || '').split(' ')[0]}</div>
                                      {os && <div style={{ fontSize: 7, color: isInterno ? '#7C3AED' : '#0E7490' }}>{isInterno ? 'INT' : 'EXT'}</div>}
                                    </>
                                  )}
                                </div>
                              </td>
                            )
                          }

                          return (
                            <React.Fragment key={dia}>
                              {renderCell(cell?.manha || [], 'M')}
                              {renderCell(cell?.tarde || [], 'T')}
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legenda */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#555' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#D1FAE5' }} /> Concluida</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#DBEAFE' }} /> Execucao</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#EDE9FE' }} /> Interno (oficina)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#FEF3C7' }} /> Externo / Auxiliar</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#FEE2E2' }} /> Ocioso</span>
            <span style={{ fontWeight: 700, marginLeft: 8 }}>M = Manha | T = Tarde | Meta: 44 periodos/mes</span>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* === VISAO SEMANAL (DIARIA) ==== */}
      {/* ============================== */}
      {viewMode === 'dia' && (<>

      {/* ── TABS DOS DIAS ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'transparent', flexWrap: 'wrap' }}>
        {dias.map((dia) => {
          const d = new Date(dia + 'T12:00:00')
          const isActive = dia === diaSel
          const isH = dia === hoje
          const cnt = countByDay[dia] || 0
          const isPast = dia < hoje
          return (
            <button key={dia} onClick={() => setDiaSel(dia)}
              style={{
                flex: 1, minWidth: 70, padding: '10px 6px', cursor: 'pointer', border: isActive ? '2px solid #1E3A5F' : isH ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                background: isActive ? '#1E3A5F' : '#fff', borderRadius: 10, textAlign: 'center',
                opacity: isPast && !isActive ? 0.55 : 1, transition: 'all .18s',
                boxShadow: isActive ? '0 2px 8px rgba(30,58,95,.25)' : 'none',
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#93C5FD' : '#64748B', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {DIAS_SEMANA[d.getDay()]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isActive ? '#fff' : '#111', margin: '2px 0' }}>
                {d.getDate()}
              </div>
              {cnt > 0 && (
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? '#fff' : '#1E3A5F',
                  background: isActive ? 'rgba(255,255,255,.15)' : '#EFF6FF',
                  padding: '2px 8px', borderRadius: 6, display: 'inline-block',
                }}>
                  {cnt} OS
                </div>
              )}
              {isH && <div style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#60A5FA' : '#3B82F6', margin: '4px auto 0' }} />}
            </button>
          )
        })}
        {loading && <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}><Loader2 size={15} color="#1E3A5F" className="animate-spin" /></div>}
      </div>

      {/* ── CONTEÚDO DO DIA ── */}
      <div key={diaSel} className="ag-fade-in" style={{ minHeight: 300 }}>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))', gap: 16, position: 'relative' }}>
          {tecs.map((tec) => {
            const items = agendaSemana.filter(a => a.data === diaSel && a.tecnico_nome === tec.tecnico_nome).sort((a, b) => a.ordem_sequencia - b.ordem_sequencia)
            const cellKey = `${tec.tecnico_nome}|${diaSel}`
            const isAdding = addKey === cellKey
            const notaKey = cellKey
            const notaValue = notas[notaKey] || ''
            const isEditingNote = editingNote === notaKey
            const primeiroNome = tec.tecnico_nome.split(' ')[0]

            const idsNaAgenda = new Set(items.map(a => a.id_ordem).filter(Boolean))
            const ordsDoDiaTec = ordensDoDia[tec.tecnico_nome] || []
            // Ordens compartilhadas: onde este técnico é Os_Tecnico ou Os_Tecnico2 mas não está na agenda
            const ordensCompartilhadasFaltando = ordens.filter(o => {
              if (o.Status === 'Cancelada' || idsNaAgenda.has(o.Id_Ordem)) return false
              const isTec1 = matchNome(tec.tecnico_nome, o.Os_Tecnico)
              const isTec2 = matchNome(tec.tecnico_nome, o.Os_Tecnico2)
              if (!isTec1 && !isTec2) return false
              // Verificar se cai no dia selecionado
              if (o.Status === 'Execução' && diaSel === hoje) return true
              if (!o.Previsao_Execucao) return false
              return diaSel >= o.Previsao_Execucao && diaSel <= fimExecucaoReal(o)
            })
            const ordsTec = [...ordsDoDiaTec, ...ordensCompartilhadasFaltando].filter((o, i, arr) => !idsNaAgenda.has(o.Id_Ordem) && arr.findIndex(x => x.Id_Ordem === o.Id_Ordem) === i)
            const buscaLower = buscaOS.toLowerCase()
            const ordsFiltradas = isAdding && addMode === 'os'
              ? (buscaOS ? ordensExecucao.filter(o => !idsNaAgenda.has(o.Id_Ordem) && (o.Id_Ordem.toLowerCase().includes(buscaLower) || o.Os_Cliente.toLowerCase().includes(buscaLower) || (o.Cidade_Cliente || '').toLowerCase().includes(buscaLower))) : ordsTec)
              : []

            return (
              <div key={tec.user_id} className="ag-card" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
                {/* Tec header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>
                      {tec.tecnico_nome.charAt(0)}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '.02em' }}>{tec.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                  </div>
                  {(items.length + ordensCompartilhadasFaltando.length) > 0 && (
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, background: 'rgba(255,255,255,.2)', padding: '3px 10px', borderRadius: 6 }}>
                      {items.length + ordensCompartilhadasFaltando.length} OS
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.length === 0 && ordensCompartilhadasFaltando.length === 0 && !isAdding && !isEditingNote && !notaValue && (
                    <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 14, fontWeight: 500, borderBottom: '1px solid #F1F5F9' }}>
                      <Navigation size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: .4 }} />
                      Sem servico agendado
                    </div>
                  )}

                  {items.map((row, rowIdx) => {
                    const isEditObs = editingNote === `obs-${row.id}`
                    const osOriginal = row.id_ordem && !row.id_ordem.startsWith('AG-') ? ordens.find(o => o.Id_Ordem === row.id_ordem) : null
                    const sol = extrairSolicitacao(row.servico || '')
                    const h = osOriginal ? (parseFloat(String(osOriginal.Qtd_HR || 0)) || 0) : row.qtd_horas
                    const horaInicio = osOriginal?.Hora_Inicio_Exec || ''
                    const horaFim = osOriginal?.Hora_Fim_Exec || ''
                    const multiDia = osOriginal?.Previsao_Faturamento && osOriginal?.Previsao_Execucao && osOriginal.Previsao_Faturamento > osOriginal.Previsao_Execucao
                    const diasTotal = multiDia ? Math.round((new Date(osOriginal.Previsao_Faturamento + 'T00:00:00').getTime() - new Date(osOriginal.Previsao_Execucao + 'T00:00:00').getTime()) / 86400000) + 1 : 1
                    const diaAtualAgenda = multiDia && osOriginal?.Previsao_Execucao ? Math.max(1, Math.min(diasTotal, Math.round((new Date(row.data + 'T00:00:00').getTime() - new Date(osOriginal.Previsao_Execucao + 'T00:00:00').getTime()) / 86400000) + 1)) : 0
                    const temGPS = !!(row.gps_saida_oficina || row.gps_chegada_cliente || row.gps_saida_cliente || row.gps_retorno_oficina)

                    const isShared = !!(row.id_ordem && sharedOrderIds.has(row.id_ordem))
                    const seqNum = rowIdx + 1

                    return (
                      <React.Fragment key={row.id}>
                        {rowIdx > 0 && (
                          <div className="ag-route-arrow">
                            <ChevronDown size={16} />
                          </div>
                        )}
                      <div style={{ padding: '12px 16px', background: isShared ? '#FFFBEB' : '#fff', borderBottom: '1px solid #F1F5F9', borderLeft: isShared ? '3px solid #F59E0B' : 'none' }}>
                        {/* Linha 1: Sequencia + Cliente + OS id + lixeira */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <span className="ag-seq" style={{ background: isShared ? '#FEF3C7' : '#EFF6FF', color: isShared ? '#B45309' : '#1E3A5F' }}>{seqNum}</span>
                            <div>
                              <span style={{ fontSize: 15, fontWeight: 800, color: '#111', lineHeight: 1.3 }}>{row.cliente || '—'}</span>
                              {row.id_ordem && !row.id_ordem.startsWith('AG-') && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginLeft: 6 }}>#{row.id_ordem}</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => remover(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 2, flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}>
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Linha 2: Cidade + distancia + horas — tudo inline */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6, marginLeft: 30, fontSize: 13, color: '#475569' }}>
                          {row.cidade && row.coordenadas ? (
                            <a href={`https://www.google.com/maps?q=${row.coordenadas.lat},${row.coordenadas.lng}`} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none', fontWeight: 700 }}
                              onClick={e => e.stopPropagation()}>
                              <MapPin size={12} /> {row.cidade}
                            </a>
                          ) : row.cidade ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}><MapPin size={12} /> {row.cidade}</span>
                          ) : null}
                          {row.tempo_ida_min > 0 && (
                            <span style={{ fontWeight: 600, background: '#F1F5F9', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>
                              <Navigation size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{Math.round(row.tempo_ida_min)}min · {row.distancia_ida_km}km
                            </span>
                          )}
                          {horaInicio && horaFim ? (
                            <span style={{ fontWeight: 800, color: '#1E3A5F', background: '#EFF6FF', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>
                              <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{horaInicio}→{horaFim}
                            </span>
                          ) : null}
                          {h > 0 && <span style={{ fontWeight: 700, fontSize: 12 }}>{h}h</span>}
                          {diaAtualAgenda > 0 && (
                            <span style={{ fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: '1px solid #FDE68A' }}>
                              Dia {diaAtualAgenda}/{diasTotal}
                            </span>
                          )}
                          {osOriginal && (() => {
                            const isPrimario = matchNome(tec.tecnico_nome, osOriginal.Os_Tecnico)
                            const outroTec = isPrimario ? osOriginal.Os_Tecnico2 : osOriginal.Os_Tecnico
                            const tipoSvc = tipoServicoLabel(osOriginal.Tipo_Servico)
                            return (
                              <>
                                {tipoSvc && (
                                  <span style={{ fontWeight: 800, color: tipoSvc.color, background: tipoSvc.bg, padding: '1px 6px', borderRadius: 3, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    {tipoSvc.label === 'INT' ? <Building2 size={10} /> : <MapPinned size={10} />} {tipoSvc.label}
                                  </span>
                                )}
                                {outroTec && (
                                  <>
                                    <span style={{ fontWeight: 800, color: isPrimario ? '#065F46' : '#92400E', background: isPrimario ? '#D1FAE5' : '#FEF3C7', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: `1px solid ${isPrimario ? '#A7F3D0' : '#FDE68A'}` }}>
                                      {isPrimario ? 'Primario' : 'Auxiliar'}
                                    </span>
                                    <span style={{ fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <Link2 size={10} /> Com {outroTec.split(' ').slice(0, 2).join(' ')}
                                    </span>
                                  </>
                                )}
                              </>
                            )
                          })()}
                        </div>

                        {/* Serviço */}
                        {sol && <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.3, marginBottom: 4, fontWeight: 500, marginLeft: 30 }}>{sol.length > 100 ? sol.slice(0, 100) + '...' : sol}</div>}

                        {/* GPS timeline */}
                        {temGPS && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 4, marginLeft: 30, fontSize: 11, flexWrap: 'wrap' }}>
                            {row.gps_saida_oficina && (
                              <span style={{ fontWeight: 700, color: '#1E3A5F', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px 0 0 4px', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Truck size={10} /> {row.gps_saida_oficina}
                              </span>
                            )}
                            {row.gps_saida_oficina && row.gps_chegada_cliente && <span style={{ color: '#93C5FD', fontSize: 10 }}> → </span>}
                            {row.gps_chegada_cliente && (
                              <span style={{ fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '2px 8px', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <MapPin size={10} /> {row.gps_chegada_cliente}
                              </span>
                            )}
                            {row.gps_chegada_cliente && row.gps_saida_cliente && <span style={{ color: '#93C5FD', fontSize: 10 }}> → </span>}
                            {row.gps_saida_cliente && (
                              <span style={{ fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '2px 8px', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={10} /> {row.gps_saida_cliente}
                              </span>
                            )}
                            {row.gps_saida_cliente && row.gps_retorno_oficina && <span style={{ color: '#93C5FD', fontSize: 10 }}> → </span>}
                            {row.gps_retorno_oficina && (
                              <span style={{ fontWeight: 700, color: '#1E3A5F', background: '#EFF6FF', padding: '2px 8px', borderRadius: '0 4px 4px 0', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Truck size={10} /> {row.gps_retorno_oficina}
                              </span>
                            )}
                            {row.tempo_excedido && <span style={{ fontWeight: 800, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 4, marginLeft: 4, border: '1px solid #FECACA' }}>Excedeu</span>}
                          </div>
                        )}

                        {/* Anotação */}
                        {isEditObs ? (
                          <textarea ref={noteRef} autoFocus defaultValue={row.observacoes || ''} placeholder="Anotação..."
                            onBlur={e => salvarObs(row.id, e.target.value.trim())}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarObs(row.id, (e.target as HTMLTextAreaElement).value.trim()) } if (e.key === 'Escape') setEditingNote(null) }}
                            style={{ width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #D0D0D0', background: '#FAFAFA', outline: 'none', resize: 'vertical', minHeight: 36, boxSizing: 'border-box', color: '#111', lineHeight: 1.4, fontWeight: 500 }}
                          />
                        ) : row.observacoes ? (
                          <div onClick={() => setEditingNote(`obs-${row.id}`)} style={{ cursor: 'pointer', fontSize: 13, color: '#111', lineHeight: 1.3, fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                            <Edit3 size={11} style={{ flexShrink: 0, marginTop: 2 }} />{row.observacoes}
                          </div>
                        ) : (
                          <button className="ag-note-btn" onClick={() => setEditingNote(`obs-${row.id}`)} style={{ fontSize: 11, padding: '2px 6px' }}>
                            <Edit3 size={10} /> Anotação
                          </button>
                        )}
                      </div>
                      </React.Fragment>
                    )
                  })}

                  {/* Ordens compartilhadas que faltam na agenda */}
                  {ordensCompartilhadasFaltando.map(os => {
                    const isPrimario = matchNome(tec.tecnico_nome, os.Os_Tecnico)
                    const outroTec = isPrimario ? os.Os_Tecnico2 : os.Os_Tecnico
                    const sol = extrairSolicitacao(os.Serv_Solicitado || '')
                    const h = parseFloat(String(os.Qtd_HR || 0)) || 0
                    return (
                      <div key={`shared-${os.Id_Ordem}`} style={{ padding: '12px 16px', background: '#FFFBEB', borderBottom: '1px solid #E8E8E8', borderLeft: '3px solid #F59E0B' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: '#111', lineHeight: 1.3 }}>{os.Os_Cliente || '—'}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#111', marginLeft: 8 }}>#{os.Id_Ordem}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4, fontSize: 13, color: '#111' }}>
                          {os.Cidade_Cliente && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}><MapPin size={12} /> {os.Cidade_Cliente}</span>}
                          {h > 0 && <span style={{ fontWeight: 700 }}>{h}h</span>}
                          <span style={{ fontWeight: 800, color: isPrimario ? '#065F46' : '#92400E', background: isPrimario ? '#D1FAE5' : '#FEF3C7', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: `1px solid ${isPrimario ? '#A7F3D0' : '#FDE68A'}` }}>
                            {isPrimario ? 'Primário' : 'Auxiliar'}
                          </span>
                          {outroTec && (
                            <span style={{ fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: '1px solid #DDD6FE', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Link2 size={10} /> Com {outroTec.split(' ').slice(0, 2).join(' ')}
                            </span>
                          )}
                        </div>
                        {sol && <div style={{ fontSize: 13, color: '#111', lineHeight: 1.3, fontWeight: 500 }}>{sol.length > 100 ? sol.slice(0, 100) + '...' : sol}</div>}
                      </div>
                    )
                  })}

                  {/* Nota do dia */}
                  {(isEditingNote || notaValue) && (
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #E8E8E8' }}>
                      {isEditingNote ? (
                        <textarea ref={noteRef} autoFocus defaultValue={notaValue} placeholder={`Nota para ${primeiroNome}...`}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== notaValue) salvarNota(tec.tecnico_nome, diaSel, v); else setEditingNote(null) }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = (e.target as HTMLTextAreaElement).value.trim(); salvarNota(tec.tecnico_nome, diaSel, v) } if (e.key === 'Escape') setEditingNote(null) }}
                          style={{ width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #D0D0D0', background: '#FAFAFA', outline: 'none', resize: 'vertical', minHeight: 36, boxSizing: 'border-box', color: '#111', lineHeight: 1.4, fontWeight: 500, opacity: notaSalvando === notaKey ? 0.5 : 1 }}
                        />
                      ) : (
                        <div onClick={() => setEditingNote(notaKey)} style={{ cursor: 'pointer', fontSize: 13, color: '#111', lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', gap: 5, fontWeight: 500 }}>
                          <StickyNote size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{notaValue}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rodapé: Nota + Adicionar */}
                  <div style={{ display: 'flex', borderTop: 'none' }}>
                    {!notaValue && !isEditingNote && (
                      <button className="ag-note-btn" onClick={() => setEditingNote(notaKey)} style={{ flex: 1, justifyContent: 'center', borderRadius: 0, border: 'none', borderRight: '1px solid #E8E8E8', background: '#FAFAFA', padding: '8px', fontSize: 12 }}>
                        <StickyNote size={12} /> Nota
                      </button>
                    )}
                    {!isAdding && (
                      <button className="ag-add-btn" onClick={() => abrirAdd(tec.tecnico_nome, diaSel)} style={{ flex: 1, borderTop: 'none', margin: 0, fontSize: 13 }}>
                        <Plus size={15} /> Adicionar
                      </button>
                    )}
                  </div>

                  {/* ── POPUP ADICIONAR ── */}
                  {isAdding && (
                    <div className="ag-fade-in" style={{ background: '#fff', borderTop: '1px solid #D0D0D0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #E8E8E8' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Adicionar para {primeiroNome}</span>
                        <button onClick={fecharAdd} style={{ background: '#F0F0F0', border: 'none', borderRadius: 4, cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} color="#111" /></button>
                      </div>
                      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8' }}>
                        {(['os', 'manual'] as const).map(mode => (
                          <button key={mode} onClick={() => setAddMode(mode)} style={{
                            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: addMode === mode ? 700 : 500,
                            border: 'none', cursor: 'pointer', background: addMode === mode ? '#111' : '#fff',
                            color: addMode === mode ? '#fff' : '#111',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          }}>
                            {mode === 'os' ? <><FileText size={12} /> Ordens {ordsTec.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: addMode === mode ? '#fff' : '#111', color: addMode === mode ? '#111' : '#fff', padding: '1px 6px', borderRadius: 4 }}>{ordsTec.length}</span>}</> : <><Plus size={12} /> Cliente</>}
                          </button>
                        ))}
                      </div>

                      {addMode === 'os' && (
                        <div style={{ padding: '10px 14px' }}>
                          <div style={{ position: 'relative', marginBottom: 8 }}>
                            <Search size={13} color="#111" style={{ position: 'absolute', left: 10, top: 9 }} />
                            <input value={buscaOS} onChange={e => setBuscaOS(e.target.value)} placeholder="Buscar OS, cliente..." style={{ fontSize: 13, padding: '8px 10px 8px 30px', border: '1px solid #D0D0D0', borderRadius: 4, outline: 'none', width: '100%', background: '#fff', boxSizing: 'border-box', color: '#111', fontWeight: 500 }} />
                          </div>
                          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {ordsFiltradas.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '16px 0', color: '#111', fontSize: 13, fontWeight: 500 }}>{buscaOS ? 'Nenhuma OS' : 'Todas ja na agenda'}</div>
                            ) : ordsFiltradas.map((os, oi) => (
                              <div key={os.Id_Ordem} style={{ padding: '8px 10px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{os.Os_Cliente}</div>
                                  <div style={{ fontSize: 12, color: '#111', fontWeight: 500 }}>
                                    #{os.Id_Ordem} {os.Cidade_Cliente && `· ${os.Cidade_Cliente}`} · {parseFloat(String(os.Qtd_HR || 0)) || 2}h
                                  </div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); adicionarOS(tec.tecnico_nome, diaSel, os) }} disabled={addSalvando}
                                  style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                  {addSalvando ? <Loader2 size={11} className="animate-spin" /> : '+ Add'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {addMode === 'manual' && (
                        <div style={{ padding: '10px 14px' }}>
                          <div style={{ marginBottom: 8, position: 'relative' }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 3, display: 'block' }}>Cliente</label>
                            <div style={{ position: 'relative' }}>
                              <Search size={13} color="#111" style={{ position: 'absolute', left: 10, top: 9 }} />
                              <input value={clienteFilter} onChange={e => { setClienteFilter(e.target.value); setClienteSelecionado(null) }} placeholder="Buscar cliente..."
                                style={{ fontSize: 13, padding: '8px 10px 8px 30px', border: '1px solid #D0D0D0', borderRadius: 4, outline: 'none', width: '100%', background: '#fff', boxSizing: 'border-box', color: '#111', fontWeight: 500 }} />
                            </div>
                            {clienteFilter && !clienteSelecionado && clientesFiltrados.length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 110, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                                {clientesFiltrados.map(c => (
                                  <div key={c.chave} onClick={() => selecionarCliente(c)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F0F0' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    <div style={{ fontWeight: 700, color: '#111' }}>{c.display.split('[')[0].trim()}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {carregandoCliente && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#111', fontSize: 13, marginBottom: 8, fontWeight: 500 }}><Loader2 size={13} className="animate-spin" /> Carregando...</div>}
                          {clienteSelecionado && (
                            <div style={{ marginBottom: 8, padding: '8px 10px', background: '#F7F7F7', borderRadius: 4, border: '1px solid #E0E0E0' }}>
                              <div style={{ fontSize: 14, color: '#111', fontWeight: 700 }}>{clienteSelecionado.endereco || 'Sem endereco'}</div>
                              {clienteSelecionado.cidade && <div style={{ fontSize: 13, color: '#111', marginTop: 1, fontWeight: 500 }}>{clienteSelecionado.cidade}</div>}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 8 }}>
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 3, display: 'block' }}>Horas</label>
                              <input type="number" step="0.5" min="0.5" value={addHoras} onChange={e => setAddHoras(parseFloat(e.target.value) || 1)}
                                style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D0D0D0', borderRadius: 4, outline: 'none', width: '100%', background: '#fff', boxSizing: 'border-box', color: '#111', fontWeight: 600 }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 3, display: 'block' }}>Observação</label>
                              <input value={addObs} onChange={e => setAddObs(e.target.value)} placeholder="Ex: Levar pecas..."
                                style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D0D0D0', borderRadius: 4, outline: 'none', width: '100%', background: '#fff', boxSizing: 'border-box', color: '#111', fontWeight: 500 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => adicionarManual(tec.tecnico_nome, diaSel)} disabled={!clienteSelecionado || addSalvando}
                              style={{ flex: 1, padding: '8px 0', fontSize: 14, fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer', background: clienteSelecionado ? '#111' : '#E5E5E5', color: clienteSelecionado ? '#fff' : '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {addSalvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Adicionar
                            </button>
                            <button onClick={fecharAdd} style={{ padding: '8px 14px', borderRadius: 4, border: '1px solid #D0D0D0', background: '#fff', cursor: 'pointer', color: '#111', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </>)}
    </div>
  )
}
