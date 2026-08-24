'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, X } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import MotivoPerdaModal, { STATUS_PERDIDO } from './MotivoPerdaModal'

// `nome` = valor real gravado no banco (não mexer). `label` = como aparece pro usuário (padronizado).
const COLUNAS = [
  { nome: 'Enviar Proposta', label: 'Enviar proposta', cor: 'bg-red-100 text-red-700' },
  { nome: 'AGUARDANDO RESPOSTA CLIENTE', label: 'Aguardando resposta cliente', cor: 'bg-amber-100 text-amber-700' },
  { nome: 'AGUARDANDO RESPOSTA BANCO', label: 'Aguardando resposta banco', cor: 'bg-violet-100 text-violet-700' },
  { nome: 'Concluida-Vendido', label: 'Concluída - vendido', cor: 'bg-emerald-100 text-emerald-700' },
  { nome: 'Concluida- Não vendido.', label: 'Concluída - não vendido', cor: 'bg-zinc-100 text-zinc-600' }
]

const statusLabel = (nome) => COLUNAS.find(c => c.nome === nome)?.label || nome

// Status considerados "em aberto" (não concluídos)
const STATUS_ABERTO = ['Enviar Proposta', 'AGUARDANDO RESPOSTA CLIENTE', 'AGUARDANDO RESPOSTA BANCO']

/**
 * Converte qualquer valor monetário para número.
 * Aceita: "15000", "15.000,00", "15000.50", "R$ 1.500", null, undefined, etc.
 */
function parseValor(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return val
  let str = String(val).replace(/[R$\s]/g, '').trim()
  // Se tem vírgula E ponto → formato BR "15.000,50" → remove pontos, troca vírgula
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  }
  // Se tem só vírgula → "1500,50" → troca vírgula por ponto
  else if (str.includes(',')) {
    str = str.replace(',', '.')
  }
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function formatBRL(val) {
  return parseValor(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Aging: "hoje" / "3 dias". Acima de 15 dias fica vermelho (proposta esquecida).
function agingTexto(dias) {
  const d = Number(dias)
  if (!Number.isFinite(d) || d <= 0) return 'hoje'
  return `${d} dia${d !== 1 ? 's' : ''}`
}
function agingCor(dias) {
  const d = Number(dias)
  if (d > 15) return 'text-red-600 font-bold'
  if (d > 7) return 'text-amber-600 font-semibold'
  return 'text-zinc-400'
}

// Termômetro (0-100). Se o usuário não definiu (null), usa a probabilidade da fase como padrão.
function termoValor(c) {
  if (c.termometro != null && c.termometro !== '') return Number(c.termometro)
  return Math.round((Number(c.probabilidade) || 0) * 100)
}
function termoCor(v) {
  if (v >= 60) return 'bg-emerald-500'
  if (v >= 30) return 'bg-amber-500'
  return 'bg-sky-500'
}
function fmtData(iso) {
  if (!iso) return '—'
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) }
  catch { return '—' }
}

