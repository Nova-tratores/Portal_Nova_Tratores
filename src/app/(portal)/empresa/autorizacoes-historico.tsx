'use client'
// Histórico da aba Autorizações (José, 19/11/2026): o que aquela pessoa autorizou, recusou ou devolveu.
// Blocos por assunto no topo (Requisições, Comissões, Fichas, Compras); clicando, mostra só aquele, com um bloco por mês.
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
        {/* 1ª linha: o quê (e o valor, no celular) */}
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-[15px] font-medium text-zinc-900 truncate flex-1 min-w-0">{it.titulo}</span>
          {it.valor != null && <span className="md:hidden text-[15px] font-semibold text-zinc-900 shrink-0">{brl(it.valor)}</span>}
        </div>
        {/* 2ª linha: detalhe do pedido (setor, tipo, fornecedor…) */}
        {it.detalhe && <div className="text-[12.5px] text-zinc-500 mt-0.5 truncate">{it.detalhe}</div>}
        {/* 3ª linha: a decisão — resultado, quem e quando */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1.5 text-[12.5px] text-zinc-600">
          <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-medium ${selo.cls}`}>{selo.txt}</span>
          {it.por && <span>por <b className="font-medium text-zinc-800">{it.por}</b></span>}
          {it.decidido_em && <span className="text-zinc-500">em {quando(it.decidido_em)}</span>}
        </div>
        {it.obs && <div className="text-[12.5px] text-zinc-700 mt-1 pl-2 border-l-2 border-zinc-200">“{it.obs}”</div>}
      </div>
      {it.valor != null && <div className="hidden md:block text-[15px] font-semibold text-zinc-900 md:w-32 md:text-right">{brl(it.valor)}</div>}
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
function Meses({ lista, vazio, cor }: { lista: ItemHistorico[]; vazio: string; cor: string }) {
  const meses = porMes(lista)
  if (!meses.length) return <div className="px-4 py-4 text-[13.5px] text-zinc-500">{vazio}</div>
  return (
    <div className="flex flex-col gap-3 p-3">
      {meses.map(([mes, itens], i) => {
        const tot = totalAutorizado(itens)
        return (
          <details key={mes} open={i === 0} className="group rounded-xl border border-zinc-200 overflow-hidden">
            {/* o mês em destaque (José, 24/11): faixa colorida com o nome grande e o total à direita */}
            <summary className="list-none [&::-webkit-details-marker]:hidden px-4 py-3 cursor-pointer select-none flex flex-wrap items-center gap-x-3 gap-y-1 hover:brightness-[0.98]"
              style={{ background: `${cor}14`, borderLeft: `4px solid ${cor}` }}>
              <i className="fas fa-chevron-right text-[11px] transition-transform group-open:rotate-90" style={{ color: cor }} />
              <i className="far fa-calendar text-[15px]" style={{ color: cor }} />
              <span className="text-[17px] font-semibold text-zinc-900">{mesTxt(mes)}</span>
              <span className="text-[13px] text-zinc-600">{itens.length} {itens.length === 1 ? 'decisão' : 'decisões'}</span>
              {tot > 0 && <span className="ml-auto text-[15px] font-semibold text-zinc-900">{brl(tot)} <span className="text-[12.5px] font-normal text-zinc-500">autorizados</span></span>}
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
  const [bloco, setBloco] = useState<Fonte | null>(null)

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
  const visiveis = CARTOES.filter((c) => d.completo || !c.soCompleto)
  // bloco aberto: o que a pessoa clicou; se não clicou, o primeiro que tem alguma decisão
  const blocoAtivo: Fonte = bloco && visiveis.some((c) => c.fonte === bloco) ? bloco
    : (visiveis.find((c) => porFonte.get(c.fonte)?.length) || visiveis[0]).fonte
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

      {/* blocos por assunto (José, 24/11/2026): clica no bloco e aparece só o histórico dele */}
      <div className={`grid gap-3 grid-cols-2 ${visiveis.length > 2 ? 'md:grid-cols-4' : ''}`}>
        {visiveis.map((c) => {
          const lista = porFonte.get(c.fonte) || []
          const tot = totalAutorizado(lista)
          const nRec = lista.filter((i) => i.resultado !== 'autorizada').length
          const on = c.fonte === blocoAtivo
          return (
            <button key={c.fonte} onClick={() => setBloco(c.fonte)}
              className={`text-left rounded-2xl border-2 bg-white p-3.5 flex flex-col gap-1.5 min-w-0 transition-colors ${on ? '' : 'border-zinc-200 hover:border-zinc-300'}`}
              style={on ? { borderColor: c.cor, background: `${c.cor}0D` } : undefined}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white" style={{ background: c.cor }}><i className={`fas ${c.icone}`} /></span>
                <span className="text-[14px] font-medium text-zinc-900 truncate">{c.nome}</span>
              </span>
              <span className="text-[22px] font-semibold text-zinc-900 leading-none mt-1">{lista.length}</span>
              <span className="text-[12.5px] text-zinc-500">
                {lista.length === 1 ? 'decisão' : 'decisões'}{tot ? ` · ${brl(tot)}` : ''}{nRec ? ` · ${nRec} sem autorizar` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {visiveis.filter((c) => c.fonte === blocoAtivo).map((c) => {
        const lista = porFonte.get(c.fonte) || []
        return (
          <section key={c.fonte} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden min-w-0" style={{ borderTop: `3px solid ${c.cor}` }}>
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
                      <Meses lista={doSetor} cor={c.cor} vazio={s === 'Comercial'
                        ? 'A comissão do Comercial ainda não passa por autorização no portal.'
                        : 'Nenhuma comissão do Pós-Vendas decidida ainda.'} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <Meses lista={lista} cor={c.cor} vazio="Nada decidido aqui ainda." />
            )}
          </section>
        )
      })}
    </div>
  )
}
