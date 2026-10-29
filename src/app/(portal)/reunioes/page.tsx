'use client'
// REUNIÕES — Próximas · Histórico · Séries. Reunião é um ticket tipo='reuniao'.
// Visual (José, 29/10/2026: "deixa muito semelhante ao das agendas", estilo POS NewPortal):
// lista agrupada por dia como a vista Programação da Agenda — data à esquerda, cartões à direita.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarClock, History, Repeat, Plus, RefreshCw, AlertTriangle, Users, Settings2, GraduationCap, MapPin, ListChecks, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import { ETAPA_INFO, type ReuniaoEtapa, type Serie } from '@/lib/reunioes/regras'
import type { PresencaRow } from '@/lib/reunioes/server'
import FormReuniao from '@/components/reunioes/FormReuniao'
import FormSerie from '@/components/reunioes/FormSerie'
import AjudaAba from '@/components/reunioes/AjudaAba'
import TutorialReunioes, { useTutorialPrimeiraVez } from '@/components/reunioes/TutorialReunioes'
import { chamar, EtapaChip, horaDe, primeiroNome, hojeISO } from '@/components/reunioes/comum'

type Aba = 'proximas' | 'historico' | 'series'
type Resp = {
  reunioes: Ticket[]; presencas: Record<string, PresencaRow[]>; itens: Record<string, number>; usuarios: Record<string, UsuarioMin>
  series: Serie[]; salas?: Record<string, string>; migracaoFaltando?: boolean; error?: string
}

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const diaSP = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts))
const somarDia = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// o título nasce "Série — 19/10/2026": a data já está na coluna da esquerda
const semData = (t: string) => t.replace(/\s*[—–-]\s*\d{2}\/\d{2}(\/\d{2,4})?\s*$/, '') || t
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

const ESTILO_RN = `
.rn{padding:18px 20px 40px;color:var(--portal-text,#0f172a)}
.rn *{font-weight:inherit}
.rn-topo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.rn-aba{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 8px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-size:14px;font-weight:500;cursor:pointer;transition:background .2s,border-color .2s}
.rn-aba .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 11%,transparent)}
.rn-aba.on{background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border-color:color-mix(in srgb,var(--c) 45%,var(--portal-border,#e2e8f0));color:var(--portal-text,#0f172a)}
.rn-aba.on .ic{background:var(--c);color:#fefefe}
.rn-aba .n{font-size:12px;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,transparent);color:var(--c)}
.rn-btn{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 14px;border-radius:11px;font-size:13.5px;font-weight:500;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);white-space:nowrap}
.rn-btn:hover{background:var(--portal-bg-secondary,#f8fafc)}
.rn-btn.cheio{border:none;color:#fefefe;background:var(--c)}
.rn-btn.cheio:hover{filter:brightness(1.06)}
.rn-aviso{margin-bottom:12px;padding:10px 14px;border-radius:12px;font-size:13.5px}
.rn-dia{display:grid;grid-template-columns:84px 1fr;gap:14px;padding:14px 0;border-top:1px solid var(--portal-border,#e2e8f0)}
.rn-dia:first-of-type{border-top:none}
.rn-data{display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:4px;color:var(--portal-text-secondary,#475569)}
.rn-data .num{font-size:28px;line-height:1.05;letter-spacing:-.01em;font-weight:500;color:var(--portal-text,#0f172a);font-variant-numeric:tabular-nums}
.rn-data .sem{font-size:12.5px}
.rn-data .mes{font-size:11.5px;color:var(--portal-text-muted,#94a3b8)}
.rn-data .rel{margin-top:4px;font-size:11.5px;padding:1px 9px;border-radius:999px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#2563eb}
.rn-data.hoje .num{color:#fefefe;background:#2563eb;border-radius:50%;width:46px;height:46px;display:grid;place-items:center;font-size:22px}
.rn-cards{display:flex;flex-direction:column;gap:10px;min-width:0}
.rn-card{display:grid;grid-template-columns:92px 1fr auto;gap:14px;align-items:center;text-align:left;width:100%;padding:14px 18px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);cursor:pointer;color:inherit;font:inherit;transition:box-shadow .25s,transform .25s,border-color .25s}
.rn-card:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c) 35%,var(--portal-border,#e2e8f0))}
.rn-card.passou{opacity:.72}
.rn-hora{display:flex;flex-direction:column;gap:1px;font-variant-numeric:tabular-nums}
.rn-hora b{font-size:17px;font-weight:500;color:var(--portal-text,#0f172a)}
.rn-hora small{font-size:12.5px;color:var(--portal-text-muted,#64748b)}
.rn-meio{display:flex;gap:12px;align-items:center;min-width:0}
.rn-ic{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,var(--c) 18%,transparent)}
.rn-txt{display:flex;flex-direction:column;gap:5px;min-width:0}
.rn-tit{font-size:16px;font-weight:500;color:var(--portal-text,#0f172a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rn-linha{display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap;font-size:13px;color:var(--portal-text-secondary,#475569)}
.rn-linha > span{display:inline-flex;align-items:center;gap:5px}
.rn-serie{padding:1px 9px;border-radius:999px;background:color-mix(in srgb,#4f46e5 9%,transparent);color:#4f46e5}
.rn-av{width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;color:#fefefe;background:#64748b;overflow:hidden;flex:none}
.rn-av img{width:100%;height:100%;object-fit:cover}
.rn-dir{display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.rn-pilhas{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--portal-text-muted,#64748b)}
.rn-pilha{display:flex}
.rn-pilha .rn-av{border:2px solid var(--portal-surface,#fefefe);margin-left:-7px}
.rn-pilha .rn-av:first-child{margin-left:0}
.rn-voce{font-size:12px;padding:1px 9px;border-radius:999px;background:color-mix(in srgb,#059669 10%,transparent);color:#059669}
.rn-vazio{padding:40px 20px;text-align:center;color:var(--portal-text-muted,#64748b);font-size:14px;border:1px dashed var(--portal-border,#e2e8f0);border-radius:16px}
.rn-series{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.rn-serie-card{display:flex;flex-direction:column;gap:10px;padding:16px 18px 14px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe)}
.rn-serie-card .cab{display:flex;align-items:center;gap:12px}
.rn-serie-card .cab b{flex:1;font-size:16px;font-weight:500}
.rn-serie-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:13px}
.rn-serie-card dt{color:var(--portal-text-muted,#64748b)}
.rn-serie-card dd{margin:0;color:var(--portal-text-secondary,#475569)}
@media (max-width:760px){
  .rn{padding:14px 12px 30px}
  .rn-dia{grid-template-columns:56px 1fr;gap:10px}
  .rn-data .num{font-size:22px}
  .rn-card{grid-template-columns:1fr;gap:8px;padding:12px 14px}
  .rn-hora{flex-direction:row;gap:8px;align-items:baseline}
  .rn-dir{flex-direction:row;align-items:center;flex-wrap:wrap}
  .rn-series{grid-template-columns:1fr}
}
`

