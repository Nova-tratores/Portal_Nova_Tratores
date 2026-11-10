'use client'
// Mudanças na ficha cadastral esperando o DIRETOR (José, 09/11/2026: "chega uma notificação para o
// Diretor da Empresa, explicando o que está mudando ou atualizando, e quem está fazendo isso, deixa
// tudo muito claro e simples, e após ele autorizar, aí muda, no mesmo esquema de autorizar a comissão").
// Mesmo desenho do AvisoComissoesDiretor: cai na cara dele em qualquer tela, "lembrar depois" com
// tempo, atalho na doca da dashboard e o link do sino (?fichas=1) abre direto. Pedido novo derruba o adiamento.
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { DOCA_ID } from '@/components/dashboard/AtalhosDashboard'
import { ListaMudancas } from './FichaCadastral'
import type { Mudanca } from '@/lib/admin/ficha-cadastral'

interface Pedido { id: number; user_id: string; user_nome: string | null; pedido_por: string; pedido_por_nome: string | null; mudancas: Mudanca[]; criado_em: string; atualizado_em: string }
interface Adiado { ate: number; ids: number[] }

const CHAVE = 'fichas-diretor-lembrar'
const lerAdiado = (): Adiado | null => { try { const v = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return v && typeof v.ate === 'number' ? v : null } catch { return null } }
const gravarAdiado = (v: Adiado | null) => { try { if (v) localStorage.setItem(CHAVE, JSON.stringify(v)); else localStorage.removeItem(CHAVE) } catch { /* sem armazenamento: o aviso só volta mais cedo */ } }
const nomeCurto = (n?: string | null) => String(n || 'Alguém').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).split(' ').slice(0, 2).join(' ')
const RAPIDOS: { rot: string; min: number }[] = [{ rot: '15 min', min: 15 }, { rot: '30 min', min: 30 }, { rot: '1 hora', min: 60 }, { rot: '2 horas', min: 120 }, { rot: '4 horas', min: 240 }]
function haQuanto(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function AvisoFichasDiretor() {
  const pathname = usePathname()
  const [pend, setPend] = useState<Pedido[]>([])
  const [adiado, setAdiado] = useState<Adiado | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [aberto, setAberto] = useState(false)
  const [idx, setIdx] = useState(0)
  const [lembrar, setLembrar] = useState(false)
  const [qtd, setQtd] = useState('1')
  const [unidade, setUnidade] = useState<'min' | 'h'>('h')
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/ficha-cadastral/pedidos', { headers: await authHeaders(), cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setPend(j.diretor && Array.isArray(j.pedidos) ? j.pedidos : [])
    } catch { /* fica quieto */ }
    setAgora(Date.now())
  }, [])
  useEffect(() => {
    void Promise.resolve().then(() => { setAdiado(lerAdiado()); void carregar() })
    const t = setInterval(() => { void carregar() }, 60_000)
    const f = () => { void carregar() }
    window.addEventListener('focus', f)
    window.addEventListener('ficha-pedido', f)
    return () => { clearInterval(t); window.removeEventListener('focus', f); window.removeEventListener('ficha-pedido', f) }
  }, [carregar])
  // link do sino (?fichas=1) abre direto
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('fichas') !== '1') return
    void Promise.resolve().then(() => setAberto(true))
  }, [pathname])

  const [doca, setDoca] = useState<HTMLElement | null>(null)
  const naDash = pathname === '/dashboard' || pathname === '/'
  useEffect(() => {
    if (!naDash) return
    let t: ReturnType<typeof setInterval> | null = null
    const achar = () => { const d = document.getElementById(DOCA_ID); if (d) setDoca(d); return !!d }
    void Promise.resolve().then(() => { if (!achar()) t = setInterval(() => { if (achar() && t) clearInterval(t) }, 300) })
    return () => { if (t) clearInterval(t); setDoca(null) }
  }, [naDash])

  const adiar = (min: number) => {
    if (!(min > 0)) return
    const v = { ate: Date.now() + min * 60_000, ids: pend.map((p) => p.id) }
    gravarAdiado(v); setAdiado(v); setLembrar(false); setAberto(false)
  }

  const decidir = async (p: Pedido, acao: 'autorizar' | 'recusar') => {
    setOcupado(true); setMsg('')
    try {
      const r = await fetch('/api/admin/ficha-cadastral/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: p.id, acao, motivo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error || 'Não deu certo'); return }
      setMsg(acao === 'autorizar' ? `Autorizado: a ficha de ${nomeCurto(p.user_nome)} foi atualizada${j.rh?.ok && j.rh.campos?.length ? ' e foi para o RH' : ''}.` : `Não autorizado. ${nomeCurto(p.pedido_por_nome)} foi avisado(a).`)
      setRecusando(false); setMotivo('')
      const resto = pend.filter((x) => x.id !== p.id)
      setPend(resto); setIdx(0)
      window.dispatchEvent(new Event('ficha-pedido'))
      if (!resto.length) setTimeout(() => { setAberto(false); setMsg('') }, 1800)
    } catch { setMsg('Sem conexão') } finally { setOcupado(false) }
  }

  if (!pend.length && !aberto) return null
  const novo = !adiado || pend.some((p) => !adiado.ids.includes(p.id))
  const mostrar = aberto || (pend.length > 0 && (novo || agora >= adiado!.ate))
  const p = pend[Math.min(idx, pend.length - 1)]
  const qtdNum = Math.max(0, Number(qtd.replace(',', '.')) || 0)
  const proprio = p && p.pedido_por === p.user_id

  return (
    <>
      <style>{ESTILO}</style>
      {mostrar && createPortal(
        <div className="afd-fundo" role="dialog" aria-modal="true" aria-label="Fichas cadastrais para autorizar">
          <div className="afd">
            <div className="afd-cab">
              <span className="afd-ic"><i className="fas fa-id-card" /></span>
              <button type="button" className="afd-x" aria-label="Fechar" onClick={() => { setAberto(false); if (!novo || pend.length) adiar(15) }}>×</button>
            </div>
            {!p ? (
              <><h2>Tudo autorizado</h2>{msg && <p className="afd-msg">{msg}</p>}</>
            ) : (
              <>
                <h2>{pend.length === 1 ? 'Uma ficha cadastral espera a sua autorização' : `${pend.length} fichas cadastrais esperam a sua autorização`}</h2>
                <p>
                  <b>{nomeCurto(p.pedido_por_nome)}</b> {proprio ? 'atualizou a própria ficha' : <>quer mudar a ficha de <b>{nomeCurto(p.user_nome)}</b></>} · {haQuanto(p.atualizado_em || p.criado_em)}.
                  {' '}Nada muda até você autorizar.
                </p>
                {pend.length > 1 && (
                  <div className="afd-nav">
                    {pend.map((x, i) => <button key={x.id} type="button" className={x.id === p.id ? 'on' : ''} onClick={() => { setIdx(i); setRecusando(false) }}>{nomeCurto(x.user_nome)}<em>{x.mudancas.length}</em></button>)}
                  </div>
                )}
                <div className="afd-lista"><ListaMudancas ms={p.mudancas} /></div>
                {msg && <p className="afd-msg">{msg}</p>}

                {lembrar ? (
                  <div className="afd-lem">
                    <b>Lembrar de novo daqui a quanto tempo?</b>
                    <div className="afd-rap">{RAPIDOS.map((r) => <button key={r.min} type="button" onClick={() => adiar(r.min)}>{r.rot}</button>)}</div>
                    <div className="afd-outro">
                      <span>ou daqui a</span>
                      <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" />
                      <select value={unidade} onChange={(e) => setUnidade(e.target.value as 'min' | 'h')} aria-label="Unidade"><option value="min">minutos</option><option value="h">horas</option></select>
                      <button type="button" className="afd-pri" disabled={!qtdNum} onClick={() => adiar(unidade === 'h' ? qtdNum * 60 : qtdNum)}>Lembrar</button>
                    </div>
                    <button type="button" className="afd-volta" onClick={() => setLembrar(false)}>voltar</button>
                  </div>
                ) : recusando ? (
                  <div className="afd-lem">
                    <b>Por que não autorizar? <small>(opcional — {nomeCurto(p.pedido_por_nome)} recebe o motivo)</small></b>
                    <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: confirmar o novo endereço com o comprovante" />
                    <div className="afd-bts">
                      <button type="button" className="afd-sec" onClick={() => setRecusando(false)}>Voltar</button>
                      <button type="button" className="afd-pri ver" disabled={ocupado} onClick={() => decidir(p, 'recusar')}>Não autorizar</button>
                    </div>
                  </div>
                ) : (
                  <div className="afd-bts">
                    <button type="button" className="afd-sec" onClick={() => setLembrar(true)}><i className="fas fa-clock" /> Lembrar depois</button>
                    <button type="button" className="afd-sec" disabled={ocupado} onClick={() => setRecusando(true)}>Não autorizar</button>
                    <button type="button" className="afd-pri" disabled={ocupado} onClick={() => decidir(p, 'autorizar')}>{ocupado ? 'Autorizando…' : 'Autorizar'}<span><i className="fas fa-check" /></span></button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>, document.body)}

      {naDash && doca && doca.isConnected && pend.length > 0 && createPortal(
        <div style={{ position: 'relative', order: -2, pointerEvents: 'auto' }}>
          <button type="button" className="afd-atalho" onClick={() => setAberto(true)} title={`${pend.length} ficha(s) cadastral(is) para autorizar`} aria-label="Fichas cadastrais para autorizar">
            <i className="fas fa-id-card" />
            <span>{pend.length}</span>
          </button>
        </div>, doca)}
    </>
  )
}

const ESTILO = `
.afd-fundo { position: fixed; inset: 0; z-index: 9240; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: afdFade .2s both }
@keyframes afdFade { from { opacity: 0 } to { opacity: 1 } }
.afd { width: min(620px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border-radius: 20px; padding: 22px 24px; display: grid; gap: 12px; animation: afdSobe .25s ease both }
@keyframes afdSobe { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
.afd-cab { display: flex; justify-content: space-between; align-items: flex-start }
.afd-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: #fef2f2; color: #dc2626; font-size: 22px }
.afd-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; color: #64748b; font-size: 20px; cursor: pointer }
.afd h2 { margin: 0; font-size: 20px; font-weight: 600 } .afd > p { margin: 0; font-size: 14.5px; color: var(--portal-text-muted, #475569); line-height: 1.5 } .afd > p b { font-weight: 600; color: var(--portal-text, #0f172a) }
.afd-nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px } .afd-nav button { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 6px 12px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer }
.afd-nav button.on { background: #0f172a; border-color: #0f172a; color: #fefefe } .afd-nav em { font-style: normal; font-size: 11px; background: #fee2e2; color: #b91c1c; border-radius: 99px; padding: 0 7px } .afd-nav button.on em { background: #dc2626; color: #fefefe }
.afd-lista { max-height: 42vh; overflow: auto }
.afd-msg { margin: 0 !important; font-size: 13.5px !important; color: #047857 !important; background: #ecfdf5; border-radius: 10px; padding: 8px 12px }
.afd-bts { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px }
.afd-pri { display: inline-flex; align-items: center; gap: 10px; min-height: 42px; border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 10px 12px 10px 20px; font-family: inherit; font-size: 14.5px; cursor: pointer; transition: background .2s } .afd-pri:hover:not(:disabled) { background: #047857 } .afd-pri:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed }
.afd-pri.ver { padding: 10px 20px } .afd-pri.ver:hover:not(:disabled) { background: #b91c1c }
.afd-pri span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.16); font-size: 11px }
.afd-sec { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; color: var(--portal-text, #0f172a); border-radius: 99px; padding: 10px 18px; font-family: inherit; font-size: 14.5px; cursor: pointer } .afd-sec:hover { border-color: #94a3b8 }
.afd-lem { display: grid; gap: 10px; background: #f8fafc; border-radius: 14px; padding: 14px; color: #0f172a } .afd-lem > b { font-weight: 500; font-size: 14.5px } .afd-lem small { font-weight: 400; color: #64748b }
.afd-lem textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; resize: vertical; background: #fefefe; color: #0f172a }
.afd-rap { display: flex; gap: 6px; flex-wrap: wrap } .afd-rap button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 8px 14px; font-family: inherit; font-size: 14px; color: #0f172a; cursor: pointer } .afd-rap button:hover { border-color: #dc2626; color: #dc2626 }
.afd-outro { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; color: #475569 }
.afd-outro input { width: 64px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; text-align: center; background: #fefefe; color: #0f172a }
.afd-outro select { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; background: #fefefe; color: #0f172a } .afd-outro .afd-pri { padding: 9px 18px }
.afd-volta { justify-self: start; border: none; background: none; color: #64748b; font-family: inherit; font-size: 13.5px; cursor: pointer; padding: 2px 0 }
.afd-atalho { position: relative; width: 58px; height: 58px; border-radius: 50%; border: none; background: linear-gradient(135deg, #dc2626, #991b1b); color: #fefefe; font-size: 22px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 8px 24px rgba(220,38,38,.35) }
.afd-atalho span { position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #fefefe; color: #dc2626; font-size: 12px; font-weight: 700; display: grid; place-items: center; border: 2px solid #dc2626 }
@media (max-width: 560px) { .afd-fundo { padding: 0; place-items: stretch } .afd { width: 100%; max-height: 100dvh; border-radius: 0; padding: 16px; align-content: start } .afd-bts button { flex: 1 1 auto; justify-content: center } }
`
