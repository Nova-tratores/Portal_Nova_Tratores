'use client'
// Janela Mecânicos → Centro do Pós-Vendas (José, 16/10/2026): abas Painel dos técnicos,
// Radar de Ocorrências (o faturamento ao vivo está dentro do Painel); o Tratorilson lê tudo no topo (sem aba).
import { useEffect, useRef, useState } from 'react'
import PainelTecnicos from './PainelTecnicos'
import RadarOcorrencias from './RadarOcorrencias'
import TratorilsonLeitura from './TratorilsonLeitura'

export type AbaCPV = 'painel' | 'ocorrencias'

export default function CentroPosVendas({ aba, onAba }: { aba: AbaCPV; onAba: (a: AbaCPV) => void }) {
  // tela cheia de verdade (Fullscreen API): some o menu do portal, fica só o painel
  const raiz = useRef<HTMLDivElement>(null)
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
  const abas: [AbaCPV, string, string][] = [
    ['painel', 'Painel do pós-vendas', 'fa-chart-column'],
    ['ocorrencias', 'Ocorrências', 'fa-satellite-dish'],
  ]
  return (
    <div ref={raiz} style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', width: '100%', boxSizing: 'border-box', background: 'var(--portal-bg, #f8fafc)', minHeight: cheia ? '100vh' : undefined, overflowY: cheia ? 'auto' : undefined }}>
      <style>{`
        .cpv-abas { display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid var(--portal-border, #e5e7eb); margin-bottom: 16px }
        .cpv-aba { position: relative; border: none; background: transparent; font-family: inherit; font-size: 16px; font-weight: 800; color: var(--portal-text-muted, #64748b); padding: 10px 16px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 9px; border-radius: 10px 10px 0 0; transition: color .2s, background .2s }
        .cpv-aba:hover { color: var(--portal-text, #0f172a); background: var(--portal-bg-secondary, #f1f5f9) }
        .cpv-aba i { font-size: 15px; opacity: .75 }
        .cpv-aba::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: #0369a1; transform: scaleX(0); transition: transform .3s cubic-bezier(.3,1.3,.5,1) }
        .cpv-aba-on { color: #0369a1 } .cpv-aba-on i { opacity: 1 } .cpv-aba-on::after { transform: scaleX(1) }
        .cpv-tela { margin-left: auto; margin-bottom: 6px; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text-muted, #64748b); cursor: pointer }
        .cpv-tela:hover { color: #0369a1; border-color: #0369a1 }
        @media (max-width: 720px) { .cpv-aba { font-size: 14px; padding: 8px 10px 10px } .cpv-aba span { display: none } .cpv-aba i { font-size: 18px } }
      `}</style>
      <div className="cpv-abas" role="tablist">
        {abas.map(([id, rot, ic]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={`cpv-aba ${aba === id ? 'cpv-aba-on' : ''}`} onClick={() => onAba(id)} title={rot}>
            <i className={`fas ${ic}`} /> <span>{rot}</span>
          </button>
        ))}
        <button type="button" className="cpv-tela" onClick={alternarTela} title={cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}>
          <i className={`fas ${cheia ? 'fa-compress' : 'fa-expand'}`} />
        </button>
      </div>
      <TratorilsonLeitura />
      {aba === 'ocorrencias' ? <RadarOcorrencias /> : <PainelTecnicos />}
    </div>
  )
}
