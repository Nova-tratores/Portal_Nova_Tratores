'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, Plus, X, Search, MapPin, Trash2, FileText, Truck, Edit3, StickyNote, ExternalLink, Link2 } from 'lucide-react'

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
.ag-tab{padding:10px 0;cursor:pointer;border:none;background:#fff;text-align:center;flex:1;transition:all .15s;position:relative}
.ag-tab:hover{background:#F8F8F8}
.ag-tab.active{background:#111;color:#fff !important}
.ag-tab.active *{color:#fff !important}
.ag-note-btn{display:inline-flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;padding:5px 10px;border-radius:4px;border:1px solid #E0E0E0;background:#fff;color:#111;transition:all .15s;font-weight:600}
.ag-note-btn:hover{background:#F5F5F5;border-color:#111}
.ag-add-btn{display:flex;align-items:center;justify-content:center;gap:5px;padding:10px;border-radius:0;border:none;border-top:1px solid #E0E0E0;color:#111;font-size:14px;font-weight:700;cursor:pointer;transition:all .12s;background:#FAFAFA;width:100%}
.ag-add-btn:hover{background:#F0F0F0}
.ag-fade-in{animation:agFade .15s ease}
.ag-card{border:1px solid #D0D0D0;border-radius:0;overflow:hidden;transition:box-shadow .15s}
.ag-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
@keyframes agFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
`

export default function BlocoAgenda({ tecnicos, ordens, semanaOffset = 0 }: { tecnicos: Tecnico[]; ordens: OrdemServico[]; semanaOffset?: number }) {
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
  const [svgLines, setSvgLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; id: string }>>([])

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
      const idsExistentes = new Set(rows.map(r => `${r.data}|${r.id_ordem}`))
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
            if (deveMostrar && !idsExistentes.has(`${dia}|${os.Id_Ordem}`)) {
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

  // Contadores por dia
  const countByDay = useMemo(() => {
    const m: Record<string, number> = {}
    dias.forEach(d => { m[d] = agendaSemana.filter(a => a.data === d).length })
    return m
  }, [dias, agendaSemana])

  // Ordens compartilhadas entre 2+ técnicos no dia selecionado
  const sharedOrderIds = useMemo(() => {
    const orderTecCount: Record<string, number> = {}
    tecs.forEach(tec => {
      agendaSemana.filter(a => a.data === diaSel && a.tecnico_nome === tec.tecnico_nome).forEach(item => {
        if (item.id_ordem && !item.id_ordem.startsWith('AG-')) {
          orderTecCount[item.id_ordem] = (orderTecCount[item.id_ordem] || 0) + 1
        }
      })
    })
    return new Set(Object.keys(orderTecCount).filter(k => orderTecCount[k] > 1))
  }, [tecs, agendaSemana, diaSel])

  // Calcular posição das linhas SVG conectando ordens compartilhadas
  useEffect(() => {
    const compute = () => {
      if (!gridRef.current || sharedOrderIds.size === 0) { setSvgLines([]); return }
      const gridRect = gridRef.current.getBoundingClientRect()
      const scrollTop = gridRef.current.scrollTop || 0
      const scrollLeft = gridRef.current.scrollLeft || 0
      const els = gridRef.current.querySelectorAll<HTMLDivElement>('[data-shared-order]')
      const byOrder: Record<string, HTMLDivElement[]> = {}
      els.forEach(el => {
        const id = el.dataset.sharedOrder!
        if (!byOrder[id]) byOrder[id] = []
        byOrder[id].push(el)
      })
      const newLines: typeof svgLines = []
      Object.entries(byOrder).forEach(([orderId, elements]) => {
        if (elements.length < 2) return
        const r1 = elements[0].getBoundingClientRect()
        const r2 = elements[1].getBoundingClientRect()
        // Conectar borda direita do card esquerdo → borda esquerda do card direito
        const leftEl = r1.left < r2.left ? r1 : r2
        const rightEl = r1.left < r2.left ? r2 : r1
        newLines.push({
          x1: leftEl.right - gridRect.left + scrollLeft,
          y1: leftEl.top + leftEl.height / 2 - gridRect.top + scrollTop,
          x2: rightEl.left - gridRect.left + scrollLeft,
          y2: rightEl.top + rightEl.height / 2 - gridRect.top + scrollTop,
          id: orderId,
        })
      })
      setSvgLines(newLines)
    }
    requestAnimationFrame(compute)
    const observer = new ResizeObserver(compute)
    if (gridRef.current) observer.observe(gridRef.current)
    window.addEventListener('scroll', compute, true)
    return () => { observer.disconnect(); window.removeEventListener('scroll', compute, true) }
  }, [diaSel, agendaSemana, sharedOrderIds])

  if (!diaSel) return null

  const diaObj = new Date(diaSel + 'T12:00:00')
  const isHoje = diaSel === hoje
  const diaPassado = diaSel < hoje

  return (
    <div>
      <style>{CSS}</style>

      {/* ── TABS DOS DIAS ── */}
      <div style={{ display: 'flex', border: '1px solid #D0D0D0', overflow: 'hidden', marginBottom: 20, background: '#fff' }}>
        {dias.map((dia, di) => {
          const d = new Date(dia + 'T12:00:00')
          const isActive = dia === diaSel
          const isH = dia === hoje
          const cnt = countByDay[dia] || 0
          return (
            <button key={dia} className={`ag-tab${isActive ? ' active' : ''}`} onClick={() => setDiaSel(dia)}
              style={{ opacity: dia < hoje && !isActive ? 0.5 : 1, borderRight: di < dias.length - 1 ? '1px solid #D0D0D0' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {DIAS_SEMANA[d.getDay()]}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#111', margin: '1px 0' }}>
                {d.getDate()}
              </div>
              {cnt > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{cnt} OS</div>}
              {isH && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? '#fff' : '#111', margin: '3px auto 0' }} />}
            </button>
          )
        })}
        {loading && <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', borderLeft: '1px solid #D0D0D0' }}><Loader2 size={15} color="#111" className="animate-spin" /></div>}
      </div>

      {/* ── CONTEÚDO DO DIA ── */}
      <div key={diaSel} className="ag-fade-in" style={{ minHeight: 300 }}>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 0, border: '1px solid #D0D0D0', background: '#D0D0D0', position: 'relative' }}>
          {/* SVG linhas conectando ordens compartilhadas */}
          {svgLines.length > 0 && (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
              {svgLines.map(l => {
                const midX = (l.x1 + l.x2) / 2
                return (
                  <g key={l.id}>
                    <path d={`M${l.x1},${l.y1} C${midX},${l.y1} ${midX},${l.y2} ${l.x2},${l.y2}`} stroke="#7C3AED" strokeWidth={2} strokeDasharray="6 3" fill="none" opacity={0.7} />
                    <circle cx={l.x1} cy={l.y1} r={4} fill="#7C3AED" opacity={0.7} />
                    <circle cx={l.x2} cy={l.y2} r={4} fill="#7C3AED" opacity={0.7} />
                  </g>
                )
              })}
            </svg>
          )}
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
            const ordsTec = ordsDoDiaTec.filter(o => !idsNaAgenda.has(o.Id_Ordem))
            const buscaLower = buscaOS.toLowerCase()
            const ordsFiltradas = isAdding && addMode === 'os'
              ? (buscaOS ? ordensExecucao.filter(o => !idsNaAgenda.has(o.Id_Ordem) && (o.Id_Ordem.toLowerCase().includes(buscaLower) || o.Os_Cliente.toLowerCase().includes(buscaLower) || (o.Cidade_Cliente || '').toLowerCase().includes(buscaLower))) : ordsTec)
              : []

            return (
              <div key={tec.user_id} className="ag-card" style={{ background: '#fff' }}>
                {/* Tec header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #D0D0D0', background: '#F7F7F7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#111', textTransform: 'uppercase' }}>{tec.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                  </div>
                  {items.length > 0 && <span style={{ fontSize: 14, color: '#111', fontWeight: 700 }}>{items.length} OS</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.length === 0 && !isAdding && !isEditingNote && !notaValue && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#111', fontSize: 14, fontWeight: 500, borderBottom: '1px solid #E8E8E8' }}>Sem servico</div>
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

                    return (
                      <div key={row.id} {...(isShared ? { 'data-shared-order': row.id_ordem } : {})} style={{ padding: '12px 16px', background: isShared ? '#FAF5FF' : '#fff', borderBottom: '1px solid #E8E8E8', borderLeft: isShared ? '3px solid #7C3AED' : 'none' }}>
                        {/* Linha 1: Cliente + OS id + lixeira */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: '#111', lineHeight: 1.3 }}>{row.cliente || '—'}</span>
                            {row.id_ordem && !row.id_ordem.startsWith('AG-') && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#111', marginLeft: 8 }}>#{row.id_ordem}</span>
                            )}
                          </div>
                          <button onClick={() => remover(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CCC', padding: 2, flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')} onMouseLeave={e => (e.currentTarget.style.color = '#CCC')}>
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Linha 2: Cidade + distancia + horas — tudo inline */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4, fontSize: 13, color: '#111' }}>
                          {row.cidade && row.coordenadas ? (
                            <a href={`https://www.google.com/maps?q=${row.coordenadas.lat},${row.coordenadas.lng}`} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none', fontWeight: 700 }}
                              onClick={e => e.stopPropagation()}>
                              <MapPin size={12} /> {row.cidade}
                            </a>
                          ) : row.cidade ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}><MapPin size={12} /> {row.cidade}</span>
                          ) : null}
                          {row.tempo_ida_min > 0 && <span style={{ fontWeight: 600 }}>{Math.round(row.tempo_ida_min)}min · {row.distancia_ida_km}km</span>}
                          {(row.cidade || row.tempo_ida_min > 0) && (horaInicio || h > 0) && <span style={{ color: '#D0D0D0' }}>|</span>}
                          {horaInicio && horaFim ? (
                            <span style={{ fontWeight: 800, color: '#1E3A5F' }}>{horaInicio}→{horaFim}</span>
                          ) : null}
                          {h > 0 && <span style={{ fontWeight: 700 }}>{h}h</span>}
                          {diaAtualAgenda > 0 && (
                            <span style={{ fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: '1px solid #FDE68A' }}>
                              Dia {diaAtualAgenda}/{diasTotal}
                            </span>
                          )}
                          {osOriginal && (() => {
                            const outroTec = matchNome(tec.tecnico_nome, osOriginal.Os_Tecnico)
                              ? osOriginal.Os_Tecnico2
                              : osOriginal.Os_Tecnico
                            if (!outroTec) return null
                            const outroPrimeiro = outroTec.split(' ').slice(0, 2).join(' ')
                            return (
                              <span style={{ fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', padding: '1px 6px', borderRadius: 3, fontSize: 11, border: '1px solid #DDD6FE', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Link2 size={10} /> Com {outroPrimeiro}
                              </span>
                            )
                          })()}
                        </div>

                        {/* Serviço */}
                        {sol && <div style={{ fontSize: 13, color: '#111', lineHeight: 1.3, marginBottom: 4, fontWeight: 500 }}>{sol.length > 100 ? sol.slice(0, 100) + '...' : sol}</div>}

                        {/* GPS inline */}
                        {temGPS && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4, fontSize: 11 }}>
                            {row.gps_saida_oficina && <span style={{ fontWeight: 700, color: '#111', background: '#F0F0F0', padding: '1px 6px', borderRadius: 3 }}>Saiu {row.gps_saida_oficina}</span>}
                            {row.gps_chegada_cliente && <span style={{ fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '1px 6px', borderRadius: 3 }}>Chegou {row.gps_chegada_cliente}</span>}
                            {row.gps_saida_cliente && <span style={{ fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '1px 6px', borderRadius: 3 }}>Saiu cli {row.gps_saida_cliente}</span>}
                            {row.gps_retorno_oficina && <span style={{ fontWeight: 700, color: '#111', background: '#F0F0F0', padding: '1px 6px', borderRadius: 3 }}>Voltou {row.gps_retorno_oficina}</span>}
                            {row.tempo_excedido && <span style={{ fontWeight: 800, color: '#DC2626', background: '#FEF2F2', padding: '1px 6px', borderRadius: 3 }}>Excedeu</span>}
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
    </div>
  )
}
