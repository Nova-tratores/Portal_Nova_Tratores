'use client'
// Comissões esperando o DIRETOR (José, 28/10/2026): "assim que gerar o pedido, tem que cair na cara dele, informando
// para ele autorizar as comissões para dar continuidade. Se ele escolher lembrar depois, pergunta em quantas horas ou
// minutos. E fica um atalho para ele na dashboard — só na dashboard, sem sobrepor nada — até ele confirmar."
// Montado no PortalLayout: aparece em qualquer tela. "Autorizar agora" abre a janela de autorização ali mesmo
// (o diretor não precisa ter a Janela Mecânicos). Pedido NOVO derruba o "lembrar depois" e o aviso volta.
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { DOCA_ID } from '@/components/dashboard/AtalhosDashboard'
import { AutorizacoesJanela, recarregarAutorizacoes } from './AutorizacoesJanela'
import { brl2 } from './ui'

interface Pendente { id: string; tecnico: string; mes: string; valor: number; pedido_por: string | null; pedido_em: string }
interface Adiado { ate: number; ids: string[] }

const CHAVE = 'comissoes-diretor-lembrar'
const lerAdiado = (): Adiado | null => { try { const v = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return v && typeof v.ate === 'number' ? v : null } catch { return null } }
const gravarAdiado = (v: Adiado | null) => { try { if (v) localStorage.setItem(CHAVE, JSON.stringify(v)); else localStorage.removeItem(CHAVE) } catch { /* sem armazenamento: o aviso só volta mais cedo */ } }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`
const nomeCurto = (n: string) => n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).split(' ').slice(0, 2).join(' ')
const daquiA = (min: number) => Date.now() + min * 60_000
const RAPIDOS: { rot: string; min: number }[] = [{ rot: '15 min', min: 15 }, { rot: '30 min', min: 30 }, { rot: '1 hora', min: 60 }, { rot: '2 horas', min: 120 }, { rot: '4 horas', min: 240 }]

export default function AvisoComissoesDiretor() {
  const pathname = usePathname()
  const [pend, setPend] = useState<Pendente[]>([])
  const [adiado, setAdiado] = useState<Adiado | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [janela, setJanela] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [qtd, setQtd] = useState('1')
  const [unidade, setUnidade] = useState<'min' | 'h'>('h')

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/mecanicos/lancamento-comissao/pendentes-diretor', { headers: await authHeaders(), cache: 'no-store' })
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
    window.addEventListener('comissao-decidida', f)
    return () => { clearInterval(t); window.removeEventListener('focus', f); window.removeEventListener('comissao-decidida', f) }
  }, [carregar])
  const abrirJanela = useCallback(() => { setLembrar(false); void recarregarAutorizacoes(); setJanela(true) }, [])
  // link do sino (?comissoes=1) abre a autorização direto
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('comissoes') !== '1') return
    void Promise.resolve().then(() => abrirJanela())
  }, [pathname, abrirJanela])

  // atalho na doca da dashboard (lado a lado com os outros, sem sobrepor)
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
    const v = { ate: daquiA(min), ids: pend.map((p) => p.id) }
    gravarAdiado(v); setAdiado(v); setLembrar(false)
  }

  if (!pend.length && !janela) return null
  const novo = !adiado || pend.some((p) => !adiado.ids.includes(p.id))
  const mostrarAviso = pend.length > 0 && !janela && (novo || agora >= adiado!.ate)
  const total = pend.reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const qtdNum = Math.max(0, Number(qtd.replace(',', '.')) || 0)

  return (
    <>
      <style>{ESTILO}</style>
      {janela && <AutorizacoesJanela onFechar={() => { setJanela(false); void carregar() }} />}

      {mostrarAviso && createPortal(
        <div className="acd-fundo" role="dialog" aria-modal="true" aria-label="Comissões para autorizar">
          <div className="acd">
            <span className="acd-ic"><i className="fas fa-signature" /></span>
            <h2>{pend.length === 1 ? 'Uma comissão espera a sua autorização' : `${pend.length} comissões esperam a sua autorização`}</h2>
            <p>O pós-vendas já conferiu e assinou. Autorize para dar continuidade: só depois disso a comissão vai para o RH e para o pagamento dos técnicos.</p>
            <div className="acd-lista">
              {pend.slice(0, 6).map((p) => (
                <div key={p.id}><b>{nomeCurto(p.tecnico)}</b><span>{mesCurto(p.mes)}{p.pedido_por ? ` · pedido por ${p.pedido_por.split(' ')[0]}` : ''}</span><em>{brl2(Number(p.valor) || 0)}</em></div>
              ))}
              {pend.length > 6 && <small>e mais {pend.length - 6}</small>}
              {pend.length > 1 && <div className="tot"><b>Total</b><span /><em>{brl2(total)}</em></div>}
            </div>
            {!lembrar ? (
              <div className="acd-bts">
                <button type="button" className="acd-sec" onClick={() => setLembrar(true)}><i className="fas fa-clock" /> Lembrar depois</button>
                <button type="button" className="acd-pri" onClick={abrirJanela}>Autorizar agora<span><i className="fas fa-arrow-right" /></span></button>
              </div>
            ) : (
              <div className="acd-lem">
                <b>Lembrar de novo daqui a quanto tempo?</b>
                <div className="acd-rap">{RAPIDOS.map((r) => <button key={r.min} type="button" onClick={() => adiar(r.min)}>{r.rot}</button>)}</div>
                <div className="acd-outro">
                  <span>ou daqui a</span>
                  <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" />
                  <select value={unidade} onChange={(e) => setUnidade(e.target.value as 'min' | 'h')} aria-label="Unidade"><option value="min">minutos</option><option value="h">horas</option></select>
                  <button type="button" className="acd-pri" disabled={!qtdNum} onClick={() => adiar(unidade === 'h' ? qtdNum * 60 : qtdNum)}>Lembrar</button>
                </div>
                <button type="button" className="acd-volta" onClick={() => setLembrar(false)}>voltar</button>
              </div>
            )}
          </div>
        </div>, document.body)}

      {naDash && doca && doca.isConnected && pend.length > 0 && createPortal(
        <div style={{ position: 'relative', order: -2, pointerEvents: 'auto' }}>
          <button type="button" className="acd-atalho" onClick={abrirJanela} title={`${pend.length} comissão(ões) para autorizar · ${brl2(total)}`} aria-label="Comissões para autorizar">
            <i className="fas fa-signature" />
            <span>{pend.length}</span>
          </button>
        </div>, doca)}
    </>
  )
}

const ESTILO = `
.acd-fundo { position: fixed; inset: 0; z-index: 9250; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: acdFade .2s both }
@keyframes acdFade { from { opacity: 0 } to { opacity: 1 } }
.acd { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border-radius: 20px; padding: 24px; display: grid; gap: 12px; animation: acdSobe .25s ease both }
@keyframes acdSobe { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
.acd-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: #eff6ff; color: #1d4ed8; font-size: 22px }
.acd h2 { margin: 0; font-size: 20px; font-weight: 600 } .acd > p { margin: 0; font-size: 14.5px; color: var(--portal-text-muted, #475569); line-height: 1.5 }
.acd-lista { display: grid; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; overflow: hidden }
.acd-lista > div { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: baseline; padding: 9px 14px; font-size: 14px } .acd-lista > div + div { border-top: 1px solid var(--portal-border, #eef2f7) }
.acd-lista b { font-weight: 500 } .acd-lista span { font-size: 12.5px; color: #64748b } .acd-lista em { font-style: normal; font-variant-numeric: tabular-nums } .acd-lista .tot { background: #f8fafc } .acd-lista .tot b, .acd-lista .tot em { font-weight: 600 }
.acd-lista > small { padding: 6px 14px; color: #64748b; font-size: 12.5px }
.acd-bts { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px }
.acd-pri { display: inline-flex; align-items: center; gap: 10px; border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 11px 12px 11px 20px; font-family: inherit; font-size: 14.5px; cursor: pointer; transition: background .2s } .acd-pri:hover:not(:disabled) { background: #1d4ed8 } .acd-pri:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed }
.acd-pri span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.16); font-size: 11px }
.acd-sec { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; color: var(--portal-text, #0f172a); border-radius: 99px; padding: 10px 18px; font-family: inherit; font-size: 14.5px; cursor: pointer } .acd-sec:hover { border-color: #94a3b8 }
.acd-lem { display: grid; gap: 10px; background: #f8fafc; border-radius: 14px; padding: 14px } .acd-lem > b { font-weight: 500; font-size: 14.5px }
.acd-rap { display: flex; gap: 6px; flex-wrap: wrap } .acd-rap button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 8px 14px; font-family: inherit; font-size: 14px; color: #0f172a; cursor: pointer } .acd-rap button:hover { border-color: #1d4ed8; color: #1d4ed8 }
.acd-outro { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; color: #475569 }
.acd-outro input { width: 64px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; text-align: center; background: #fefefe; color: #0f172a }
.acd-outro select { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; background: #fefefe; color: #0f172a } .acd-outro .acd-pri { padding: 9px 18px }
.acd-volta { justify-self: start; border: none; background: none; color: #64748b; font-family: inherit; font-size: 13.5px; cursor: pointer; padding: 2px 0 }
.acd-atalho { position: relative; width: 58px; height: 58px; border-radius: 50%; border: none; background: linear-gradient(135deg, #1d4ed8, #1e3a8a); color: #fefefe; font-size: 22px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 8px 24px rgba(29,78,216,.35) }
.acd-atalho span { position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #fefefe; color: #1d4ed8; font-size: 12px; font-weight: 700; display: grid; place-items: center; border: 2px solid #1d4ed8 }
`
