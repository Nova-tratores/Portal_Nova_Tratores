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
    // sem assinatura não fica guardado: cadastrou na Administração, a próxima tela já acha
    void cache.then((v) => { if (v === null) cache = null; if (vivo) setS(v) })
    return () => { vivo = false }
  }, [])
  return s
}

/** Sem assinatura: cadastra a que acabou de desenhar ou gera o link para assinar pelo celular. Com o link aberto,
 *  fica olhando: assinou no celular, a tela já passa a usar a salva (José, 30/10/2026). */
export function CadastrarAssinatura({ png, assinou, onSalva }: { png: () => string | null | undefined; assinou: boolean; onSalva: (imagem: string) => void }) {
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const enviar = async (corpo: object) => {
    setOcupado(true); setMsg('')
    try {
      const r = await fetch('/api/assinatura/minha', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não foi possível')
      return j
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Sem conexão'); return null } finally { setOcupado(false) }
  }
  const cadastrar = async () => { const p = png(); if (p && await enviar({ png: p })) { cache = Promise.resolve(p); onSalva(p) } }
  const gerar = async () => { const j = await enviar({ acao: 'link' }); if (j?.url) setLink(j.url) }
  useEffect(() => {
    if (!link) return
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/assinatura/minha', { headers: await authHeaders(), cache: 'no-store' })
        const img = (await r.json()).assinatura?.imagem
        if (img) { cache = Promise.resolve(img); onSalva(img) }
      } catch { /* tenta de novo na próxima */ }
    }, 4000)
    return () => clearInterval(t)
  }, [link, onSalva])
  const zap = link ? `https://wa.me/?text=${encodeURIComponent(`Assine aqui para salvar sua assinatura no portal da Nova Tratores (vale por 7 dias): ${link}`)}` : ''
  const bt = (cheio: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 99, border: cheio ? 0 : '1px solid #cbd5e1', background: cheio ? '#0f172a' : '#fefefe', color: cheio ? '#fefefe' : '#0f172a', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textDecoration: 'none', opacity: ocupado ? .6 : 1 })
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#92400e', marginRight: 'auto' }}>Você ainda não tem assinatura cadastrada.</span>
        <button type="button" disabled={ocupado || !assinou} title={assinou ? '' : 'Desenhe a assinatura no quadro abaixo'} onClick={() => void cadastrar()} style={{ ...bt(false), ...(assinou ? {} : { opacity: .5, cursor: 'not-allowed' }) }}>Cadastrar esta assinatura</button>
        <button type="button" disabled={ocupado} onClick={() => void gerar()} style={bt(true)}>Gerar link para o WhatsApp</button>
      </div>
      {link && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <span style={{ fontSize: 13, color: '#166534', marginRight: 'auto' }}>Assine pelo celular: esta tela atualiza sozinha quando terminar.</span>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(link)} style={bt(false)}>Copiar link</button>
          <a href={zap} target="_blank" rel="noreferrer" style={bt(true)}>Mandar no WhatsApp</a>
        </div>
      )}
      {msg && <small style={{ color: '#b91c1c' }}>{msg}</small>}
    </div>
  )
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
