'use client'
// Aba "Autorizações" da Visão da empresa (José, 17/11/2026): tudo que espera o Diretor (ou um Dev),
// por setor e assunto. Requisição de R$ 200 ou mais decide aqui mesmo; comissões, fichas e compras
// abrem a janela/tela que já existe para decidir. O limite da requisição é editável no fim.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'

type Item = {
  fonte: 'requisicao' | 'comissao' | 'ficha' | 'compra'
  id: string; setor: string; assunto: string; titulo: string; detalhe: string
  valor: number | null; pedido_por: string | null; pedido_em: string | null; link: string; decideAqui: boolean
  extra?: { motivo?: string | null; status?: string; para?: string[] }
}
type Regra = { assunto: string; titulo: string; limite: number; ativo: boolean; atualizado_por: string | null; atualizado_em: string }
type Decidida = { id: number; titulo: string; valor_despeza: string; autorizacao_status: string; autorizacao_valor: number | null; autorizacao_por: string | null; autorizacao_em: string | null; autorizacao_obs: string | null }
export type Resp = { itens: Item[]; regras: Regra[]; decididas: Decidida[]; avisos: string[]; migracaoFaltando?: boolean; podeMudarLimite?: boolean; error?: string }

const COR: Record<Item['fonte'], string> = { requisicao: '#EA580C', comissao: '#0D9488', ficha: '#7C3AED', compra: '#2563EB' }
const ICONE: Record<Item['fonte'], string> = { requisicao: 'fa-clipboard-list', comissao: 'fa-hand-holding-dollar', ficha: 'fa-id-card', compra: 'fa-cart-shopping' }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function haQuanto(iso: string | null) {
  if (!iso) return ''
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24); return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** número de pendentes (para o cartão da capa e a lista lateral) */
export function useContaAutorizacoes() {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    const ler = async () => {
      try {
        const r = await fetch('/api/autorizacoes', { headers: await authHeaders() })
        if (!r.ok) { if (vivo) setN(null); return }
        const j = await r.json() as Resp
        if (vivo) setN(j.itens.length)
      } catch { /* sem rede */ }
    }
    void ler()
    const t = setInterval(ler, 60000)
    const f = () => void ler()
    window.addEventListener('autorizacao-decidida', f)
    return () => { vivo = false; clearInterval(t); window.removeEventListener('autorizacao-decidida', f) }
  }, [])
  return n
}

