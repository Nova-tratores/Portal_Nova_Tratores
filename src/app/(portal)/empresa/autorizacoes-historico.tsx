'use client'
// Histórico da aba Autorizações (José, 19/11/2026): o que aquela pessoa autorizou, recusou ou devolveu.
// Um cartão por assunto (Requisições, Comissões, Fichas, Compras); dentro de cada cartão, um bloco por mês.
// Comissões ainda separam por setor (Pós-Vendas / Comercial) e trazem o documento da autorização (PDF)
// e as folhas assinadas pelo técnico (de acordo e recibo), quando já anexadas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { imprimirDoc, abrirAssinado } from '@/components/mecanicos/DeAcordoTecnico'
import type { ItemHistorico } from '@/lib/autorizacoes/historico'

type Resp = { alvo: { id: string; nome: string } | null; eu: string; pessoas: { id: string; nome: string }[]; itens: ItemHistorico[]; avisos: string[]; completo: boolean; error?: string }
type Fonte = ItemHistorico['fonte']

const CARTOES: { fonte: Fonte; nome: string; cor: string; icone: string; soCompleto: boolean }[] = [
  { fonte: 'requisicao', nome: 'Requisições', cor: '#EA580C', icone: 'fa-clipboard-list', soCompleto: false },
  { fonte: 'comissao', nome: 'Comissões', cor: '#0D9488', icone: 'fa-hand-holding-dollar', soCompleto: true },
  { fonte: 'ficha', nome: 'Fichas cadastrais', cor: '#7C3AED', icone: 'fa-id-card', soCompleto: true },
  { fonte: 'compra', nome: 'Solicitações de compra', cor: '#2563EB', icone: 'fa-cart-shopping', soCompleto: true },
]
const SETORES_COMISSAO = ['Pós-Vendas', 'Comercial'] as const

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const mesTxt = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}` : 'Sem data')
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const SELO: Record<ItemHistorico['resultado'], { txt: string; cls: string }> = {
  autorizada: { txt: 'Autorizada', cls: 'bg-emerald-50 text-emerald-700' },
  recusada: { txt: 'Recusada', cls: 'bg-red-50 text-red-700' },
  devolvida: { txt: 'Devolvida', cls: 'bg-amber-50 text-amber-800' },
}
/** total só do que foi autorizado (recusada/devolvida não sai dinheiro) */
const totalAutorizado = (l: ItemHistorico[]) => l.reduce((s, i) => s + (i.resultado === 'autorizada' ? i.valor || 0 : 0), 0)

/** agrupa por mês, do mais novo para o mais velho */
function porMes(lista: ItemHistorico[]): [string, ItemHistorico[]][] {
  const m = new Map<string, ItemHistorico[]>()
  for (const it of lista) m.set(it.mes, [...(m.get(it.mes) || []), it])
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

function Linha({ it }: { it: ItemHistorico }) {
  const selo = SELO[it.resultado]
  return (
    <li className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[12px] ${selo.cls}`}>{selo.txt}</span>
          <span className="text-[14.5px] text-zinc-900 truncate">{it.titulo}</span>
        </div>
        <div className="text-[12.5px] text-zinc-500 mt-0.5">
          {it.por && <span className="text-zinc-800 font-medium">por {it.por}</span>}
          {it.por && ' · '}
          {[quando(it.decidido_em), it.detalhe].filter(Boolean).join(' · ')}
        </div>
        {it.obs && <div className="text-[12.5px] text-zinc-700 mt-0.5">“{it.obs}”</div>}
      </div>
      {it.valor != null && <div className="text-[15px] font-semibold text-zinc-900 md:w-32 md:text-right">{brl(it.valor)}</div>}
      <div className="flex flex-wrap gap-2 md:justify-end">
        {it.docs?.autorizacao && (
          <button onClick={() => imprimirDoc(it.id, 'autorizacao')} className="h-9 px-3 rounded-lg bg-teal-600 text-white text-[13px] flex items-center gap-1.5 hover:bg-teal-500">
            <i className="fas fa-file-pdf text-[12px]" /> PDF da comissão
          </button>
        )}
        {it.docs?.ciencia && (
          <button onClick={() => abrirAssinado(it.id, 'ciencia')} className="h-9 px-3 rounded-lg border border-zinc-200 text-[13px] text-zinc-700 hover:border-zinc-400">De acordo assinado</button>
        )}
        {it.docs?.recibo && (
          <button onClick={() => abrirAssinado(it.id, 'recibo')} className="h-9 px-3 rounded-lg border border-zinc-200 text-[13px] text-zinc-700 hover:border-zinc-400">Recibo assinado</button>
        )}
        {it.link && (
          <a href={it.link} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-lg border border-zinc-200 text-[13px] text-zinc-700 flex items-center gap-1.5 hover:border-zinc-400">
            <i className="fas fa-up-right-from-square text-[11px]" /> Abrir
          </a>
        )}
      </div>
    </li>
  )
}

