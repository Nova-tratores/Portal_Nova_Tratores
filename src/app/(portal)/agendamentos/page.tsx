'use client'
import { useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Clock, Github, Server, Triangle, AlertTriangle } from 'lucide-react'
import {
  AGENDAMENTOS,
  FONTE_LABEL,
  FONTE_COR,
  type Agendamento,
  type FonteCron,
} from '@/lib/agendamentos/registry'

const ORDEM_FONTES: FonteCron[] = ['github', 'in-process', 'vercel-inativo']

const ICONE_FONTE: Record<FonteCron, React.ReactNode> = {
  github: <Github size={16} />,
  'in-process': <Server size={16} />,
  'vercel-inativo': <Triangle size={16} />,
}

const GRID = 'minmax(220px,1.4fr) 110px 150px 160px minmax(260px,1.8fr)'

function Badge({ texto, cor, bg, border }: { texto: string; cor: string; bg: string; border: string }) {
  return (
    <span
      style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 999,
        fontSize: '.66rem', fontWeight: 700, color: cor, background: bg,
        border: `1px solid ${border}`, whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  )
}

function Linha({ a }: { a: Agendamento }) {
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: GRID, gap: 12,
        padding: '12px 16px', borderBottom: '1px solid #f5f5f5', alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: '.86rem', color: '#222' }}>{a.nome}</div>
        {(a.condicional || a.obs) && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {a.condicional && <Badge texto={a.condicional} cor="#92400e" bg="#fffbeb" border="#fde68a" />}
            {a.obs && <Badge texto={a.obs} cor="#6b7280" bg="#f9fafb" border="#e5e7eb" />}
          </div>
        )}
      </div>
      <div style={{ fontSize: '.8rem', color: '#444', fontWeight: 600 }}>{a.modulo}</div>
      <div style={{ fontSize: '.82rem', color: '#222' }}>
        {a.frequencia}
        {a.cron && (
          <div style={{ fontSize: '.66rem', color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>
            {a.cron}
          </div>
        )}
      </div>
      <div style={{ fontSize: '.8rem', color: a.horarioBRT ? '#222' : '#bbb' }}>{a.horarioBRT || '—'}</div>
      <div style={{ fontSize: '.74rem', color: '#555', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {a.alvo}
        <div style={{ fontSize: '.64rem', color: '#bbb', marginTop: 2 }}>{a.arquivo}</div>
      </div>
    </div>
  )
}

function Secao({ fonte }: { fonte: FonteCron }) {
  const itens = AGENDAMENTOS.filter((a) => a.fonte === fonte)
  if (itens.length === 0) return null
  const cor = FONTE_COR[fonte]
  const inativo = fonte === 'vercel-inativo'

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #eee', borderRadius: 12,
        marginBottom: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
      }}
    >
      {/* Cabeçalho da seção */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          background: cor.bg, borderBottom: `1px solid ${cor.border}`, color: cor.fg,
        }}
      >
        {ICONE_FONTE[fonte]}
        <span style={{ fontWeight: 700, fontSize: '.92rem' }}>{FONTE_LABEL[fonte]}</span>
        <span style={{ fontSize: '.72rem', fontWeight: 600, opacity: 0.8 }}>
          {itens.length} {itens.length === 1 ? 'job' : 'jobs'}
        </span>
      </div>

      {inativo && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#92400e', fontSize: '.78rem',
          }}
        >
          <AlertTriangle size={15} />
          Estes crons estão definidos no <code>vercel.json</code>, mas o portal roda no Railway — então
          <strong>&nbsp;não são executados</strong>. Só valeriam num deploy na Vercel.
        </div>
      )}

      {/* Cabeçalho das colunas */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '10px 16px',
          background: '#fafafa', fontSize: '.64rem', fontWeight: 700, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: '.5px',
        }}
      >
        <span>Sincronização</span>
        <span>Módulo</span>
        <span>Frequência</span>
        <span>Horário (BRT)</span>
        <span>Alvo</span>
      </div>

      {itens.map((a) => (
        <Linha key={`${a.fonte}-${a.nome}-${a.arquivo}`} a={a} />
      ))}
    </div>
  )
}

export default function AgendamentosPage() {
  const { userProfile, loading: loadingAuth } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)

  const contagem = useMemo(() => {
    const c: Record<FonteCron, number> = { github: 0, 'in-process': 0, 'vercel-inativo': 0 }
    for (const a of AGENDAMENTOS) c[a.fonte]++
    return c
  }, [])

  if (loadingAuth || loadingPerm) return null
  if (userProfile && !isAdmin) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={26} style={{ color: '#dc2626' }} />
          Sincronizações &amp; Agendamentos
        </h2>
        <p style={{ color: 'var(--portal-text-muted)', fontSize: 14 }}>
          Catálogo de todos os agendamentos de sincronização (Omie, rotas, NFs…), agrupados pela fonte que os dispara.
        </p>
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize: '.64rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#222' }}>{AGENDAMENTOS.length}</div>
        </div>
        {ORDEM_FONTES.map((f) => {
          const cor = FONTE_COR[f]
          return (
            <div key={f} style={{ background: cor.bg, border: `1px solid ${cor.border}`, borderRadius: 12, padding: '12px 18px' }}>
              <div style={{ fontSize: '.64rem', color: cor.fg, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, opacity: 0.85 }}>
                {FONTE_LABEL[f]}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: cor.fg }}>{contagem[f]}</div>
            </div>
          )
        })}
      </div>

      {ORDEM_FONTES.map((f) => (
        <Secao key={f} fonte={f} />
      ))}
    </div>
  )
}
