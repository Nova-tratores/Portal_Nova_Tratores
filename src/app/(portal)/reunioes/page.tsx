'use client'
// REUNIÕES — Próximas · Histórico · Séries. Reunião é um ticket tipo='reuniao'.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarClock, History, Repeat, Plus, RefreshCw, AlertTriangle, Users, Settings2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import { ETAPA_INFO, type ReuniaoEtapa, type Serie } from '@/lib/reunioes/regras'
import type { PresencaRow } from '@/lib/reunioes/server'
import FormReuniao from '@/components/reunioes/FormReuniao'
import FormSerie from '@/components/reunioes/FormSerie'
import { cartao, botao, chamar, EtapaChip, diaDe, horaDe, primeiroNome, chip } from '@/components/reunioes/comum'

type Aba = 'proximas' | 'historico' | 'series'
type Resp = { reunioes: Ticket[]; presencas: Record<string, PresencaRow[]>; itens: Record<string, number>; usuarios: Record<string, UsuarioMin>; series: Serie[]; migracaoFaltando?: boolean; error?: string }

function ReunioesInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()
  const aba = (['proximas', 'historico', 'series'].includes(sp.get('aba') || '') ? sp.get('aba') : 'proximas') as Aba
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novaReuniao, setNovaReuniao] = useState<string | null | false>(false)
  const [serieForm, setSerieForm] = useState<Serie | null | false>(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const j = await chamar<Resp>(`/api/reunioes?visao=${aba === 'historico' ? 'historico' : 'proximas'}`)
      setDados(j); setErro(j.migracaoFaltando ? j.error || '' : '')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') } finally { setCarregando(false) }
  }, [aba])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f); window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const nome = (id: string) => dados?.usuarios[id]?.nome || '—'
  const meuId = userProfile?.id || ''
  const abas: { id: Aba; label: string; icone: React.ReactNode }[] = [
    { id: 'proximas', label: 'Próximas', icone: <CalendarClock size={15} /> },
    { id: 'historico', label: 'Histórico', icone: <History size={15} /> },
    { id: 'series', label: 'Séries', icone: <Repeat size={15} /> },
  ]

  const cardReuniao = (t: Ticket) => {
    const pres = dados?.presencas[t.id] || []
    const condutor = pres.find((p) => p.papel === 'condutor')?.usuario_id || t.solicitante_id
    const serie = dados?.series.find((s) => s.id === t.reuniao_serie_id)
    const nItens = dados?.itens[t.id] || 0
    const etapa = t.reuniao_etapa as ReuniaoEtapa
    const souDela = pres.some((p) => p.usuario_id === meuId)
    return (
      <button key={t.id} onClick={() => router.push(`/reunioes/${t.id}`)}
        style={{ ...cartao, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${ETAPA_INFO[etapa]?.cor || '#999'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text,#111)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</span>
          <EtapaChip etapa={etapa} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>
          <span style={{ fontWeight: 700, color: 'var(--portal-text-secondary,#555)' }}><CalendarClock size={12} style={{ verticalAlign: -2 }} /> {diaDe(t.reuniao_inicio)} · {horaDe(t.reuniao_inicio)}</span>
          {serie && <span style={chip('#4f46e5', 'rgba(79,70,229,.1)')}><Repeat size={11} /> {serie.nome}</span>}
          <span>conduz {primeiroNome(nome(condutor))}</span>
          <span><Users size={12} style={{ verticalAlign: -2 }} /> {pres.length}</span>
          <span>{nItens} {nItens === 1 ? 'item' : 'itens'} na pauta</span>
          {souDela && <span style={chip('#059669', 'rgba(5,150,105,.1)')}>você participa</span>}
        </div>
      </button>
    )
  }

  return (
    <div style={{ padding: isMobile ? '14px 12px' : '18px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {abas.map((a) => {
            const ativo = aba === a.id
            return (
              <button key={a.id} onClick={() => router.push(`/reunioes?aba=${a.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: ativo ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)', background: ativo ? 'rgba(220,38,38,.07)' : 'var(--portal-surface,#fff)', color: ativo ? '#dc2626' : 'var(--portal-text-secondary,#555)' }}>
                {a.icone} {a.label}
              </button>
            )
          })}
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={() => carregar()} title="Atualizar" style={{ display: 'flex', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}><RefreshCw size={14} /></button>
        <button onClick={() => setSerieForm(null)} style={{ ...botao('#4f46e5') }}><Repeat size={14} /> Nova série</button>
        <button onClick={() => setNovaReuniao(null)} style={botao()}><Plus size={15} /> Nova reunião</button>
      </div>

      {(erro || aviso) && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: erro ? 'rgba(220,38,38,.08)' : 'rgba(217,119,6,.1)', color: erro ? '#dc2626' : '#b45309', fontSize: 13, fontWeight: 600 }}>
          {erro || aviso}
        </div>
      )}

      {carregando && !dados ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando…</div>
      ) : aba === 'series' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {(dados?.series || []).length === 0 && <div style={{ ...cartao, color: 'var(--portal-text-muted,#888)', fontSize: 13 }}>Nenhuma série ainda. Crie uma (&quot;Semanal Oficina&quot;) para as reuniões se encadearem: pendências, parking lot e adiados passam de uma para a outra.</div>}
          {(dados?.series || []).map((s) => {
            const podeGerir = isAdmin || s.condutor_id === meuId
            return (
              <div key={s.id} style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 6, opacity: s.ativa ? 1 : .6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text,#111)', flex: 1 }}>{s.nome}</span>
                  {!s.ativa && <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>inativa</span>}
                  {podeGerir && <button onClick={() => setSerieForm(s)} title="Configurar" style={{ border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--portal-text-muted,#888)', display: 'flex' }}><Settings2 size={14} /></button>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>{s.recorrencia === 'nenhuma' ? 'Sem recorrência' : `${s.recorrencia} · ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][s.dia_semana ?? 0]} ${s.hora?.slice(0, 5) || ''}`} · {s.duracao_min} min · corte {s.corte_antecedencia_horas}h antes</span>
                  <span>Condutor: <b>{nome(s.condutor_id)}</b></span>
                  {s.secretarios_rodizio.length > 0 && <span>Secretários: {s.secretarios_rodizio.map((id) => primeiroNome(nome(id))).join(' → ')}</span>}
                  <span>{s.participantes_padrao.length} participante(s) padrão · {s.visibilidade === 'privado' ? 'privada' : 'pública'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {podeGerir && <button onClick={() => setNovaReuniao(s.id)} style={botao('#dc2626')}><Plus size={13} /> Marcar reunião</button>}
                  <button onClick={() => router.push(`/reunioes?aba=historico`)} style={{ ...botao('var(--portal-bg,#f3f4f6)'), color: 'var(--portal-text,#111)' }}><History size={13} /> Histórico</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {(dados?.reunioes || []).length === 0 && (
            <div style={{ ...cartao, color: 'var(--portal-text-muted,#888)', fontSize: 13 }}>
              {aba === 'proximas' ? 'Nenhuma reunião marcada. Clique em "Nova reunião".' : 'Nenhuma reunião encerrada ainda.'}
            </div>
          )}
          {(dados?.reunioes || []).map(cardReuniao)}
        </div>
      )}

      {novaReuniao !== false && userProfile && (
        <FormReuniao series={(dados?.series || []).filter((s) => s.ativa)} usuarios={dados?.usuarios || {}} meuId={meuId} serieInicial={novaReuniao}
          onFechar={() => setNovaReuniao(false)}
          onCriada={(t, av) => { setNovaReuniao(false); setAviso(av || ''); window.dispatchEvent(new Event('central-trabalho-mudou')); router.push(`/reunioes/${t.id}`) }} />
      )}
      {serieForm !== false && userProfile && (
        <FormSerie inicial={serieForm} usuarios={dados?.usuarios || {}} meuId={meuId}
          onFechar={() => setSerieForm(false)}
          onSalvo={() => { setSerieForm(false); carregar(); if (aba !== 'series') router.push('/reunioes?aba=series') }} />
      )}
      {(dados?.reunioes || []).some((t) => (t.reuniao_etapa as ReuniaoEtapa) === 'em_andamento') && aba === 'proximas' && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} /> Há reunião em andamento.</div>
      )}
    </div>
  )
}

export default function ReunioesPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando…</div>}><ReunioesInner /></Suspense>
}