/** blocos por mês; o mais recente já vem aberto */
function Meses({ lista, vazio }: { lista: ItemHistorico[]; vazio: string }) {
  const meses = porMes(lista)
  if (!meses.length) return <div className="px-4 py-4 text-[13.5px] text-zinc-500">{vazio}</div>
  return (
    <div className="divide-y divide-zinc-100">
      {meses.map(([mes, itens], i) => {
        const tot = totalAutorizado(itens)
        return (
          <details key={mes} open={i === 0} className="group">
            <summary className="px-4 py-2.5 cursor-pointer select-none flex flex-wrap items-center gap-x-3 gap-y-0.5 bg-zinc-50/70 hover:bg-zinc-50">
              <i className="fas fa-chevron-right text-[10px] text-zinc-400 transition-transform group-open:rotate-90" />
              <span className="text-[14px] font-medium text-zinc-800">{mesTxt(mes)}</span>
              <span className="text-[12.5px] text-zinc-500">{itens.length} {itens.length === 1 ? 'decisão' : 'decisões'}{tot ? ` · ${brl(tot)} autorizados` : ''}</span>
            </summary>
            <ul className="divide-y divide-zinc-100">{itens.map((it) => <Linha key={it.fonte + it.id} it={it} />)}</ul>
          </details>
        )
      })}
    </div>
  )
}

export function HistoricoAutorizacoes() {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [de, setDe] = useState<string>('')
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async (quem: string) => {
    setCarregando(true)
    try {
      const r = await fetch(`/api/autorizacoes/historico${quem ? `?de=${encodeURIComponent(quem)}` : ''}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json() as Resp
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); return }
      setErro(''); setD(j)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(() => carregar(de)) }, [carregar, de])

  const porFonte = useMemo(() => {
    const m = new Map<Fonte, ItemHistorico[]>()
    for (const it of d?.itens || []) m.set(it.fonte, [...(m.get(it.fonte) || []), it])
    return m
  }, [d])

  if (erro) return <div className="p-2 text-[15px] text-zinc-700">{erro}</div>
  if (!d) return <div className="p-2 text-zinc-500">Carregando histórico…</div>
  const souEu = d.alvo?.id === d.eu
  const nAut = d.itens.filter((i) => i.resultado === 'autorizada').length

  return (
    <div className={`flex flex-col gap-4 min-w-0 ${carregando ? 'opacity-60' : ''}`}>
      {d.avisos.map((a) => <div key={a} className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[13.5px] px-4 py-2.5">{a}</div>)}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-medium text-zinc-900 mr-1">
          {!d.alvo ? 'Tudo que já foi decidido' : souEu ? 'O que você decidiu' : `O que ${d.alvo.nome.split(' ')[0]} decidiu`}
        </h2>
        <span className="text-[13.5px] text-zinc-500">{nAut} {nAut === 1 ? 'autorizada' : 'autorizadas'} · {brl(totalAutorizado(d.itens))}</span>
        {d.completo && (
          <label className="flex items-center gap-2 text-[13px] text-zinc-600 md:ml-auto">
            Quem decidiu
            <select value={de || 'todos'} onChange={(e) => setDe(e.target.value === 'todos' ? '' : e.target.value)}
              className="h-9 px-2 rounded-lg border border-zinc-300 bg-white text-[13.5px] text-zinc-800">
              <option value="todos">Todas as pessoas</option>
              {d.pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === d.eu ? `${p.nome} (você)` : p.nome}</option>)}
            </select>
          </label>
        )}
      </div>

      {CARTOES.filter((c) => d.completo || !c.soCompleto).map((c) => {
        const lista = porFonte.get(c.fonte) || []
        const tot = totalAutorizado(lista)
        return (
          <section key={c.fonte} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden min-w-0">
            <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 border-b border-zinc-100">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: c.cor }}><i className={`fas ${c.icone}`} /></span>
              <span className="text-[15px] font-medium text-zinc-900 flex-1 min-w-0">{c.nome}</span>
              <span className="text-[13px] text-zinc-500">{lista.length} {lista.length === 1 ? 'decisão' : 'decisões'}{tot ? ` · ${brl(tot)}` : ''}</span>
            </header>
            {c.fonte === 'comissao' ? (
              <div className="divide-y divide-zinc-200">
                {SETORES_COMISSAO.map((s) => {
                  const doSetor = lista.filter((i) => i.setor === s)
                  return (
                    <div key={s}>
                      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-wide text-teal-700">{s}</span>
                        {doSetor.length > 0 && <span className="text-[12.5px] text-zinc-500">{doSetor.length} · {brl(totalAutorizado(doSetor))}</span>}
                      </div>
                      <Meses lista={doSetor} vazio={s === 'Comercial'
                        ? 'A comissão do Comercial ainda não passa por autorização no portal.'
                        : 'Nenhuma comissão do Pós-Vendas decidida ainda.'} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Meses lista={lista} vazio="Nada decidido aqui ainda." />
            )}
          </section>
        )
      })}
    </div>
  )
}