// Barra de termômetro (% preenchido). Read-only no Kanban.
function TermoBar({ v }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div className={`h-full ${termoCor(v)}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
      <span className="text-xs font-semibold text-zinc-500 w-8 text-right">{v}%</span>
    </div>
  )
}

export default function Kanban({ onCardClick, onGerarRelatorio, modo = 'tabela' }) {
  const { log } = useAuditLog()
  const [cards, setCards] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [perda, setPerda] = useState(null)   // proposta sendo marcada como "não vendido"
  const [soFab, setSoFab] = useState(false)  // só propostas com pedido de fábrica (FAB)
  const [sort, setSort] = useState({ key: 'dias_na_fase', dir: 'desc' })   // default: mais parado primeiro

  const loadData = async () => {
    // Lê da view v_formulario (traz dias_na_fase/cores). Esconde a lixeira por deleted_at
    // (pega tanto o legado status='Lixeira' quanto o soft-delete novo). Ordena pelo mais parado.
    const { data } = await supabase.from('v_formulario').select('*')
      .is('deleted_at', null)
      .order('dias_na_fase', { ascending: false })
      .order('id', { ascending: false })
    setCards(data || [])
  }

  useEffect(() => { loadData() }, [])

  const updateStatus = async (id, newStatus, e) => {
    e.stopPropagation()
    const antigo = cards.find(c => c.id === id)
    if (antigo?.status === newStatus) return
    // "Não vendido" exige registrar o motivo — abre o modal em vez de gravar direto.
    if (newStatus === STATUS_PERDIDO) { setPerda(antigo); return }
    const { error } = await supabase.from('Formulario').update({ status: newStatus }).eq('id', id)
    if (!error) {
      log({ sistema: 'Proposta Comercial', acao: 'mover_status', entidade: 'proposta', entidade_id: String(id), entidade_label: antigo?.Cliente, detalhes: { de: statusLabel(antigo?.status), para: statusLabel(newStatus) } })
      loadData()
    }
  }

  // Confirmação do MotivoPerdaModal: o modal já gravou status+motivo; aqui só loga e recarrega.
  const onPerdaSalva = (patch, motivoNome) => {
    log({ sistema: 'Proposta Comercial', acao: 'mover_status', entidade: 'proposta', entidade_id: String(perda.id), entidade_label: perda?.Cliente, detalhes: { de: statusLabel(perda?.status), para: statusLabel(STATUS_PERDIDO), motivo: motivoNome } })
    setPerda(null)
    loadData()
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return cards.filter(c => {
      const campos = [
        c.Cliente, c.Marca, c.Modelo, `${c.Marca || ''} ${c.Modelo || ''}`, c.Cidade,
        String(c.id), formatBRL(c.Valor_Total), String(c.Valor_Total ?? ''),
        c.status, statusLabel(c.status), c.vendedor_nome,
      ]
      const matchBusca = !q || campos.some(v => (v || '').toString().toLowerCase().includes(q))
      const matchStatus = !filtroStatus || c.status === filtroStatus
      const matchFab = !soFab || !!c.id_fabrica_ref
      return matchBusca && matchStatus && matchFab
    })
  }, [cards, busca, filtroStatus, soFab])

  // Cards de resumo — SEMPRE sobre o que está filtrado na tabela (atualizam sozinhos).
  const resumo = useMemo(() => {
    const a = { criN: 0, criV: 0, fabN: 0, fabV: 0, bancoN: 0, bancoV: 0 }
    for (const c of filtradas) {
      const v = parseValor(c.Valor_Total)
      a.criN++; a.criV += v
      if (c.id_fabrica_ref) { a.fabN++; a.fabV += v }
      if (c.status === 'AGUARDANDO RESPOSTA BANCO') { a.bancoN++; a.bancoV += v }
    }
    return a
  }, [filtradas])

  // Ordenação clicável do cabeçalho (A-Z / Z-A). Cada coluna extrai um valor comparável.
  const sortGet = {
    id: c => Number(c.id) || 0,
    Cliente: c => (c.Cliente || '').toLowerCase(),
    vendedor_nome: c => (c.vendedor_nome || '').toLowerCase(),
    maquina: c => `${c.Marca || ''} ${c.Modelo || ''}`.trim().toLowerCase(),
    Cidade: c => (c.Cidade || '').toLowerCase(),
    valor: c => parseValor(c.Valor_Total),
    status: c => statusLabel(c.status).toLowerCase(),
    dias_na_fase: c => Number(c.dias_na_fase) || 0,
    termometro: c => termoValor(c),
    criado_em: c => c.criado_em ? new Date(c.criado_em).getTime() : 0,
  }
  const toggleSort = (k) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })

  const ordenadas = useMemo(() => {
    const get = sortGet[sort.key] || (() => 0)
    return [...filtradas].sort((a, b) => {
      const va = get(a), vb = get(b)
      const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtradas, sort])

  // Cabeçalho clicável com seta ▲/▼.
  const Th = ({ k, label, className }) => {
    const active = sort.key === k
    return (
      <th className={`${className} cursor-pointer select-none ${active ? '!text-red-600' : 'hover:text-zinc-700'}`} onClick={() => toggleSort(k)}>
        <span className="inline-flex items-center gap-1">{label}{active && <span className="text-[10px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>}</span>
      </th>
    )
  }

  const getStatusStyle = (status) => {
    const col = COLUNAS.find(c => c.nome === status)
    return col?.cor || 'bg-zinc-100 text-zinc-600'
  }

  const filterInputStyle = "w-full bg-zinc-100/50 text-zinc-700 text-base rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 transition-all placeholder:text-zinc-400 border border-zinc-200"

  const chipCls = (active, tone = 'red') => `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${active ? (tone === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600') : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`
  // Card de resumo clicável (também serve de atalho de filtro).
  const ResumoCard = ({ titulo, n, valor, onClick, cor, ativo }) => (
    <button onClick={onClick} className={`text-left border rounded-xl p-4 transition-all cursor-pointer bg-white ${ativo ? 'border-red-400 ring-2 ring-red-100' : 'border-zinc-200 hover:border-zinc-300'}`}>
      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">{titulo}</div>
      <div className={`text-xl font-bold mt-1 ${cor}`}>R$ {formatBRL(valor)}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{n} proposta{n !== 1 ? 's' : ''}</div>
    </button>
  )

  return (
    <div className="w-full">
      {/* BUSCA — filtra por qualquer campo */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-4">
        <label className="block text-xs font-semibold text-zinc-500 mb-2">Filtrar por cliente, ID, marca, modelo, cidade, valor ou status</label>
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none" />
            <input type="text" placeholder="Digite cliente, ID, marca, modelo, cidade, valor ou status..." value={busca} onChange={e => setBusca(e.target.value)} className={`${filterInputStyle} pl-9`} />
          </div>
          {(busca || filtroStatus || soFab) && (
            <button onClick={() => { setBusca(''); setFiltroStatus(''); setSoFab(false) }} className="px-4 py-2.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-semibold tracking-wide transition-colors flex items-center gap-2 whitespace-nowrap">
              <X size={14} /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ATALHOS RÁPIDOS — configuram os filtros da tabela */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mr-1">Atalhos:</span>
        <button onClick={() => { setFiltroStatus(''); setSoFab(false) }} className={chipCls(!filtroStatus && !soFab)}>Todas</button>
        {COLUNAS.map(c => <button key={c.nome} onClick={() => setFiltroStatus(filtroStatus === c.nome ? '' : c.nome)} className={chipCls(filtroStatus === c.nome)}>{c.label}</button>)}
        <button onClick={() => setSoFab(v => !v)} className={chipCls(soFab, 'emerald')}>FAB (pedido fábrica)</button>
      </div>

      {/* CARDS DE RESUMO — sempre sobre o que está filtrado; clicar aplica o filtro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <ResumoCard titulo="Criadas (no filtro)" n={resumo.criN} valor={resumo.criV} cor="text-zinc-800"
          ativo={!filtroStatus && !soFab} onClick={() => { setFiltroStatus(''); setSoFab(false) }} />
        <ResumoCard titulo="Previsão faturamento fábrica" n={resumo.fabN} valor={resumo.fabV} cor="text-blue-600"
          ativo={soFab} onClick={() => setSoFab(v => !v)} />
        <ResumoCard titulo="Aguardando banco" n={resumo.bancoN} valor={resumo.bancoV} cor="text-violet-600"
          ativo={filtroStatus === 'AGUARDANDO RESPOSTA BANCO'} onClick={() => setFiltroStatus(filtroStatus === 'AGUARDANDO RESPOSTA BANCO' ? '' : 'AGUARDANDO RESPOSTA BANCO')} />
      </div>

      {modo === 'kanban' ? (
        /* VISÃO KANBAN */
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUNAS.map(col => {
            const doStatus = filtradas.filter(c => c.status === col.nome)
            return (
              <div key={col.nome} className="flex-1 min-w-[260px]">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-md ${col.cor}`}>{col.label}</span>
                  <span className="text-sm font-bold text-zinc-400">{doStatus.length}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {doStatus.map(card => (
                    <div key={card.id} onClick={() => onCardClick(card)} className="bg-white border border-zinc-200 rounded-xl p-3.5 cursor-pointer hover:border-red-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-zinc-700 flex items-center gap-1.5">#{card.id}{card.id_fabrica_ref && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">FAB</span>}</span>
                        <span className="text-base font-bold text-red-600">R$ {formatBRL(card.Valor_Total)}</span>
                      </div>
                      <div className="text-base font-semibold text-zinc-800">{card.Cliente || 'Sem nome'}</div>
                      <div className="text-sm text-zinc-600 mt-0.5">{card.Marca} {card.Modelo}</div>
                      <div className="text-sm text-zinc-400">{card.Cidade || '---'}</div>
                      {card.vendedor_nome && <div className="text-xs text-zinc-500 mt-0.5">Vendedor: {card.vendedor_nome}</div>}
                      <div className="flex items-center justify-between mt-1">
                        <div className={`text-xs ${agingCor(card.dias_na_fase)}`}>parado há {agingTexto(card.dias_na_fase)}</div>
                        <div className="text-[11px] text-zinc-400">{fmtData(card.criado_em)}</div>
                      </div>
                      <div className="mt-1.5"><TermoBar v={termoValor(card)} /></div>
                      <select onClick={e => e.stopPropagation()} value={card.status} onChange={(e) => updateStatus(card.id, e.target.value, e)}
                        className="mt-2.5 w-full bg-zinc-50 border border-zinc-200 text-zinc-600 text-sm font-semibold p-2 rounded-md outline-none cursor-pointer focus:ring-2 focus:ring-red-500/40">
                        {COLUNAS.map(f => <option key={f.nome} value={f.nome}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                  {doStatus.length === 0 && <div className="text-center text-zinc-300 text-sm py-6 border border-dashed border-zinc-200 rounded-xl">Sem propostas</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* VISÃO LISTA */
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-zinc-200">
                <Th k="id" label="ID" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="Cliente" label="Cliente" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="vendedor_nome" label="Vendedor" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="maquina" label="Marca / Modelo" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="Cidade" label="Cidade" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="valor" label="Valor" className="text-right px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="status" label="Status" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="dias_na_fase" label="Parado há" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="termometro" label="Termômetro" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <Th k="criado_em" label="Criada em" className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide" />
                <th className="text-left px-5 py-4 text-sm font-bold text-zinc-500 tracking-wide w-[210px]">Alterar</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-zinc-400 text-base font-medium">Nenhuma proposta encontrada</td></tr>
              ) : (
                ordenadas.map(card => {
                  const isFromFactory = !!card.id_fabrica_ref
                  return (
                    <tr key={card.id} onClick={() => onCardClick(card)} className="border-b border-zinc-200 hover:bg-red-50/50 cursor-pointer transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-zinc-700">#{card.id}</span>
                          {isFromFactory && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">FAB</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-lg font-semibold text-zinc-800 group-hover:text-red-600 transition-colors">{card.Cliente || 'Sem nome'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-base text-zinc-600">{card.vendedor_nome || <span className="text-zinc-300">—</span>}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-base text-zinc-600">{card.Marca} {card.Modelo}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-base text-zinc-500">{card.Cidade || '---'}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-lg font-bold text-red-600">R$ {formatBRL(card.Valor_Total)}</span>
                        {isFromFactory && card.fabrica_custo != null && <div className="text-[11px] text-zinc-400">custo fáb: R$ {formatBRL(card.fabrica_custo)}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-md ${getStatusStyle(card.status)}`}>{statusLabel(card.status)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-sm ${agingCor(card.dias_na_fase)}`}>{agingTexto(card.dias_na_fase)}</span>
                      </td>
                      <td className="px-5 py-4"><TermoBar v={termoValor(card)} /></td>
                      <td className="px-5 py-4"><span className="text-sm text-zinc-500">{fmtData(card.criado_em)}</span></td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <select
                          className="w-full bg-zinc-50 border border-zinc-200 text-zinc-600 text-sm font-semibold p-2.5 rounded-md outline-none cursor-pointer focus:ring-2 focus:ring-red-500/40"
                          value={card.status}
                          onChange={(e) => updateStatus(card.id, e.target.value, e)}
                        >
                          {COLUNAS.map(f => <option key={f.nome} value={f.nome}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-right text-sm text-zinc-400 font-medium">{filtradas.length} proposta{filtradas.length !== 1 ? 's' : ''}</div>

      {perda && <MotivoPerdaModal proposta={perda} onClose={() => setPerda(null)} onSaved={onPerdaSalva} />}
    </div>
  )
}

// Exporta utilitários para uso no relatório
export { parseValor, formatBRL, STATUS_ABERTO }
