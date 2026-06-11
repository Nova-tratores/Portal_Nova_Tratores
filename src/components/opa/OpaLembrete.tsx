'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AlertCircle, Check, X, ChevronRight, User } from 'lucide-react'

interface OpaAnexo { id: string; opa_id: string; url: string; tipo: string | null }
interface Opa {
  id: string
  titulo: string
  descricao: string | null
  criado_por_nome: string | null
  created_at: string
  anexos?: OpaAnexo[]
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const MAX_VISIVEIS = 4

export default function OpaLembrete({
  userId, userName, isAdmin,
}: { userId?: string; userName?: string; isAdmin?: boolean }) {
  const router = useRouter()
  const [opas, setOpas] = useState<Opa[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [resolvendo, setResolvendo] = useState<string | null>(null)

  const dismissKey = userId ? `opa-dismissed-${userId}` : ''

  // Carregar opas abertos + anexos
  const carregar = useCallback(async () => {
    const { data: lista } = await supabase
      .from('portal_opas')
      .select('id, titulo, descricao, criado_por_nome, created_at')
      .eq('status', 'aberto')
      .order('created_at', { ascending: false })
    if (!lista) { setOpas([]); return }
    const ids = lista.map(o => o.id)
    let anexos: OpaAnexo[] = []
    if (ids.length) {
      const { data: anx } = await supabase
        .from('portal_opas_anexos')
        .select('id, opa_id, url, tipo')
        .in('opa_id', ids)
      anexos = anx || []
    }
    setOpas(lista.map(o => ({ ...o, anexos: anexos.filter(a => a.opa_id === o.id) })))
  }, [])

  useEffect(() => {
    if (!userId) return
    carregar()
    const ch = supabase.channel('opa_lembrete_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_opas' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, carregar])

  // Carregar dismissed do localStorage
  useEffect(() => {
    if (!dismissKey) return
    try {
      const saved = localStorage.getItem(dismissKey)
      if (saved) setDismissed(JSON.parse(saved))
    } catch { /* */ }
  }, [dismissKey])

  const dispensar = (id: string) => {
    setDismissed(prev => {
      const next = [...prev, id]
      if (dismissKey) localStorage.setItem(dismissKey, JSON.stringify(next))
      return next
    })
  }

  const resolver = async (id: string) => {
    if (!userId) return
    setResolvendo(id)
    const { data } = await supabase.rpc('resolver_opa', {
      p_opa_id: id, p_user_id: userId, p_user_nome: userName || 'Usuário', p_user_tipo: 'portal',
    })
    // Some da minha tela de qualquer forma (eu venci, ou alguém já resolveu)
    setOpas(prev => prev.filter(o => o.id !== id))
    setResolvendo(null)
    void data
  }

  const visiveis = opas.filter(o => !dismissed.includes(o.id))
  if (!userId || visiveis.length === 0) return null

  const mostrados = visiveis.slice(0, MAX_VISIVEIS)
  const extras = visiveis.length - mostrados.length

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 49000,
      display: 'flex', flexDirection: 'column', gap: 10, width: 340, maxWidth: 'calc(100vw - 40px)',
    }}>
      {extras > 0 && (
        <button
          onClick={() => router.push('/opa')}
          style={{
            alignSelf: 'flex-end', background: '#dc2626', color: '#fff', border: 'none',
            borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
          }}
        >
          +{extras} Opa{extras > 1 ? 's' : ''} abertos
        </button>
      )}

      {mostrados.map((o, i) => {
        const anexo = o.anexos?.[0]
        const isVideo = anexo?.tipo?.startsWith('video')
        return (
          <div key={o.id} style={{
            background: 'var(--portal-bg-card)', border: '1px solid #FCA5A5',
            borderLeft: '4px solid #dc2626', borderRadius: 14,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
            animation: `opaSlideIn 0.3s ease-out ${i * 0.05}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--portal-border)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={15} color="#fff" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', letterSpacing: 0.5, flex: 1 }}>OPA</span>
              <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 500 }}>{timeAgo(o.created_at)}</span>
              <button onClick={() => dispensar(o.id)} title="Dispensar (só some pra você)" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--portal-text-muted)' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '12px', cursor: 'pointer' }} onClick={() => router.push('/opa')}>
              <div style={{ display: 'flex', gap: 10 }}>
                {anexo && (
                  isVideo ? (
                    <video src={anexo.url} muted style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#000' }} />
                  ) : (
                    <img src={anexo.url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.titulo}
                  </div>
                  {o.descricao && (
                    <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {o.descricao}
                    </div>
                  )}
                  {isAdmin && o.criado_por_nome && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      <User size={11} /> {o.criado_por_nome}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
              <button
                disabled={resolvendo === o.id}
                onClick={() => resolver(o.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 700,
                  opacity: resolvendo === o.id ? 0.6 : 1,
                }}
              >
                <Check size={15} /> {resolvendo === o.id ? 'Resolvendo...' : 'Resolvido'}
              </button>
              <button
                onClick={() => router.push('/opa')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--portal-border)',
                  cursor: 'pointer', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)',
                  fontSize: 13, fontWeight: 600,
                }}
                title="Ver todos"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )
      })}

      <style>{`@keyframes opaSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  )
}
