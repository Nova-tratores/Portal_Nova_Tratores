'use client'
// Moldura das telas de Peças Não Identificadas (barra do Opa)
// e a janela que abre o detalhe de um item por cima da lista.

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { OpaBarra } from './comum'

/** Página do Opa: ocupa a largura toda (sem margem lateral sobrando). */
export function Moldura({ podeGerir, children }: { podeGerir: boolean; largura?: number; semNovo?: boolean; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '16px 20px 28px', width: '100%', boxSizing: 'border-box' }}>
      <OpaBarra podeGerir={podeGerir} />
      {children}
    </div>
  )
}

export function Janela({ titulo, onFechar, largura = 860, children }: { titulo: string; onFechar: () => void; largura?: number; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--portal-bg-card)', width: '100%', maxWidth: isMobile ? '100%' : largura,
        maxHeight: isMobile ? '100%' : '92vh', overflow: 'auto', borderRadius: isMobile ? 0 : 16,
      }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--portal-bg-card)', borderBottom: '1px solid var(--portal-border)' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', flex: 1 }}>{titulo}</span>
          <button aria-label="Fechar" onClick={onFechar} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'var(--portal-bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: isMobile ? 14 : 22 }}>{children}</div>
      </div>
    </div>
  )
}
