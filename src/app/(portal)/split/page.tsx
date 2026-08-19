'use client'
// TELA DIVIDIDA: dois sistemas do portal lado a lado, na MESMA sessão.
// Cada painel é o próprio portal (iframe same-origin): login, permissões e
// tema valem normalmente em cada lado. Divisor arrastável; no celular os
// painéis empilham (um em cima do outro). Escolhas ficam salvas no navegador.
import { useState, useEffect, useRef } from 'react'
import { ArrowLeftRight } from 'lucide-react'

const MODULOS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Pré-Pedido de Venda (PPV)', href: '/ppv' },
  { label: 'Catálogo de Peças', href: '/ppv/catalogo' },
  { label: 'Retiradas (QR)', href: '/ppv/unidades' },
  { label: 'Requisições', href: '/requisicoes' },
  { label: 'Orçamentos', href: '/orcamentos' },
  { label: 'Pós-Vendas (OS)', href: '/pos' },
  { label: 'Financeiro — Painel', href: '/financeiro/home-financeiro' },
  { label: 'Financeiro — Kanban', href: '/financeiro/kanban-financeiro' },
  { label: 'Financeiro — Pós-Vendas', href: '/financeiro/home-posvendas' },
  { label: 'Financeiro — Peças', href: '/financeiro/home-pecas' },
  { label: 'Frota', href: '/frota' },
  { label: 'Pendências Frota', href: '/pendencias' },
  { label: 'Clientes', href: '/clientes' },
  { label: 'Consulta Estoque', href: '/estoque' },
  { label: 'Visual Estoque', href: '/visual-estoque' },
  { label: 'Tickets', href: '/tickets' },
]

export default function SplitPage() {
  const [esq, setEsq] = useState('/requisicoes')
  const [dir, setDir] = useState('/financeiro/kanban-financeiro')
  const [pct, setPct] = useState(50)
  const [vertical, setVertical] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('portal-split') || '{}')
      if (s.esq) setEsq(s.esq)
      if (s.dir) setDir(s.dir)
      if (s.pct) setPct(s.pct)
    } catch { /* padrões */ }
    setPronto(true)
    const mq = window.matchMedia('(max-width: 900px)')
    const upd = () => setVertical(mq.matches)
    upd()
    mq.addEventListener('change', upd)
    return () => mq.removeEventListener('change', upd)
  }, [])

  useEffect(() => {
    if (!pronto) return
    try { localStorage.setItem('portal-split', JSON.stringify({ esq, dir, pct })) } catch { /* sem storage */ }
  }, [esq, dir, pct, pronto])

  const mover = (clientX: number, clientY: number) => {
    if (!arrastando || !boxRef.current) return
    const r = boxRef.current.getBoundingClientRect()
    const p = vertical ? ((clientY - r.top) / r.height) * 100 : ((clientX - r.left) / r.width) * 100
    setPct(Math.min(80, Math.max(20, Math.round(p))))
  }

  const seletor = (valor: string, set: (v: string) => void, lado: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>{lado}</span>
      <select
        value={MODULOS.some((m) => m.href === valor) ? valor : ''}
        onChange={(e) => e.target.value && set(e.target.value)}
        style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, cursor: 'pointer' }}
      >
        {!MODULOS.some((m) => m.href === valor) && <option value="">(tela atual)</option>}
        {MODULOS.map((m) => <option key={m.href} value={m.href}>{m.label}</option>)}
      </select>
    </div>
  )

  if (!pronto) return null

  const estIframeA = vertical
    ? { border: 'none', width: '100%', height: `${pct}%`, minHeight: 0 }
    : { border: 'none', height: '100%', width: `${pct}%`, minWidth: 0 }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 84px)' }}
      onMouseMove={(e) => mover(e.clientX, e.clientY)}
      onMouseUp={() => setArrastando(false)}
      onMouseLeave={() => setArrastando(false)}
      onTouchMove={(e) => e.touches[0] && mover(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={() => setArrastando(false)}
    >
      {/* Barra de controle: qual sistema em cada lado + trocar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', flexWrap: 'wrap' }}>
        {seletor(esq, setEsq, vertical ? 'Cima' : 'Esquerda')}
        <button
          onClick={() => { const a = esq; setEsq(dir); setDir(a) }}
          title="Trocar os lados"
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeftRight size={15} />
        </button>
        {seletor(dir, setDir, vertical ? 'Baixo' : 'Direita')}
      </div>

      {/* Painéis */}
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: vertical ? 'column' : 'row' }}>
        <iframe key={`a-${esq}`} src={esq} title="Painel 1" style={{ ...estIframeA, pointerEvents: arrastando ? 'none' : 'auto' }} />
        <div
          onMouseDown={() => setArrastando(true)}
          onTouchStart={() => setArrastando(true)}
          title="Arraste para redimensionar"
          style={{ flexShrink: 0, background: arrastando ? '#EA580C' : 'var(--portal-border)', cursor: vertical ? 'row-resize' : 'col-resize', width: vertical ? '100%' : 6, height: vertical ? 6 : '100%', transition: 'background .12s' }}
        />
        <iframe key={`b-${dir}`} src={dir} title="Painel 2" style={{ border: 'none', flex: 1, minWidth: 0, minHeight: 0, pointerEvents: arrastando ? 'none' : 'auto' }} />
      </div>
    </div>
  )
}
