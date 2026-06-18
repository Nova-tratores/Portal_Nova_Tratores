'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AlertCircle, Check, CheckCheck, ChevronRight, User } from 'lucide-react'

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

export default function OpaLembrete({
  userId, userName, isAdmin,
}: { userId?: string; userName?: string; isAdmin?: boolean }) {
  const router = useRouter()
  const [opas, setOpas] = useState<Opa[]>([])
  const [lidos, setLidos] = useState<string[]>([])   // ids que ESTE usuário já marcou como lido (do banco)
  const [resolvendo, setResolvendo] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)

  // Carregar opas abertos + anexos + o que este usuário já leu
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
    if (userId) {
      // "Lido" = quem já viu/leu (mesma tabela que o /opa mostra como "pessoas viram")
      const { data: ld } = await supabase
        .from('portal_opas_views')
        .select('opa_id')
        .eq('user_id', userId)
      setLidos((ld || []).map(d => d.opa_id))
    }
    setOpas(lista.map(o => ({ ...o, anexos: anexos.filter(a => a.opa_id === o.id) })))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    carregar()
    const ch = supabase.channel('opa_lembrete_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_opas' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, carregar])

  // Marcar como lido (só some pra mim — fica registrado no banco quem leu)
  const marcarLido = async (id: string) => {
    if (!userId) return
    setMarcando(id)
    await supabase.from('portal_opas_views').upsert(
      { opa_id: id, user_id: userId, user_nome: userName || 'Usuário', visto_at: new Date().toISOString() },
      { onConflict: 'opa_id,user_id' }
    )
    setLidos(prev => prev.includes(id) ? prev : [...prev, id])
    setMarcando(null)
  }

  // Resolver (some pra todos)
  const resolver = async (id: string) => {
    if (!userId) return
    setResolvendo(id)
    const { data } = await supabase.rpc('resolver_opa', {
      p_opa_id: id, p_user_id: userId, p_user_nome: userName || 'Usuário', p_user_tipo: 'portal',
    })
    setOpas(prev => prev.filter(o => o.id !== id))
    setResolvendo(null)
    void data
  }

  const visiveis = opas.filter(o => !lidos.includes(o.id))
  if (!userId || visiveis.length === 0) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 54000,
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: 480, maxWidth: '96vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} color="#fff" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.3 }}>
            {visiveis.length === 1 ? '1 Opa aberto' : `${visiveis.length} Opas abertos`}
          </div>
        </div>

        {visiveis.map((o, i) => {
          const anexo = o.anexos?.[0]
          const isVideo = anexo?.tipo?.startsWith('video')
          return (
            <div key={o.id} style={{
              background: '#fff', border: '1px solid #FCA5A5',
              borderLeft: '4px solid #dc2626', borderRadius: 14,
              boxShadow: '0 18px 40px rgba(0,0,0,0.28)', overflow: 'hidden',
              animation: `opaPop 0.28s ease-out ${i * 0.05}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', letterSpacing: 0.5, flex: 1 }}>OPA</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{timeAgo(o.created_at)}</span>
              </div>

              <div style={{ padding: '14px', cursor: 'pointer' }} onClick={() => router.push('/opa')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  {anexo && (
                    isVideo ? (
                      <video src={anexo.url} muted style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#000' }} />
                    ) : (
                      <img src={anexo.url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    )
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 3 }}>
                      {o.titulo}
                    </div>
                    {o.descricao && (
                      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {o.descricao}
                      </div>
                    )}
                    {isAdmin && o.criado_por_nome && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                        <User size={11} /> {o.criado_por_nome}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
                <button
                  disabled={marcando === o.id}
                  onClick={() => marcarLido(o.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontSize: 13.5, fontWeight: 700,
                    opacity: marcando === o.id ? 0.6 : 1,
                  }}
                >
                  <Check size={16} /> {marcando === o.id ? 'Marcando...' : 'Li, marcar como lido'}
                </button>
                <button
                  disabled={resolvendo === o.id}
                  onClick={() => resolver(o.id)}
                  title="Resolver (some para todos)"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '11px 14px', borderRadius: 10, border: '1px solid #a7f3d0', cursor: 'pointer',
                    background: '#ecfdf5', color: '#059669', fontSize: 13, fontWeight: 700,
                    opacity: resolvendo === o.id ? 0.6 : 1,
                  }}
                >
                  <CheckCheck size={16} /> Resolvido
                </button>
                <button
                  onClick={() => router.push('/opa')}
                  title="Ver todos"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '11px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
                    cursor: 'pointer', background: '#f8fafc', color: '#475569',
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )
        })}

        <style>{`@keyframes opaPop { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      </div>
    </div>
  )
}
