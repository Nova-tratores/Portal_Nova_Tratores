'use client'
// Janela Mecânicos → Centro do Pós-Vendas (José, 16/10/2026): abas Painel dos técnicos,
// Radar de Ocorrências (o faturamento ao vivo está dentro do Painel); o Tratorilson lê tudo no topo (sem aba).
import { useEffect, useRef, useState } from 'react'
import PainelTecnicos from './PainelTecnicos'
import RadarOcorrencias from './RadarOcorrencias'
import TratorilsonLeitura from './TratorilsonLeitura'
import AbasCentro from './AbasCentro'
import BotoesMecanicos, { abrirModalMec, useModalMec } from './BotoesMecanicos'
import { useUrlMec } from './useUrlMec'
import { LigaJanela, ComissoesJanela } from './JanelasInfo'
import { AutorizacoesJanela } from './AutorizacoesJanela'
import PodioMeses from './PodioMeses'
import { useLigarAoVivo, useSeloAoVivo } from './useAoVivo'

export type AbaCPV = 'painel' | 'ocorrencias' | 'podio'

export default function CentroPosVendas({ aba, onAba }: { aba: AbaCPV; onAba: (a: AbaCPV) => void }) {
  // ao vivo: faturamento e ocorrências chegam na hora (José, 21/10/2026)
  useLigarAoVivo()
  const selo = useSeloAoVivo()
  // tela cheia de verdade (Fullscreen API): some o menu do portal, fica só o painel
  const raiz = useRef<HTMLDivElement>(null)
  // janela do Tribunal/Ocorrências também tem endereço (?janela=tribunal|ocorrencias) — URL ⇄ janela
  const { pegar, mudar } = useUrlMec()
  const janelaUrl = pegar('janela')
  const { modal } = useModalMec()
  useEffect(() => { const m = ['tribunal', 'ocorrencias', 'liga', 'comissoes', 'autorizacoes'].includes(janelaUrl || '') ? (janelaUrl as 'tribunal') : null; abrirModalMec(m) }, [janelaUrl])
  useEffect(() => { if ((modal || null) !== (janelaUrl || null) && (aba === 'ocorrencias' || modal === 'liga' || modal === 'comissoes' || modal === 'autorizacoes' || janelaUrl === 'liga' || janelaUrl === 'comissoes' || janelaUrl === 'autorizacoes')) mudar({ janela: modal }, !!modal) }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps
  const [cheia, setCheia] = useState(false)
  useEffect(() => {
    const f = () => setCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const alternarTela = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void raiz.current?.requestFullscreen?.()
  }
  const abas: { id: AbaCPV; rot: string; sub: string }[] = [
    { id: 'painel', rot: 'Painel do pós-vendas', sub: 'dinheiro, horas e gastos' },
    { id: 'ocorrencias', rot: 'Mecânicos', sub: 'pontos, ligas e comissões' },
    { id: 'podio', rot: 'Pódio', sub: 'vencedor de cada mês' },
  ]
  // perguntas do Tratorilson: troca de aba ou rola até a parte que responde (e acende ela um instante)
  const irPara = (alvo: string) => {
    if (alvo.startsWith('aba:')) { onAba(alvo.slice(4) as AbaCPV); return }
    const rolar = () => {
      const el = document.getElementById(alvo)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.remove('cpv-acende'); void el.offsetWidth; el.classList.add('cpv-acende')
    }
    const destino: AbaCPV = alvo.startsWith('oc-') ? 'ocorrencias' : 'painel'
    if (aba !== destino) { onAba(destino); setTimeout(rolar, 700) } else rolar()
  }
  return (
    <div ref={raiz} style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflowX: 'clip', background: 'color-mix(in srgb, var(--cpv-amb, transparent) 7%, var(--tom-modulo, color-mix(in srgb, var(--portal-bg, #f8fafc) 95%, #0f172a)))', transition: 'background .7s ease', minHeight: cheia ? '100vh' : undefined, overflowY: cheia ? 'auto' : undefined }}>
      <style>{`
        .cpv-topo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px }
        .cpv-acende { animation: cpvAcende 1.6s ease both; border-radius: 16px } @keyframes cpvAcende { 0%, 40% { box-shadow: 0 0 0 4px rgba(14,165,233,.45) } 100% { box-shadow: 0 0 0 0 rgba(14,165,233,0) } }
        [id^="sec-"], [id^="oc-"], #sim-alvos { scroll-margin-top: 90px }
        /* seletor de modo: dois "portais" com um pilar de luz que desliza para o escolhido */
        .cpv-modo { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 5px; border-radius: 18px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); box-shadow: 0 2px 10px rgba(15,23,42,.06); min-width: min(620px, 100%) }
        .cpv-luz { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc(50% - 7px); border-radius: 14px; transition: transform .55s cubic-bezier(.3,1.35,.45,1), background .4s; box-shadow: 0 8px 22px rgba(3,105,161,.35); overflow: hidden }
        .cpv-luz::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.45) 45%, transparent 60%); background-size: 250% 100%; animation: cpvVarre 2.8s ease-in-out infinite }
        @keyframes cpvVarre { 0% { background-position: 150% 0 } 60%, 100% { background-position: -100% 0 } }
        .cpv-op { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; border: none; background: transparent; font-family: inherit; text-align: left; padding: 10px 14px; border-radius: 14px; cursor: pointer; color: var(--portal-text-muted, #64748b); transition: color .3s, transform .15s }
        .cpv-op:hover { transform: translateY(-1px) } .cpv-op:active { transform: scale(.98) }
        .cpv-op b { display: block; font-size: 15.5px; font-weight: 900; line-height: 1.15 } .cpv-op small { display: block; font-size: 12px; font-weight: 600; opacity: .8 }
        .cpv-op-on { color: #fefefe }
        .cpv-ic { position: relative; width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: flex-end; justify-content: center; gap: 3px; padding: 8px; background: rgba(148,163,184,.18); transition: background .3s }
        .cpv-op-on .cpv-ic { background: rgba(255,255,255,.2) }
        /* ícone do painel: barras que dançam quando ativo */
        .cpv-barras i { display: block; width: 5px; border-radius: 2px; background: currentColor }
        .cpv-barras i:nth-child(1) { height: 40% } .cpv-barras i:nth-child(2) { height: 75% } .cpv-barras i:nth-child(3) { height: 55% }
        .cpv-op-on .cpv-barras i { animation: cpvDanca 1.1s ease-in-out infinite alternate } .cpv-op-on .cpv-barras i:nth-child(2) { animation-delay: .2s } .cpv-op-on .cpv-barras i:nth-child(3) { animation-delay: .4s }
        @keyframes cpvDanca { from { transform: scaleY(.45) } to { transform: scaleY(1) } } .cpv-barras i { transform-origin: bottom }
        /* ícone das ocorrências: radar que varre quando ativo */
        .cpv-radar { align-items: center; padding: 0 }
        .cpv-radar span { position: absolute; inset: 8px; border-radius: 50%; border: 2px solid currentColor; opacity: .7 }
        .cpv-radar span::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 1.5px solid currentColor; opacity: .6 }
        .cpv-radar em { position: absolute; inset: 8px; border-radius: 50%; background: conic-gradient(from 0deg, currentColor, transparent 35%); opacity: 0 }
        .cpv-op-on .cpv-radar em { opacity: .55; animation: cpvGira 1.6s linear infinite } @keyframes cpvGira { to { transform: rotate(360deg) } }
        .cpv-radar u { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #f43f5e; top: 12px; right: 11px; text-decoration: none }
        .cpv-op-on .cpv-radar u { animation: cpvBip 1.6s ease-out infinite } @keyframes cpvBip { 0%, 60% { box-shadow: 0 0 0 0 rgba(244,63,94,.7) } 100% { box-shadow: 0 0 0 8px rgba(244,63,94,0) } }
        .cpv-conteudo { animation: cpvTroca .5s cubic-bezier(.2,.8,.2,1) both } @keyframes cpvTroca { from { opacity: 0; transform: translateY(16px) scale(.99); filter: blur(3px) } to { opacity: 1; transform: none; filter: none } }
        .cpv-podio { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: #92400e; border-radius: 14px; padding: 10px 16px; font-family: inherit; font-size: 14.5px; font-weight: 900; cursor: pointer; transition: all .25s }
        .cpv-podio i { color: #d4a017 } .cpv-podio:hover { transform: translateY(-1px); border-color: #fcd34d } .cpv-podio.on { background: linear-gradient(135deg, #fde68a, #f59e0b); border-color: #f59e0b; color: #451a03; box-shadow: 0 8px 20px rgba(245,158,11,.35) } .cpv-podio.on i { color: #78350f }
        .cpv-tela { margin-left: auto; width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text-muted, #64748b); cursor: pointer }
        .cpv-tela:hover { color: #0369a1; border-color: #0369a1 }
        @media (max-width: 720px) { .cpv-modo { min-width: 0; flex: 1 } .cpv-op small { display: none } .cpv-op b { font-size: 13.5px } .cpv-op { padding: 8px 10px; gap: 8px } }
        @media (prefers-reduced-motion: reduce) { .cpv-luz, .cpv-luz::after, .cpv-barras i, .cpv-radar em, .cpv-conteudo { animation: none !important; transition: none !important } }
        @keyframes cpvAoVivo { from { opacity: 0; transform: translateY(-6px) } }
        .cpv-aovivo { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 999px; padding: 7px 14px; animation: cpvAoVivo .3s both; max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
        .cpv-aovivo i { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 0 rgba(22,163,74,.5); animation: cpvPulsoAV 1.4s infinite; flex-shrink: 0 }
        @keyframes cpvPulsoAV { 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0) } }
      `}</style>
      <div className="cpv-topo">
        {/* Painel · Mecânicos · Pódio num seletor só (José, 20/10/2026) */}
        <AbasCentro aba={aba} onAba={onAba} />
        <BotoesMecanicos onAbrir={(m) => (m === 'liga' || m === 'comissoes' || m === 'autorizacoes' ? mudar({ janela: m }) : mudar({ aba: 'mecanicos', janela: m, tecnico: null, secao: null, mes: null }))} podio={aba === 'podio'} onPodio={() => onAba('podio')} />
        {aba !== 'podio' && <TratorilsonLeitura onIr={irPara} aba={aba} />}
        <span style={{ flex: 1 }} />
        {selo && <span className="cpv-aovivo" title={selo.motivo}><i />Atualizado agora · {selo.motivo}</span>}
        <button type="button" className="cpv-tela" onClick={alternarTela} title={cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}>
          <i className={`fas ${cheia ? 'fa-compress' : 'fa-expand'}`} />
        </button>
      </div>
      {modal === 'liga' && <LigaJanela />}
      {modal === 'comissoes' && <ComissoesJanela />}
      {modal === 'autorizacoes' && <AutorizacoesJanela />}
      <div key={aba} className="cpv-conteudo">{aba === 'ocorrencias' ? <RadarOcorrencias /> : aba === 'podio' ? <PodioMeses /> : <PainelTecnicos />}</div>
    </div>
  )
}
