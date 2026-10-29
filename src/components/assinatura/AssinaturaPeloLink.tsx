'use client'
// Tela do link de assinatura (celular): mostra de quem é, um quadro para assinar e grava (José, 29/10/2026).
import { useEffect, useRef, useState } from 'react'
import CanvasAssinatura, { type CanvasAssinaturaRef } from './CanvasAssinatura'

export default function AssinaturaPeloLink({ token }: { token: string }) {
  const [nome, setNome] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [assinou, setAssinou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const ref = useRef<CanvasAssinaturaRef>(null)
  useEffect(() => {
    fetch(`/api/assinatura-link/${token}`).then(async (r) => { const j = await r.json(); if (r.ok) setNome(j.nome || ''); else setErro(j.error || 'Link inválido') }).catch(() => setErro('Sem conexão'))
  }, [token])
  const enviar = async () => {
    const png = ref.current?.png()
    if (!png) return
    setEnviando(true); setErro('')
    try {
      const r = await fetch(`/api/assinatura-link/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ png }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não gravou')
      setPronto(true)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não gravou') } finally { setEnviando(false) }
  }
  return (
    <main style={{ minHeight: '100vh', background: '#f5f0e8', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a' }}>
      <div style={{ width: 'min(560px, 100%)', background: '#fefefe', borderRadius: 18, padding: 20, boxShadow: '0 10px 30px rgba(15,23,42,.08)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Nova.png" alt="Nova Tratores" style={{ height: 34 }} />
          <b style={{ fontSize: 17 }}>Sua assinatura</b>
        </div>
        {pronto ? (
          <p style={{ margin: 0, padding: 14, borderRadius: 12, background: '#f0fdf4', color: '#166534', fontSize: 15 }}>Pronto, {nome?.split(' ')[0]}! Sua assinatura foi salva no portal. Pode fechar esta página.</p>
        ) : erro && nome == null ? (
          <p style={{ margin: 0, padding: 14, borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 15 }}>{erro}</p>
        ) : nome == null ? <p style={{ margin: 0, color: '#64748b' }}>Abrindo…</p> : (
          <>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Olá, <b>{nome}</b>. Assine no quadro abaixo com o dedo. Essa assinatura vai nos documentos de comissão que você pedir ou autorizar no portal.</p>
            <div style={{ border: '1.5px dashed #cbd5e1', borderRadius: 14, overflow: 'hidden', background: '#fefefe' }}>
              <CanvasAssinatura ref={ref} temTraco={assinou} onTraco={setAssinou} altura={220} />
            </div>
            {erro && <p style={{ margin: 0, color: '#b91c1c', fontSize: 14 }}>{erro}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => ref.current?.limpar()} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fefefe', fontSize: 15 }}>Limpar</button>
              <button type="button" disabled={!assinou || enviando} onClick={() => void enviar()} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 0, background: assinou ? '#047857' : '#94a3b8', color: '#fefefe', fontSize: 15, fontWeight: 600 }}>{enviando ? 'Salvando…' : 'Salvar minha assinatura'}</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
