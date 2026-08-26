'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Clock, Github, Server, Triangle, AlertTriangle, RefreshCw } from 'lucide-react'
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

// +1 coluna ("Última execução") em relação ao catálogo original.
const GRID = 'minmax(200px,1.3fr) 168px 92px 128px 136px minmax(220px,1.6fr)'

// -------- Status ao vivo (GitHub Actions) --------
type RunInfo = {
  conclusion: string | null
  status: string
  createdAt: string
  htmlUrl: string
  event: string
  runNumber: number
}
type RunsMap = Record<string, RunInfo>

function tempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} d`
}

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

// Mapeia a última execução do workflow numa pílula de status.
function StatusSync({ a, run }: { a: Agendamento; run?: RunInfo }) {
  if (a.fonte !== 'github') {
    return <span style={{ fontSize: '.72rem', color: '#bbb' }}>—</span>
  }
  let pill: React.ReactNode
  if (!run) {
    pill = <Badge texto="⚪ Sem execução" cor="#6b7280" bg="#f9fafb" border="#e5e7eb" />
  } else if (run.status !== 'completed') {
    pill = <Badge texto="⏳ Rodando" cor="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
  } else if (run.conclusion === 'success') {
    pill = <Badge texto="✅ Sucesso" cor="#047857" bg="#ecfdf5" border="#a7f3d0" />
  } else if (run.conclusion === 'failure' || run.conclusion === 'cancelled') {
    pill = <Badge texto={run.conclusion === 'cancelled' ? '⚠️ Cancelado' : '❌ Falhou'} cor="#b91c1c" bg="#fef2f2" border="#fecaca" />
  } else {
    pill = <Badge texto={run.conclusion || '—'} cor="#6b7280" bg="#f9fafb" border="#e5e7eb" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {run?.htmlUrl ? (
        <a href={run.htmlUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{pill}</a>
      ) : pill}
      {run && <span style={{ fontSize: '.64rem', color: '#9ca3af' }}>{tempoRelativo(run.createdAt)}</span>}
    </div>
  )
}

function Linha({ a, run }: { a: Agendamento; run?: RunInfo }) {
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
      <div><StatusSync a={a} run={run} /></div>
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

function Secao({ fonte, runs }: { fonte: FonteCron; runs: RunsMap }) {
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
        <span>Última execução</span>
        <span>Módulo</span>
        <span>Frequência</span>
        <span>Horário (BRT)</span>
        <span>Alvo</span>
      </div>

      {itens.map((a) => (
        <Linha key={`${a.fonte}-${a.nome}-${a.arquivo}`} a={a} run={runs[a.arquivo]} />
      ))}
    </div>
  )
}

export default function AgendamentosPage() {
  const { userProfile, loading: loadingAuth } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)

  const [runs, setRuns] = useState<RunsMap>({})
  const [tokenAusente, setTokenAusente] = useState(false)
  const [erroStatus, setErroStatus] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function carregarStatus() {
    setCarregando(true)
    try {
      const r = await fetch('/api/agendamentos/status')
      const d = await r.json()
      if (d.ok) {
        setRuns(d.runs || {}); setTokenAusente(false); setErroStatus('')
      } else {
        setRuns({})
        if (String(d.motivo || '').includes('GITHUB_TOKEN')) setTokenAusente(true)
        else setErroStatus(d.motivo || 'Falha ao consultar o GitHub')
      }
    } catch (e) {
      setErroStatus((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    carregarStatus()
    const id = setInterval(carregarStatus, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const contagem = useMemo(() => {
    const c: Record<FonteCron, number> = { github: 0, 'in-process': 0, 'vercel-inativo': 0 }
    for (const a of AGENDAMENTOS) c[a.fonte]++
    return c
  }, [])

  // Falhas da última execução (só GitHub).
  const falhas = useMemo(() => {
    return AGENDAMENTOS.filter((a) => {
      if (a.fonte !== 'github') return false
      const c = runs[a.arquivo]?.conclusion
      return c === 'failure' || c === 'cancelled'
    })
  }, [runs])

  if (loadingAuth || loadingPerm) return null
  if (userProfile && !isAdmin) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={26} style={{ color: '#dc2626' }} />
            Sincronizações &amp; Agendamentos
          </h2>
          <p style={{ color: 'var(--portal-text-muted)', fontSize: 14 }}>
            Catálogo dos agendamentos e o <strong>resultado da última execução</strong> de cada cron (GitHub Actions).
          </p>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
            &quot;Sucesso&quot; = a chamada agendada retornou 200; o processamento roda em background.
          </p>
        </div>
        <button
          onClick={carregarStatus} disabled={carregando}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
            fontSize: '.8rem', fontWeight: 600, cursor: carregando ? 'default' : 'pointer',
          }}
        >
          <RefreshCw size={14} style={carregando ? { animation: 'spin 1s linear infinite' } : undefined} />
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {/* Banner: falhas / token ausente / erro */}
      {falhas.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '.84rem' }}>
          <AlertTriangle size={18} />
          <span>
            <strong>{falhas.length}</strong> {falhas.length === 1 ? 'sincronização falhou' : 'sincronizações falharam'} na última execução:{' '}
            {falhas.map((a) => a.nome).join(', ')}.
          </span>
        </div>
      )}
      {tokenAusente && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '.82rem' }}>
          <AlertTriangle size={16} />
          Configure <code>GITHUB_TOKEN</code> (Railway) para ver o status ao vivo das execuções.
        </div>
      )}
      {erroStatus && !tokenAusente && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, borderRadius: 12, background: '#f9fafb', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: '.8rem' }}>
          <AlertTriangle size={16} /> Status indisponível: {erroStatus}
        </div>
      )}

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
        <Secao key={f} fonte={f} runs={runs} />
      ))}

      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
