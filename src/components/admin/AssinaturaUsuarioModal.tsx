'use client'
// Assinatura salva da pessoa (José, 29/10/2026): o diretor e os gerentes não precisam assinar toda vez que pedem ou
// autorizam uma comissão. Aqui o admin vê a assinatura, a pessoa assina na hora ou recebe um link pelo WhatsApp.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import CanvasAssinatura, { type CanvasAssinaturaRef } from '@/components/assinatura/CanvasAssinatura'

type Salva = { imagem: string; origem: 'admin' | 'link' | 'proposta'; em: string | null } | null
const ORIGEM = { admin: 'assinada na Administração', link: 'assinada pelo link', proposta: 'a mesma das Propostas comerciais' }

export default function AssinaturaUsuarioModal({ userId, nome, onFechar }: { userId: string; nome: string; onFechar: () => void }) {
  const [salva, setSalva] = useState<Salva | undefined>(undefined)
  const [assinando, setAssinando] = useState(false)
  const [assinou, setAssinou] = useState(false)
  const [msg, setMsg] = useState('')
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const ref = useRef<CanvasAssinaturaRef>(null)
  const ler = async () => {
    try {
      const r = await fetch(`/api/admin/assinaturas?user_id=${userId}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha')
      setSalva(j.assinatura || null)
    } catch (e) { setSalva(null); setMsg(e instanceof Error ? e.message : 'Falha ao ler') }
  }
  useEffect(() => { void ler() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onFechar])
  const chamar = async (metodo: 'POST' | 'DELETE', corpo?: object) => {
    setOcupado(true); setMsg('')
    try {
      const r = await fetch(`/api/admin/assinaturas${metodo === 'DELETE' ? `?user_id=${userId}` : ''}`, { method: metodo, headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha')
      return j
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Falha'); return null } finally { setOcupado(false) }
  }
  const salvar = async () => { const png = ref.current?.png(); if (!png) return; if (await chamar('POST', { user_id: userId, png })) { setAssinando(false); setAssinou(false); setMsg('Assinatura salva.'); void ler() } }
  const gerarLink = async () => { const j = await chamar('POST', { user_id: userId, acao: 'link' }); if (j?.url) setLink(j.url) }
  const zap = link ? `https://wa.me/?text=${encodeURIComponent(`Olá, ${nome.split(' ')[0]}! Assine aqui para salvar sua assinatura no portal da Nova Tratores (vale por 7 dias): ${link}`)}` : ''
  const tela = (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 11002, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Assinatura de ${nome}`} style={{ width: 'min(560px, 100%)', background: 'var(--portal-bg-card, #fefefe)', borderRadius: 18, padding: 20, display: 'grid', gap: 14, color: 'var(--portal-text, #0f172a)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 17, flex: 1 }}>Assinatura de {nome}</b>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: '50%', border: 0, background: '#f1f5f9', cursor: 'pointer' }}>✕</button>
        </div>
        <small style={{ color: '#64748b', lineHeight: 1.5 }}>Vai nos documentos de comissão que essa pessoa pedir (gerente) ou autorizar (diretor), sem precisar assinar toda vez.</small>
        {salva === undefined ? <p style={{ margin: 0, color: '#64748b' }}>lendo…</p> : !assinando && (
          salva ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#fefefe', display: 'grid', placeItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={salva.imagem} alt={`Assinatura de ${nome}`} style={{ maxHeight: 130, maxWidth: '100%' }} />
              </div>
              <small style={{ color: '#047857' }}>✓ {ORIGEM[salva.origem]}{salva.em ? ` em ${new Date(salva.em).toLocaleDateString('pt-BR')}` : ''}</small>
            </div>
          ) : <p style={{ margin: 0, padding: 12, borderRadius: 12, background: '#fffbeb', color: '#92400e', fontSize: 14 }}>{nome.split(' ')[0]} ainda não tem assinatura salva.</p>
        )}
        {assinando && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ border: '1.5px dashed #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fefefe' }}><CanvasAssinatura ref={ref} temTraco={assinou} onTraco={setAssinou} altura={180} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => ref.current?.limpar()} style={bt(false)}>Limpar</button>
              <button type="button" onClick={() => { setAssinando(false); setAssinou(false) }} style={bt(false)}>Cancelar</button>
              <button type="button" disabled={!assinou || ocupado} onClick={() => void salvar()} style={bt(true)}>{ocupado ? 'Salvando…' : 'Salvar assinatura'}</button>
            </div>
          </div>
        )}
        {!assinando && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setAssinando(true)} style={bt(true)}>{salva ? 'Assinar de novo aqui' : 'Assinar aqui'}</button>
            <button type="button" disabled={ocupado} onClick={() => void gerarLink()} style={bt(false)}>Gerar link para o WhatsApp</button>
            {salva && salva.origem !== 'proposta' && <button type="button" disabled={ocupado} onClick={async () => { if (confirm('Apagar a assinatura salva?') && await chamar('DELETE')) void ler() }} style={{ ...bt(false), color: '#b91c1c' }}>Apagar</button>}
          </div>
        )}
        {link && (
          <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <small style={{ color: '#166534' }}>Link de uso único, vale por 7 dias:</small>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(link)} style={bt(false)}>Copiar</button>
              <a href={zap} target="_blank" rel="noreferrer" style={{ ...bt(true), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Mandar no WhatsApp</a>
            </div>
          </div>
        )}
        {msg && <small style={{ color: /salva/.test(msg) ? '#047857' : '#b91c1c' }}>{msg}</small>}
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tela : createPortal(tela, document.body)
}

const bt = (cheio: boolean): React.CSSProperties => ({ padding: '9px 14px', borderRadius: 99, border: cheio ? 0 : '1px solid #cbd5e1', background: cheio ? '#047857' : '#fefefe', color: cheio ? '#fefefe' : '#0f172a', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' })
