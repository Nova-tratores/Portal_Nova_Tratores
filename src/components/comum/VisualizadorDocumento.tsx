'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Printer, Download, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react'

export type DocumentoVisualizavel = {
  titulo: string
  url: string
  /** nome do arquivo ao baixar, sem extensão (ex.: "OS-5250") */
  nome?: string
}

// Mostra OS, PV, notas e boletos dentro do portal, com Imprimir e Baixar.
// - rota interna (começa com "/") é carregada direto (PDF ou página de impressão);
// - link externo passa por /api/documentos/arquivo (mesma origem → dá pra imprimir).
// PDF vira blob local (imprime e baixa com nome); página HTML é impressa pelo
// próprio iframe ("Salvar como PDF" na janela de impressão serve de download).
// Use com key={doc?.url}: cada documento monta do zero (estado limpo).
function srcDe(url: string, nome?: string) {
  if (url.startsWith('/')) {
    // embed=1: a impressão do POS não abre a janela de impressão sozinha e a do
    // Omie (/api/clientes/print) entrega o PDF em vez de redirecionar pra Omie
    return /^\/api\/(pos\/ordens\/|clientes\/print)/.test(url) ?`${url}${url.includes('?') ? '&' : '?'}embed=1` : url
  }
  return `/api/documentos/arquivo?url=${encodeURIComponent(url)}${nome ? `&nome=${encodeURIComponent(nome)}` : ''}`
}

export default function VisualizadorDocumento({ doc, onClose }: { doc: DocumentoVisualizavel | null; onClose: () => void }) {
  const [estado, setEstado] = useState<'carregando' | 'pdf' | 'html' | 'erro'>('carregando')
  const [src, setSrc] = useState('')
  const [erro, setErro] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!doc) return
    let blobUrl = ''
    let cancelado = false
    const alvo = srcDe(doc.url, doc.nome)
    fetch(alvo)
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          throw new Error(j?.error || `Não foi possível carregar (${r.status})`)
        }
        const tipo = r.headers.get('content-type') || ''
        if (tipo.includes('pdf')) {
          const blob = await r.blob()
          if (cancelado) return
          blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
          setSrc(blobUrl); setEstado('pdf')
        } else if (tipo.includes('json')) {
          // /api/ppv/pdf devolve { html } (a tela do PPV injeta numa janela) — vira página
          const j = await r.json().catch(() => null)
          if (cancelado) return
          if (!j?.html) throw new Error(j?.error || 'O documento veio vazio')
          blobUrl = URL.createObjectURL(new Blob([j.html], { type: 'text/html' }))
          setSrc(blobUrl); setEstado('html')
        } else {
          if (cancelado) return
          setSrc(alvo); setEstado('html')
        }
      })
      .catch(e => { if (!cancelado) { setErro(e.message || 'Erro ao carregar'); setEstado('erro') } })
    return () => { cancelado = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [doc])

  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  if (!doc) return null

  const imprimir = () => {
    const w = iframeRef.current?.contentWindow
    if (!w) return
    try { w.focus(); w.print() } catch { window.open(src || doc.url, '_blank') }
  }
  const baixar = () => {
    if (estado === 'html') return imprimir()
    const a = document.createElement('a')
    a.href = src
    a.download = `${(doc.nome || doc.titulo).replace(/[\\/:*?"<>|]+/g, '_')}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
  }

  const pronto = estado === 'pdf' || estado === 'html'
  const BTN: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0px, 2vw, 24px)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--portal-bg-card)', borderRadius: 14, width: '100%', maxWidth: 1000, height: '100%', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
        {/* Barra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 10px 18px', borderBottom: '1px solid var(--portal-border, #E5E7EB)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140, fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.titulo}</div>
          <button onClick={imprimir} disabled={!pronto}
            style={{ ...BTN, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: '#334155', opacity: pronto ? 1 : 0.5 }}>
            <Printer size={15} /> Imprimir
          </button>
          <button onClick={baixar} disabled={!pronto}
            title={estado === 'html' ? 'Abre a impressão — escolha "Salvar como PDF"' : 'Baixar o PDF'}
            style={{ ...BTN, border: 'none', background: '#dc2626', color: '#fefefe', opacity: pronto ? 1 : 0.5 }}>
            <Download size={15} /> {estado === 'html' ? 'Salvar PDF' : 'Baixar'}
          </button>
          <a href={doc.url} target="_blank" rel="noopener noreferrer" title="Abrir em outra guia"
            style={{ ...BTN, padding: '8px 10px', border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: '#64748B' }}>
            <ExternalLink size={15} />
          </a>
          <button onClick={onClose} title="Fechar (Esc)"
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E5E7EB', background: 'var(--portal-bg-secondary)', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 2 }}>
            <X size={17} />
          </button>
        </div>

        {/* Documento */}
        <div style={{ flex: 1, minHeight: 0, background: '#525659', position: 'relative' }}>
          {estado === 'carregando' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#E5E7EB', fontSize: 14 }}>
              <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite' }} /> Carregando documento...
            </div>
          )}
          {estado === 'erro' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', background: 'var(--portal-bg-secondary)' }}>
              <AlertTriangle size={26} color="#B45309" />
              <div style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 600 }}>Este documento não pode ser mostrado aqui.</div>
              <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', maxWidth: 420 }}>{erro}</div>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ ...BTN, border: 'none', background: '#dc2626', color: '#fefefe' }}>
                <ExternalLink size={15} /> Abrir em outra guia
              </a>
            </div>
          )}
          {pronto && (
            <iframe ref={iframeRef} src={src} title={doc.titulo}
              style={{ width: '100%', height: '100%', border: 'none', background: estado === 'html' ? '#fff' : '#525659' }} />
          )}
        </div>
      </div>
    </div>
  )
}
