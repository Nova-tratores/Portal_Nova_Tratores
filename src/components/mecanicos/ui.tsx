'use client'
// Peças visuais do Centro do Pós-Vendas (Janela Mecânicos): número que "conta" até o valor,
// cartão de indicador e estilos de animação. Tema por variáveis do portal (modo escuro ok).
import { useEffect, useRef, useState } from 'react'

export const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const brl2 = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const horas = (v: number) => `${(Math.round((v || 0) * 10) / 10).toLocaleString('pt-BR')} h`
export const kmFmt = (v: number) => `${Math.round(v || 0).toLocaleString('pt-BR')} km`

export const COR = {
  faturadas: '#0891b2', internas: '#8b5cf6', ociosas: '#cbd5e1', extras: '#f59e0b',
  servico: '#0369a1', km: '#16a34a', pecas: '#ea580c', outros: '#94a3b8', custo: '#dc2626', liquido: '#059669',
}

/** Número que sobe animado até o valor (easeOutCubic, ~0,9 s). */
export function useContador(alvo: number, ms = 900): number {
  const [v, setV] = useState(0)
  const de = useRef(0)
  useEffect(() => {
    const ini = performance.now(), origem = de.current
    let raf = 0
    const passo = (t: number) => {
      const p = Math.min(1, (t - ini) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const x = origem + (alvo - origem) * e
      setV(x)
      if (p < 1) raf = requestAnimationFrame(passo); else de.current = alvo
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [alvo, ms])
  return v
}

export function Numero({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  return <>{formato(useContador(valor))}</>
}

export function Kpi({ titulo, valor, formato, cor, sub, icone, atraso = 0, destaque = false }: {
  titulo: string; valor: number; formato: (v: number) => string; cor: string; sub?: React.ReactNode; icone?: string; atraso?: number; destaque?: boolean
}) {
  return (
    <div className="cpv-entra" style={{ animationDelay: `${atraso}ms`, background: destaque ? `linear-gradient(135deg, ${cor}, ${cor}cc)` : 'var(--portal-bg-card, #fefefe)', color: destaque ? '#fefefe' : 'var(--portal-text, #0f172a)', border: destaque ? 'none' : '1px solid var(--portal-border, #e5e7eb)', borderRadius: 16, padding: '16px 18px', boxShadow: destaque ? `0 10px 24px ${cor}40` : '0 1px 3px rgba(15,23,42,.05)', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      {icone && <i className={`fas ${icone}`} style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: destaque ? .35 : .18, color: destaque ? '#fefefe' : cor }} />}
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, opacity: destaque ? .9 : .65 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: destaque ? '#fefefe' : cor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Numero valor={valor} formato={formato} /></div>
      {sub && <div style={{ fontSize: 12, marginTop: 4, opacity: destaque ? .92 : .7 }}>{sub}</div>}
    </div>
  )
}

export function Cartao({ titulo, children, extra, atraso = 0 }: { titulo: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode; atraso?: number }) {
  return (
    <section className="cpv-entra" style={{ animationDelay: `${atraso}ms`, background: 'var(--portal-bg-card, #fefefe)', border: '1px solid var(--portal-border, #e5e7eb)', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,.05)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text, #0f172a)', flex: 1 }}>{titulo}</div>
        {extra}
      </div>
      {children}
    </section>
  )
}

/** Animações do módulo (entrar suave, pulso "ao vivo", linha nova brilhando). */
export function EstilosCPV() {
  return (
    <style>{`
      @keyframes cpvEntra { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
      .cpv-entra { animation: cpvEntra .5s cubic-bezier(.2,.8,.2,1) both }
      @keyframes cpvPulso { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.55) } 70% { box-shadow: 0 0 0 10px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }
      .cpv-pulso { animation: cpvPulso 1.8s infinite }
      @keyframes cpvNovo { 0% { background: rgba(250,204,21,.45); transform: translateX(-12px) } 100% { background: transparent; transform: none } }
      .cpv-novo { animation: cpvNovo 2.2s ease-out both }
      .cpv-linha:hover { background: var(--portal-bg-secondary, #f8fafc) }
    `}</style>
  )
}