/** exemplo = dados fixos (só para mostrar a tela sem banco; nada é gravado) */
export function PainelAutorizacoes({ exemplo }: { exemplo?: Resp } = {}) {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<string>('todos')
  const [recusando, setRecusando] = useState<string | null>(null)
  const [obs, setObs] = useState('')
  const [gravando, setGravando] = useState<string | null>(null)
  const [limite, setLimite] = useState('')
  const [salvandoRegra, setSalvandoRegra] = useState(false)

  const carregar = useCallback(async () => {
    if (exemplo) { setD(exemplo); setLimite(String(exemplo.regras[0]?.limite ?? '')); return }
    try {
      const r = await fetch('/api/autorizacoes', { headers: await authHeaders() })
      const j = await r.json() as Resp
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); return }
      setErro(''); setD(j)
      const rg = j.regras.find((x) => x.assunto === 'requisicao_compra')
      if (rg) setLimite((v) => v || String(rg.limite).replace('.', ','))
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }, [exemplo])
  useEffect(() => { void Promise.resolve().then(carregar); const t = setInterval(carregar, 30000); return () => clearInterval(t) }, [carregar])

  const setores = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of d?.itens || []) { const s = it.setor.split(' · ')[0]; m.set(s, (m.get(s) || 0) + 1) }
    return [...m.entries()]
  }, [d])
  const grupos = useMemo(() => {
    const lista = (d?.itens || []).filter((it) => filtro === 'todos' || it.setor.split(' · ')[0] === filtro)
    const m = new Map<string, Item[]>()
    for (const it of lista) { const k = `${it.setor.split(' · ')[0]} › ${it.assunto}`; m.set(k, [...(m.get(k) || []), it]) }
    return [...m.entries()]
  }, [d, filtro])

  const decidir = async (it: Item, acao: 'autorizar' | 'recusar') => {
    if (exemplo) { alert(`(exemplo) ${acao === 'autorizar' ? 'Autorizaria' : 'Recusaria'} ${it.titulo}`); return }
    if (acao === 'recusar' && !obs.trim()) return
    setGravando(it.id)
    try {
      const r = await fetch('/api/autorizacoes/requisicao', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(it.id), acao, obs }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { alert(j.error || 'Não deu para gravar.'); return }
      setRecusando(null); setObs('')
      window.dispatchEvent(new Event('autorizacao-decidida'))
      await carregar()
    } finally { setGravando(null) }
  }

  const salvarLimite = async () => {
    const rg = d?.regras.find((x) => x.assunto === 'requisicao_compra'); if (!rg) return
    const v = Number(limite.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) { alert('Valor inválido'); return }
    setSalvandoRegra(true)
    try {
      const r = await fetch('/api/autorizacoes/regra', { method: 'PUT', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ assunto: rg.assunto, limite: v, ativo: rg.ativo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) alert(j.error || 'Não deu para salvar.'); else await carregar()
    } finally { setSalvandoRegra(false) }
  }
  const alternarRegra = async (rg: Regra) => {
    const r = await fetch('/api/autorizacoes/regra', { method: 'PUT', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ assunto: rg.assunto, limite: rg.limite, ativo: !rg.ativo }) })
    if (r.ok) await carregar()
  }

  if (erro) return <div className="p-6 text-[15px] text-zinc-700">{erro}</div>
  if (!d) return <div className="p-6 text-zinc-500">Carregando autorizações…</div>
  const regraReq = d.regras.find((x) => x.assunto === 'requisicao_compra')

  return (
    <div className="p-3 md:p-5 flex flex-col gap-4 min-w-0 max-w-full overflow-x-hidden">
      {d.avisos.map((a) => <div key={a} className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[13.5px] px-4 py-2.5">{a}</div>)}

      {/* título = conclusão */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[20px] font-medium text-zinc-900 mr-2">
          {d.itens.length ? `${d.itens.length} ${d.itens.length === 1 ? 'pedido espera' : 'pedidos esperam'} a sua autorização` : 'Nada esperando autorização'}
        </h2>
        {setores.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto max-w-full min-w-0 pb-1">
            {[['todos', d.itens.length] as [string, number], ...setores].map(([s, n]) => (
              <button key={s} onClick={() => setFiltro(s)}
                className={`h-9 px-3 rounded-full border text-[13px] whitespace-nowrap ${filtro === s ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'}`}>
                {s === 'todos' ? 'Todos' : s} <b className="ml-1">{n}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      {!d.itens.length && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-5 py-6 text-[15px]">✓ Tudo em dia. Quando alguém pedir, aparece aqui e no sino.</div>}

      {grupos.map(([nome, itens]) => (
        <section key={nome} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden min-w-0">
          <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 border-b border-zinc-100">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: COR[itens[0].fonte] }}><i className={`fas ${ICONE[itens[0].fonte]}`} /></span>
            <span className="text-[15px] font-medium text-zinc-900 flex-1 min-w-0">{nome}</span>
            <span className="text-[13px] text-zinc-500 w-full sm:w-auto pl-[42px] sm:pl-0">{itens.length} {itens.length === 1 ? 'pedido' : 'pedidos'}{itens.some((i) => i.valor) ? ` · ${brl(itens.reduce((s, i) => s + (i.valor || 0), 0))}` : ''}</span>
          </header>
          <ul className="divide-y divide-zinc-100">
            {itens.map((it) => (
              <li key={it.fonte + it.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] text-zinc-900 truncate">{it.titulo}</div>
                  <div className="text-[12.5px] text-zinc-500 md:truncate">
                    {[it.detalhe, it.pedido_por ? `pedido por ${it.pedido_por}` : '', haQuanto(it.pedido_em)].filter(Boolean).join(' · ')}
                  </div>
                  {it.extra?.motivo && <div className="text-[12.5px] text-zinc-700 mt-0.5">“{it.extra.motivo}”</div>}
                  {it.fonte === 'requisicao' && <div className="text-[12px] text-zinc-500 mt-0.5">Pedido para: {it.extra?.para?.length ? it.extra.para.join(', ') : 'todos que autorizam'}</div>}
                </div>
                {it.valor != null && <div className="text-[16px] font-semibold text-zinc-900 md:w-32 md:text-right">{brl(it.valor)}</div>}
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {it.decideAqui ? (
                    recusando === it.id ? (
                      <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <input autoFocus value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Motivo da recusa"
                          className="h-10 px-3 rounded-lg border border-zinc-300 text-[14px] flex-1 md:w-56 min-w-0" />
                        <button disabled={!obs.trim() || gravando === it.id} onClick={() => decidir(it, 'recusar')} className="h-10 px-3 rounded-lg bg-red-600 text-white text-[13.5px] disabled:opacity-50">Recusar</button>
                        <button onClick={() => { setRecusando(null); setObs('') }} className="h-10 px-3 rounded-lg border border-zinc-200 text-[13.5px]">Voltar</button>
                      </div>
                    ) : (<>
                      <a href={it.link} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-lg border border-zinc-200 text-[13.5px] text-zinc-700 flex items-center gap-1.5 hover:border-zinc-400"><i className="fas fa-up-right-from-square text-[11px]" /> Ver</a>
                      <button onClick={() => { setRecusando(it.id); setObs('') }} className="h-10 px-3 rounded-lg border border-red-200 text-red-700 text-[13.5px] hover:bg-red-50">Recusar</button>
                      <button disabled={gravando === it.id} onClick={() => decidir(it, 'autorizar')} className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-[13.5px] font-medium hover:bg-emerald-500 disabled:opacity-60">
                        {gravando === it.id ? 'Gravando…' : 'Autorizar'}
                      </button>
                    </>)
                  ) : (
                    <button onClick={() => window.location.assign(it.link)} className="h-10 px-4 rounded-lg text-white text-[13.5px] font-medium" style={{ background: COR[it.fonte] }}>Abrir para decidir</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* regra da requisição */}
      {regraReq && d.podeMudarLimite && (
        <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 flex flex-wrap items-center gap-3 min-w-0">
          <span className="text-[14px] text-zinc-800">Requisição precisa de autorização a partir de</span>
          <span className="flex items-center gap-1 h-10 px-3 rounded-lg border border-zinc-300 bg-white">
            <span className="text-zinc-500 text-[14px]">R$</span>
            <input value={limite} onChange={(e) => setLimite(e.target.value)} inputMode="decimal" className="w-20 outline-none text-[14px]" />
          </span>
          <button onClick={salvarLimite} disabled={salvandoRegra} className="h-10 px-3 rounded-lg border border-zinc-300 text-[13.5px] hover:border-zinc-500 disabled:opacity-60">Salvar</button>
          <button onClick={() => alternarRegra(regraReq)} className={`h-10 px-3 rounded-lg text-[13.5px] border ${regraReq.ativo ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-zinc-300 text-zinc-600'}`}>
            {regraReq.ativo ? 'Ligada' : 'Desligada'}
          </button>
          {regraReq.atualizado_por && <span className="text-[12px] text-zinc-500">mudou por último: {regraReq.atualizado_por}</span>}
        </section>
      )}

      {d.decididas.length > 0 && (
        <details className="rounded-2xl border border-zinc-200 bg-white">
          <summary className="px-4 py-3 cursor-pointer text-[14px] text-zinc-700 select-none">Requisições decididas por último ({d.decididas.length})</summary>
          <ul className="divide-y divide-zinc-100">
            {d.decididas.map((x) => (
              <li key={x.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                <span className={`px-2 py-0.5 rounded-full text-[12px] ${x.autorizacao_status === 'autorizada' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{x.autorizacao_status === 'autorizada' ? 'Autorizada' : 'Recusada'}</span>
                <a href={`/requisicoes?req=${x.id}`} target="_blank" rel="noreferrer" className="text-zinc-900 hover:underline flex-1 min-w-0 truncate">#{x.id} {x.titulo}</a>
                <span className="text-zinc-500">{x.autorizacao_por} · {x.autorizacao_em ? new Date(x.autorizacao_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                {x.autorizacao_obs && <span className="w-full text-zinc-600 text-[12.5px]">“{x.autorizacao_obs}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
