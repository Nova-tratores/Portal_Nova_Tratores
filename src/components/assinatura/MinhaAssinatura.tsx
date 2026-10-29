'use client'
// Assinatura salva de quem está logado (José, 29/10/2026: "para ele não precisar ficar assinando toda hora").
// Com ela, pedir/autorizar a comissão usa a salva; dá para assinar de novo na hora se quiser.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'

let cache: Promise<string | null> | null = null
export function useMinhaAssinatura(): string | null | undefined {
  const [s, setS] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    cache ??= (async () => {
      try { const r = await fetch('/api/assinatura/minha', { headers: await authHeaders(), cache: 'no-store' }); const j = await r.json(); return j.assinatura?.imagem || null }
      catch { return null }
    })()
    void cache.then((v) => { if (vivo) setS(v) })
    return () => { vivo = false }
  }, [])
  return s
}

/** Mostra a assinatura salva no lugar do quadro; "assinar de novo" volta para o quadro. */
export function AssinaturaSalva({ imagem, onDesenhar }: { imagem: string; onDesenhar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 12, padding: '8px 12px' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagem} alt="Sua assinatura salva" style={{ maxHeight: 80, maxWidth: '60%', background: '#fefefe', borderRadius: 8 }} />
      <span style={{ display: 'grid', gap: 4, fontSize: 13, color: '#166534' }}><b>✓ Vai com a sua assinatura salva</b><button type="button" onClick={onDesenhar} style={{ justifySelf: 'start', border: 0, background: 'none', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>assinar de novo aqui</button></span>
    </div>
  )
}
