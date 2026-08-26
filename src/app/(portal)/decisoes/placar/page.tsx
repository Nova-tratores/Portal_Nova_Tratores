'use client'
// Placar por decisor (Visão B) + compromissos vencidos (Visão C).
// Fase 1: nº de decisões por decisor/papel + compromissos estourados. As
// colunas financeiras (custo de pátio, margem) chegam na Fase 2 (rastreio por chassi).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import { PAPEL_INFO, type Papel } from '@/lib/decisoes/constantes'

interface LinhaPlacar { ator_id: string | null; papel: Papel; decisoes: number; compromissos_estourados: number }
interface Compromisso {
  decisao: { id: string; ator_id: string | null; prazo_compromisso: string; justificativa: string }
  sc: { id: string; numero: number; modelo: string; status: string; qtd_atual: number }
  dias_atraso: number
}

const PERIODOS = [{ dias: 30, label: '30 dias' }, { dias: 90, label: '90 dias' }, { dias: 365, label: '1 ano' }, { dias: 1095, label: '3 anos' }]

export default function PlacarPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin, pode, temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)

  const [dias, setDias] = useState(90)
  const [placar, setPlacar] = useState<LinhaPlacar[]>([])
  const [compromissos, setCompromissos] = useState<Compromisso[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const gerencial = isAdmin || temAcesso('decisoes') || pode('decisoes', 'gerencial')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const res = await fetch(`/api/decisoes/placar?dias=${dias}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setPlacar(json.placar || [])
      setCompromissos(json.compromissos || [])
      setUsuarios(json.usuarios || {})
    } catch { setErro('Falha de conexão') } finally { setCarregando(false) }
  }, [dias])

  useEffect(() => { if (userProfile && gerencial) carregar() }, [carregar, userProfile, gerencial])

  if (!loadingPerm && userProfile && !gerencial) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>O placar é restrito à visão gerencial (permissão <b>decisoes:gerencial</b> ou admin).</div>
  }

  const nome = (id: string | null) => id ? (usuarios[id] || '—') : 'Sistema'

  return (
    <div style={{ padding: 20, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
          <BarChart3 size={18} /> Placar por decisor
        </h1>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {PERIODOS.map((p) => (
            <button key={p.dias} onClick={() => setDias(p.dias)}
              style={{ padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: dias === p.dias ? '1.5px solid #7c3aed' : '1px solid var(--portal-border,#e5e7eb)',
                background: dias === p.dias ? 'rgba(124,58,237,.08)' : 'var(--portal-surface,#fff)',
                color: dias === p.dias ? '#7c3aed' : 'var(--portal-text-muted,#888)' }}>{p.label}</button>
          ))}
          <button onClick={carregar} style={{ display: 'flex', padding: 7, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: '#888' }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      {carregando ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
      ) : (
        <>
          <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg,#f9fafb)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--portal-text-secondary,#555)' }}>Decisor</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--portal-text-secondary,#555)' }}>Papel</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--portal-text-secondary,#555)', textAlign: 'right' }}>Decisões no período</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--portal-text-secondary,#555)', textAlign: 'right' }}>Compromissos estourados</th>
                </tr>
              </thead>
              <tbody>
                {placar.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#888' }}>Nenhuma decisão no período.</td></tr>
                ) : placar.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--portal-border,#eee)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{nome(l.ator_id)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--portal-text-muted,#888)' }}>{PAPEL_INFO[l.papel]}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{l.decisoes}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: l.compromissos_estourados > 0 ? '#dc2626' : 'var(--portal-text-muted,#999)' }}>{l.compromissos_estourados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#999)', marginTop: -18, marginBottom: 24 }}>
            Custo de pátio atribuído e margem realizada chegam na Fase 2 (rastreio por chassi).
          </div>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--portal-text,#111)', margin: '0 0 12px' }}>
            <AlertTriangle size={16} style={{ color: '#dc2626' }} /> Compromissos vencidos
          </h2>
          {compromissos.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: '#888', fontSize: 13.5 }}>Nenhum compromisso estourado. 👌</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {compromissos.map((c) => (
                <div key={c.decisao.id} onClick={() => router.push(`/decisoes/${c.sc.id}`)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/decisoes/${c.sc.id}`) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(220,38,38,.3)', background: 'rgba(220,38,38,.04)', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>SC #{c.sc.numero} — {c.sc.qtd_atual}× {c.sc.modelo}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 2 }}>
                      Parecer de {nome(c.decisao.ator_id)} previa liquidação até {new Date(c.decisao.prazo_compromisso + 'T12:00:00').toLocaleDateString('pt-BR')} · status "{c.sc.status}"
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', flexShrink: 0 }}>{c.dias_atraso}d de atraso</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