function Avatar({ u, nome }: { u?: UsuarioMin; nome: string }) {
  return (
    <span className="rn-av" title={nome}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {u?.avatar_url ? <img src={u.avatar_url} alt="" /> : iniciais(nome)}
    </span>
  )
}

function ReunioesInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()
  const [tutorial, setTutorial] = useTutorialPrimeiraVez()
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
  const hoje = hojeISO()
  const abas: { id: Aba; label: string; icone: React.ReactNode; cor: string; n?: number }[] = [
    { id: 'proximas', label: 'Próximas', icone: <CalendarClock size={15} />, cor: '#dc2626', n: aba === 'proximas' ? dados?.reunioes.length : undefined },
    { id: 'historico', label: 'Histórico', icone: <History size={15} />, cor: '#475569' },
    { id: 'series', label: 'Séries', icone: <Repeat size={15} />, cor: '#4f46e5', n: dados?.series.length },
  ]

  // agrupa por dia (a ordem da API já é a certa: próximas ↑, histórico ↓)
  const porDia = useMemo(() => {
    const grupos: { dia: string; lista: Ticket[] }[] = []
    for (const t of dados?.reunioes || []) {
      const d = t.reuniao_inicio ? diaSP(t.reuniao_inicio) : 'sem-data'
      const g = grupos[grupos.length - 1]
      if (g && g.dia === d) g.lista.push(t); else grupos.push({ dia: d, lista: [t] })
    }
    return grupos
  }, [dados])

  const colunaData = (dia: string) => {
    if (dia === 'sem-data') return <div className="rn-data"><span className="sem">Sem data</span></div>
    const d = new Date(`${dia}T12:00:00Z`)
    const rel = dia === hoje ? 'Hoje' : dia === somarDia(hoje, 1) ? 'Amanhã' : dia === somarDia(hoje, -1) ? 'Ontem' : ''
    return (
      <div className={`rn-data${dia === hoje ? ' hoje' : ''}`}>
        <span className="sem">{SEMANA[d.getUTCDay()].slice(0, 3)}</span>
        <span className="num">{d.getUTCDate()}</span>
        <span className="mes">{MESES[d.getUTCMonth()]}{dia.slice(0, 4) !== hoje.slice(0, 4) ? ` ${dia.slice(0, 4)}` : ''}</span>
        {rel && dia !== hoje && <span className="rel">{rel}</span>}
      </div>
    )
  }

  const cardReuniao = (t: Ticket) => {
    const pres = dados?.presencas[t.id] || []
    const condutor = pres.find((p) => p.papel === 'condutor')?.usuario_id || t.solicitante_id
    const serie = dados?.series.find((s) => s.id === t.reuniao_serie_id)
    const nItens = dados?.itens[t.id] || 0
    const etapa = t.reuniao_etapa as ReuniaoEtapa
    const cor = ETAPA_INFO[etapa]?.cor || '#64748b'
    const souDela = pres.some((p) => p.usuario_id === meuId)
    const dur = Math.max(5, Number((t.payload as { duracao_min?: number } | null)?.duracao_min) || 30)
    const fim = t.reuniao_inicio ? new Date(new Date(t.reuniao_inicio).getTime() + dur * 60_000).toISOString() : null
    const sala = dados?.salas?.[t.id]
    const titulo = serie && semData(t.titulo) === serie.nome ? serie.nome : semData(t.titulo)
    const outros = pres.filter((p) => p.usuario_id !== condutor)
    const passou = aba === 'proximas' && !!fim && fim < new Date().toISOString() && etapa !== 'em_andamento'
    return (
      <button key={t.id} className={`rn-card${passou ? ' passou' : ''}`} style={{ ['--c' as string]: cor }} onClick={() => router.push(`/reunioes/${t.id}`)}>
        <span className="rn-hora">
          <b>{horaDe(t.reuniao_inicio)}</b>
          <small>até {horaDe(fim)} · {dur} min</small>
        </span>
        <span className="rn-meio">
          <span className="rn-ic"><Users size={18} /></span>
          <span className="rn-txt">
            <span className="rn-tit" title={t.titulo}>{titulo}</span>
            <span className="rn-linha">
              {serie && titulo !== serie.nome && <span className="rn-serie"><Repeat size={12} /> {serie.nome}</span>}
              {serie && titulo === serie.nome && <span className="rn-serie"><Repeat size={12} /> série</span>}
              <span><Avatar u={dados?.usuarios[condutor]} nome={nome(condutor)} /> conduz {primeiroNome(nome(condutor))}</span>
              {sala && <span><MapPin size={13} /> {sala}</span>}
              <span><ListChecks size={13} /> {nItens ? `${nItens} ${nItens === 1 ? 'item' : 'itens'} na pauta` : 'pauta vazia'}</span>
            </span>
          </span>
        </span>
        <span className="rn-dir">
          <EtapaChip etapa={etapa} />
          <span className="rn-pilhas">
            {outros.length > 0 && (
              <span className="rn-pilha" title={outros.map((p) => nome(p.usuario_id)).join(', ')}>
                {outros.slice(0, 4).map((p) => <Avatar key={p.usuario_id} u={dados?.usuarios[p.usuario_id]} nome={nome(p.usuario_id)} />)}
              </span>
            )}
            <span>{pres.length} {pres.length === 1 ? 'pessoa' : 'pessoas'}</span>
            {souDela && <span className="rn-voce">você participa</span>}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="rn">
      <style>{ESTILO_RN}</style>
      {tutorial && <TutorialReunioes onFechar={() => setTutorial(false)} />}
      <div className="rn-topo">
        {abas.map((a) => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button className={`rn-aba${aba === a.id ? ' on' : ''}`} style={{ ['--c' as string]: a.cor }} onClick={() => router.push(`/reunioes?aba=${a.id}`)}>
              <span className="ic">{a.icone}</span> {a.label}
              {typeof a.n === 'number' && a.n > 0 && <span className="n">{a.n}</span>}
            </button>
            <AjudaAba chave={a.id} />
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <button className="rn-btn" onClick={() => setTutorial(true)} title="Rever o passo a passo das Reuniões"><GraduationCap size={15} />{!isMobile && ' Tutorial'}</button>
        <button className="rn-btn" onClick={() => carregar()} title="Atualizar" style={{ padding: '0 11px' }}><RefreshCw size={15} className={carregando ? 'fa-spin' : undefined} /></button>
        <button className="rn-btn cheio" style={{ ['--c' as string]: '#4f46e5' }} onClick={() => setSerieForm(null)}><Repeat size={15} /> Nova série</button>
        <button className="rn-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={() => setNovaReuniao(null)}><Plus size={16} /> Nova reunião</button>
      </div>

      {(erro || aviso) && (
        <div className="rn-aviso" style={{ background: erro ? 'rgba(220,38,38,.08)' : 'rgba(217,119,6,.1)', color: erro ? '#dc2626' : '#b45309' }}>{erro || aviso}</div>
      )}
      {(dados?.reunioes || []).some((t) => (t.reuniao_etapa as ReuniaoEtapa) === 'em_andamento') && aba === 'proximas' && (
        <div className="rn-aviso" style={{ background: 'rgba(217,119,6,.1)', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> Há reunião em andamento agora.</div>
      )}

      {carregando && !dados ? (
        <div className="rn-vazio">Carregando…</div>
      ) : aba === 'series' ? (
        <div className="rn-series">
          {(dados?.series || []).length === 0 && <div className="rn-vazio">Nenhuma série ainda. Crie uma (&quot;Semanal Oficina&quot;) para as reuniões se encadearem: pendências e itens adiados ou fora do tema passam de uma para a outra.</div>}
          {(dados?.series || []).map((s) => {
            const podeGerir = isAdmin || s.condutor_id === meuId
            return (
              <div key={s.id} className="rn-serie-card" style={{ opacity: s.ativa ? 1 : .6, ['--c' as string]: '#4f46e5' }}>
                <div className="cab">
                  <span className="rn-ic"><Repeat size={18} /></span>
                  <b>{s.nome}</b>
                  {!s.ativa && <span className="rn-voce" style={{ background: 'rgba(100,116,139,.12)', color: '#64748b' }}>inativa</span>}
                  {podeGerir && <button className="rn-btn" style={{ height: 34, padding: '0 9px' }} onClick={() => setSerieForm(s)} title="Configurar"><Settings2 size={15} /></button>}
                </div>
                <dl>
                  <dt>Quando</dt><dd>{s.recorrencia === 'nenhuma' ? 'Sem recorrência' : `${s.recorrencia} · ${SEMANA[s.dia_semana ?? 0].toLowerCase()} às ${s.hora?.slice(0, 5) || '—'}`}</dd>
                  <dt>Duração</dt><dd>{s.duracao_min} min · pauta fecha {s.corte_antecedencia_horas}h antes</dd>
                  <dt>Condutor</dt><dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar u={dados?.usuarios[s.condutor_id]} nome={nome(s.condutor_id)} /> {nome(s.condutor_id)}</dd>
                  {s.secretarios_rodizio.length > 0 && <><dt>Secretários</dt><dd>{s.secretarios_rodizio.map((id) => primeiroNome(nome(id))).join(' → ')}</dd></>}
                  <dt>Participantes</dt><dd>{s.participantes_padrao.length} · {s.visibilidade === 'privado' ? 'privada' : 'pública'}</dd>
                </dl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {podeGerir && <button className="rn-btn cheio" style={{ ['--c' as string]: '#dc2626', height: 36 }} onClick={() => setNovaReuniao(s.id)}><Plus size={14} /> Marcar reunião</button>}
                  <button className="rn-btn" style={{ height: 36 }} onClick={() => router.push(`/reunioes?aba=historico`)}><History size={14} /> Histórico</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : porDia.length === 0 ? (
        <div className="rn-vazio">
          <Clock size={22} style={{ display: 'block', margin: '0 auto 8px', opacity: .6 }} />
          {aba === 'proximas' ? 'Nenhuma reunião marcada. Clique em "Nova reunião".' : 'Nenhuma reunião encerrada ainda.'}
        </div>
      ) : (
        <div>
          {porDia.map((g) => (
            <div key={g.dia} className="rn-dia">
              {colunaData(g.dia)}
              <div className="rn-cards">{g.lista.map(cardReuniao)}</div>
            </div>
          ))}
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
    </div>
  )
}

export default function ReunioesPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando…</div>}><ReunioesInner /></Suspense>
}
