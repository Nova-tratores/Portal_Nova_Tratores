'use client'
// Painel de RESPOSTAS DE E-MAIL dos clientes — botão redondo ao lado do
// sininho (renderizado pelo NotificationSystem). Lista as respostas casadas
// pelo cron ler-respostas; clicar abre o card e marca como lida.
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/auth/client'
import { Mail, Reply, CheckCheck } from 'lucide-react'

const fmtData = (iso) => {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

export default function RespostasEmail() {
  const [respostas, setRespostas] = useState([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/financeiro/emails?respostas=1', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (Array.isArray(j.respostas)) { setRespostas(j.respostas); setNaoLidas(j.naoLidas || 0) }
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 120000)
    return () => clearInterval(t)
  }, [carregar])

  const abrir = async (r) => {
    setOpen(false)
    if (!r.lido_em) {
      try {
        await fetch('/api/financeiro/emails', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ ids: [r.id] }) })
      } catch { /* segue */ }
      carregar()
    }
    router.push(`/financeiro/home-financeiro?id=${r.chamado_id}&tipo=boleto`)
  }

  const marcarTodas = async () => {
    const ids = respostas.filter((r) => !r.lido_em).map((r) => r.id)
    if (!ids.length) return
    try {
      await fetch('/api/financeiro/emails', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ ids }) })
    } catch { /* segue */ }
    carregar()
  }

  if (pathname === '/login') return null

  return (
    <div style={{ position: 'fixed', top: 20, right: 100, zIndex: 2050 }}>
      <button
        onClick={() => setOpen((s) => !s)}
        title="Respostas de e-mail dos clientes"
        style={{
          position: 'relative', width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: naoLidas > 0
            ? 'linear-gradient(135deg, #16a34a 0%, #14532d 100%)'
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          boxShadow: naoLidas > 0
            ? '0 6px 28px rgba(22,163,74,0.5), 0 0 0 4px rgba(22,163,74,0.2)'
            : '0 6px 20px rgba(0,0,0,0.4)',
          transition: 'all 0.3s ease',
        }}
      >
        <Mail size={26} color="#fff" strokeWidth={2} />
        {naoLidas > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 10, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, padding: '0 4px', border: '2px solid #fff', lineHeight: 1 }}>
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 74, right: 0, width: 380, maxWidth: '92vw', maxHeight: '70vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 10px' }}>
            <Reply size={15} style={{ color: '#16a34a' }} />
            <b style={{ fontSize: 14, color: 'var(--portal-text)' }}>Respostas dos clientes</b>
            {naoLidas > 0 && (
              <button onClick={marcarTodas} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 700 }}>
                <CheckCheck size={13} /> marcar lidas
              </button>
            )}
          </div>
          {respostas.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>
              Nenhuma resposta de cliente ainda.
            </div>
          ) : respostas.map((r) => (
            <button key={r.id} onClick={() => abrir(r)}
              style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: r.lido_em ? 'transparent' : 'rgba(22,163,74,0.10)', border: 'none', borderTop: '1px solid var(--portal-border)', padding: '10px 8px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13, color: 'var(--portal-text)' }}>{r.cliente || r.de_email || `Card #${r.chamado_id}`}</b>
                <span style={{ fontSize: 11, color: 'var(--portal-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtData(r.criado_em)}</span>
                {!r.lido_em && <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a' }}>● NOVA</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 3, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                “{String(r.corpo || '').slice(0, 160)}”
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
