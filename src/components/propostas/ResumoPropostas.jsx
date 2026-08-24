'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Tag, Package, MapPin } from 'lucide-react'

// Strings REAIS de status (bater caractere a caractere).
const STATUS_ABERTO = ['Enviar Proposta', 'AGUARDANDO RESPOSTA CLIENTE', 'AGUARDANDO RESPOSTA BANCO']
const STATUS_VENDIDO = 'Concluida-Vendido'
const STATUS_PERDIDO = 'Concluida- Não vendido.'

function parseValor(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return val
  let s = String(val).replace(/[R$\s]/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
const formatBRL = (v) => parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const JANELAS = [
  { k: '30', label: 'Últimos 30 dias', dias: 30 },
  { k: '90', label: 'Últimos 90 dias', dias: 90 },
  { k: 'all', label: 'Tudo', dias: null },
]
const DIMS = [
  { k: 'vendedor_nome', label: 'Vendedor', Icon: Users },
  { k: 'Marca', label: 'Marca', Icon: Tag },
  { k: 'Modelo', label: 'Modelo', Icon: Package },
  { k: 'Cidade', label: 'Cidade', Icon: MapPin },
]

export default function ResumoPropostas() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [janela, setJanela] = useState('30')
  const [dim, setDim] = useState('vendedor_nome')
  const [sort, setSort] = useState({ key: 'valor', dir: 'desc' })

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('v_formulario')
        .select('id,criado_em,vendedor_nome,Marca,Modelo,Cidade,status,Valor_Total,id_fabrica_ref')
        .is('deleted_at', null)
      setCards(data || [])
      setLoading(false)
    })()
  }, [])

  const filtrados = useMemo(() => {
    const j = JANELAS.find(x => x.k === janela)
    if (!j?.dias) return cards
    const limite = Date.now() - j.dias * 86400000
    return cards.filter(c => c.criado_em && new Date(c.criado_em).getTime() >= limite)
  }, [cards, janela])

  const grupos = useMemo(() => {
    const map = new Map()
    for (const c of filtrados) {
      const chave = (c[dim] ?? '').toString().trim() || '(vazio)'
      let g = map.get(chave)
      if (!g) { g = { chave, n: 0, valor: 0, aberto: 0, vendido: 0, perdido: 0 }; map.set(chave, g) }
      g.n++
      g.valor += parseValor(c.Valor_Total)
      if (STATUS_ABERTO.includes(c.status)) g.aberto++
      else if (c.status === STATUS_VENDIDO) g.vendido++
      else if (c.status === STATUS_PERDIDO) g.perdido++
    }
    return [...map.values()]
  }, [filtrados, dim])

  const ordenados = useMemo(() => {
    const getters = { chave: g => g.chave.toLowerCase(), n: g => g.n, valor: g => g.valor, aberto: g => g.aberto, vendido: g => g.vendido, perdido: g => g.perdido }
    const get = getters[sort.key] || (() => 0)
    return [...grupos].sort((a, b) => {
      const va = get(a), vb = get(b)
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [grupos, sort])

  // KPIs do período (independem do agrupamento). "Feito em fábrica" = proposta com pedido vinculado.
  const kpis = useMemo(() => {
    const a = { totN: 0, totV: 0, vendN: 0, vendV: 0, fabN: 0, fabV: 0, perdN: 0, perdV: 0 }
    for (const c of filtrados) {
      const v = parseValor(c.Valor_Total)
      a.totN++; a.totV += v
      if (c.status === STATUS_VENDIDO) { a.vendN++; a.vendV += v }
      if (c.status === STATUS_PERDIDO) { a.perdN++; a.perdV += v }
      if (c.id_fabrica_ref) { a.fabN++; a.fabV += v }
    }
    return a
  }, [filtrados])

  const tot = useMemo(() => grupos.reduce((t, g) => ({
    n: t.n + g.n, valor: t.valor + g.valor, aberto: t.aberto + g.aberto, vendido: t.vendido + g.vendido, perdido: t.perdido + g.perdido,
  }), { n: 0, valor: 0, aberto: 0, vendido: 0, perdido: 0 }), [grupos])

  const toggleSort = (k) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })
  const dimLabel = DIMS.find(d => d.k === dim)?.label

  const Th = ({ k, label, align = 'left' }) => {
    const active = sort.key === k
    return (
      <th onClick={() => toggleSort(k)} className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-3 text-xs font-bold uppercase tracking-wide cursor-pointer select-none ${active ? 'text-red-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>{label}{active && <span className="text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>}</span>
      </th>
    )
  }

  const btn = (active) => `px-4 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${active ? 'bg-red-600 text-white border-red-600' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`

  const Card = ({ titulo, n, valor, cor, bg }) => (
    <div className={`border border-zinc-200 rounded-xl p-4 ${bg}`}>
      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">{titulo}</div>
      <div className={`text-2xl font-bold mt-1 ${cor}`}>R$ {formatBRL(valor)}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{n} proposta{n !== 1 ? 's' : ''}</div>
    </div>
  )

  return (
    <div className="w-full">
      {/* PRÉ-CONFIGURAÇÕES */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide mr-1">Período:</span>
          {JANELAS.map(j => <button key={j.k} onClick={() => setJanela(j.k)} className={btn(janela === j.k)}>{j.label}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide mr-1">Agrupar por:</span>
          {DIMS.map(d => <button key={d.k} onClick={() => setDim(d.k)} className={`${btn(dim === d.k)} inline-flex items-center gap-1.5`}><d.Icon size={14} /> {d.label}</button>)}
        </div>
      </div>

      {/* KPIs DO PERÍODO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card titulo="No período" n={kpis.totN} valor={kpis.totV} cor="text-zinc-800" bg="bg-white" />
        <Card titulo="Concluído (vendido)" n={kpis.vendN} valor={kpis.vendV} cor="text-emerald-600" bg="bg-emerald-50/50" />
        <Card titulo="Feito em fábrica" n={kpis.fabN} valor={kpis.fabV} cor="text-blue-600" bg="bg-blue-50/50" />
        <Card titulo="Concluído sem sucesso" n={kpis.perdN} valor={kpis.perdV} cor="text-zinc-500" bg="bg-zinc-50" />
      </div>

      {/* TABELA AGREGADA */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-zinc-200">
              <Th k="chave" label={dimLabel} />
              <Th k="n" label="Propostas" align="right" />
              <Th k="valor" label="Valor total" align="right" />
              <Th k="aberto" label="Em aberto" align="right" />
              <Th k="vendido" label="Vendidas" align="right" />
              <Th k="perdido" label="Perdidas" align="right" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-zinc-400">Carregando...</td></tr>
            ) : ordenados.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-zinc-400">Nenhuma proposta no período</td></tr>
            ) : ordenados.map(g => (
              <tr key={g.chave} className="border-b border-zinc-100 hover:bg-red-50/40">
                <td className="px-4 py-3 text-sm font-semibold text-zinc-800">{g.chave}</td>
                <td className="px-4 py-3 text-sm text-right font-bold text-zinc-700">{g.n}</td>
                <td className="px-4 py-3 text-sm text-right font-bold text-red-600">R$ {formatBRL(g.valor)}</td>
                <td className="px-4 py-3 text-sm text-right text-amber-600">{g.aberto}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{g.vendido}</td>
                <td className="px-4 py-3 text-sm text-right text-zinc-400">{g.perdido}</td>
              </tr>
            ))}
          </tbody>
          {!loading && ordenados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-bold">
                <td className="px-4 py-3 text-sm text-zinc-800">TOTAL ({ordenados.length} {dimLabel?.toLowerCase()}s)</td>
                <td className="px-4 py-3 text-sm text-right text-zinc-800">{tot.n}</td>
                <td className="px-4 py-3 text-sm text-right text-red-600">R$ {formatBRL(tot.valor)}</td>
                <td className="px-4 py-3 text-sm text-right text-amber-600">{tot.aberto}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{tot.vendido}</td>
                <td className="px-4 py-3 text-sm text-right text-zinc-400">{tot.perdido}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
