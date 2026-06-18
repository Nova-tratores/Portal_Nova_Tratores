'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Headset, Check, X, ChevronRight, MapPin, Calendar, AlertTriangle } from 'lucide-react'

interface Sat {
  id: string
  cliente_nome: string
  cliente_endereco: string | null
  tipo: string
  status: string
  data_limite: string | null
  created_at: string
}

const TIPO: Record<string, { label: string; cor: string; bg: string }> = {
  manutencao: { label: 'Manutenção', cor: '#0EA5E9', bg: '#e0f2fe' },
  revisao:    { label: 'Revisão', cor: '#f59e0b', bg: '#fef3c7' },
  entrega:    { label: 'Entrega técnica', cor: '#10B981', bg: '#d1fae5' },
  orcamento:  { label: 'Orçamento', cor: '#8B5CF6', bg: '#ede9fe' },
}
const fmtData = (d: string) => { const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y}` }
const hojeStr = () => new Date().toISOString().slice(0, 10)
const MAX = 4

export default function SatLembrete({ userId, userName }: { userId?: string; userName?: string }) {
  const router = useRouter()
  const [sats, setSats] = useState<Sat[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const dismissKey = userId ? `sat-dismissed-${userId}` : ''

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('portal_sats')
      .select('id, cliente_nome, cliente_endereco, tipo, status, data_limite, created_at')
      .in('status', ['aberto', 'andamento'])
      .order('created_at', { ascending: false })
    setSats((data as Sat[]) || [])
  }, [])

  useEffect(() => {
    if (!userId) return
    carregar()
    const ch = supabase.channel('sat_lembrete_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_sats' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, carregar])

  useEffect(() => {
    if (!dismissKey) return
    try { const s = localStorage.getItem(dismissKey); if (s) setDismissed(JSON.parse(s)) } catch { /* */ }
  }, [dismissKey])

  const dispensar = (id: string) => {
    setDismissed(prev => { const n = [...prev, id]; if (dismissKey) localStorage.setItem(dismissKey, JSON.stringify(n)); return n })
  }

  const concluir = async (id: string) => {
    if (!userId) return
    setBusy(id)
    await supabase.rpc('concluir_sat', { p_id: id, p_user_id: userId, p_user_nome: userName || 'Usuário' })
    setSats(prev => prev.filter(s => s.id !== id))
    setBusy(null)
  }

  const visiveis = sats.filter(s => !dismissed.includes(s.id))
  if (!userId || visiveis.length === 0) return null
  const mostrados = visiveis.slice(0, MAX)
  const extras = visiveis.length - mostrados.length

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 48000, display: 'flex', flexDirection: 'column', gap: 10, width: 340, maxWidth: 'calc(100vw - 40px)' }}>
      {extras > 0 && (
        <button onClick={() => router.push('/sat')} style={{ alignSelf: 'flex-end', background: '#0369A1', color: '#fff', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(3,105,161,0.25)' }}>
          +{extras} SAT{extras > 1 ? 's' : ''} aberto{extras > 1 ? 's' : ''}
        </button>
      )}
      {mostrados.map((s, i) => {
        const t = TIPO[s.tipo] || TIPO.manutencao
        const atrasado = s.data_limite && s.data_limite < hojeStr()
        return (
          <div key={s.id} style={{ background: 'var(--portal-bg-card, #fff)', border: '1px solid #bae6fd', borderLeft: `4px solid ${t.cor}`, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', overflow: 'hidden', animation: `satIn 0.3s ease-out ${i * 0.05}s both` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--portal-border, #eee)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #0EA5E9, #0369A1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Headset size={15} color="#fff" />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: t.cor }}>SAT · {t.label.toUpperCase()}</span>
              {s.status === 'andamento' && <span style={{ fontSize: 9, fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>EM ANDAMENTO</span>}
              <button onClick={() => dispensar(s.id)} title="Dispensar (só some pra você)" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--portal-text-muted, #9ca3af)' }}><X size={15} /></button>
            </div>
            <div style={{ padding: 12, cursor: 'pointer' }} onClick={() => router.push('/sat')}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 3 }}>{s.cliente_nome}</div>
              {s.cliente_endereco && (
                <div style={{ fontSize: 11, color: 'var(--portal-text-secondary, #6b7280)', display: 'flex', alignItems: 'flex-start', gap: 4, lineHeight: 1.4 }}>
                  <MapPin size={11} style={{ flexShrink: 0, marginTop: 1 }} /> {s.cliente_endereco}
                </div>
              )}
              {s.data_limite && (
                <div style={{ fontSize: 11, marginTop: 6, fontWeight: atrasado ? 700 : 500, color: atrasado ? '#dc2626' : 'var(--portal-text-muted, #9ca3af)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {atrasado ? <AlertTriangle size={11} /> : <Calendar size={11} />} Limite: {fmtData(s.data_limite)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
              <button disabled={busy === s.id} onClick={() => concluir(s.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 9, borderRadius: 10, border: 'none', background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy === s.id ? 0.6 : 1 }}>
                <Check size={15} /> {busy === s.id ? 'Concluindo...' : 'Concluir'}
              </button>
              <button onClick={() => router.push('/sat')} title="Abrir Kanban" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--portal-border, #e5e5e5)', cursor: 'pointer', background: 'var(--portal-bg-secondary, #f5f5f5)', color: 'var(--portal-text-secondary, #666)' }}><ChevronRight size={15} /></button>
            </div>
          </div>
        )
      })}
      <style>{`@keyframes satIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  )
}
