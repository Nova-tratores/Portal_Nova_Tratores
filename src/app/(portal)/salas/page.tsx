'use client'
// AGENDA DA SALA DE REUNIÃO — semana/dia em grade (estilo Google Agenda). Todo usuário logado reserva.
// Clique num horário vazio = 1 h; arrastar = escolhe o intervalo. Sobreposição é barrada no banco.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, HelpCircle, MapPin } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import AgendaSemana from '@/components/salas/AgendaSemana'
import FormReserva from '@/components/salas/FormReserva'
import DetalheReserva from '@/components/salas/DetalheReserva'
import { chamar, botao, botaoClaro, cartao } from '@/components/reunioes/comum'
import { semanaDe, diasDaSemana, addDias, hhmm, minutos, diaDaSemana, reservasDoDia, type Reserva, type Sala } from '@/lib/salas/regras'

type Resp = { salas: Sala[]; reservas: Reserva[]; agora: { dia: string; hora: string }; eu: string; admin: boolean; migracaoFaltando?: boolean; error?: string }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const fmt = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`

export default function SalasPage() {
  const isMobile = useIsMobile()
  const [segunda, setSegunda] = useState<string | null>(null)
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [vista, setVista] = useState<'semana' | 'dia' | null>(null)
  const [dados, setDados] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<{ dia: string; inicio: string; fim: string } | Reserva | null>(null)
  const [aberta, setAberta] = useState<Reserva | null>(null)
  const [ajuda, setAjuda] = useState(false)

  const carregar = useCallback(async (seg: string) => {
    try { setErro(''); setDados(await chamar<Resp>(`/api/salas?de=${seg}&ate=${addDias(seg, 5)}`)) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
  }, [])

  // 1ª carga: descobre "hoje" pelo servidor (Brasília) e abre a semana dele.
  useEffect(() => {
    if (segunda) { carregar(segunda); return }
    chamar<Resp>('/api/salas?de=2000-01-01&ate=2000-01-01').then((j) => {
      const hoje = diaDaSemana(j.agora.dia) === 0 ? addDias(j.agora.dia, 1) : j.agora.dia
      setSegunda(semanaDe(hoje)); setDiaSel(hoje)
    }).catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'))
  }, [segunda, carregar])
  useEffect(() => {
    if (!segunda) return
    const f = () => carregar(segunda)
    window.addEventListener('focus', f)
    const t = setInterval(f, 60_000)
    return () => { window.removeEventListener('focus', f); clearInterval(t) }
  }, [segunda, carregar])

  const modo = vista ?? (isMobile ? 'dia' : 'semana')
  const dias = useMemo(() => (segunda ? diasDaSemana(segunda) : []), [segunda])
  const sala = dados?.salas[0] || null
  const agora = dados?.agora || { dia: '', hora: '00:00' }
  const mudarSemana = (n: number) => {
    if (!segunda) return
    const s = addDias(segunda, n * 7)
    setSegunda(s)
    setDiaSel(addDias(s, Math.max(0, Math.min(5, diaDaSemana(diaSel || s) - 1))))   // mesmo dia da semana
  }
  const irHoje = () => { if (!dados) return; const h = diaDaSemana(agora.dia) === 0 ? addDias(agora.dia, 1) : agora.dia; setSegunda(semanaDe(h)); setDiaSel(h) }
  const novaAgora = () => {
    const base = diaSel && diaSel >= agora.dia ? diaSel : agora.dia
    const ini = base === agora.dia ? Math.max(minutos(agora.hora) + (15 - (minutos(agora.hora) % 15)), 7 * 60) : 9 * 60
    setForm({ dia: base, inicio: hhmm(Math.min(ini, 21 * 60)), fim: hhmm(Math.min(ini + 60, 22 * 60)) })
  }
  const recarregar = () => { setForm(null); setAberta(null); if (segunda) carregar(segunda) }

  if (dados?.migracaoFaltando) {
    return <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}><div style={{ ...cartao, color: '#b45309', fontWeight: 600 }}>{dados.error}</div></div>
  }

  return (
    <div style={{ padding: isMobile ? '12px 10px' : '18px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* topo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,145,178,.12)', color: '#0891b2' }}><MapPin size={18} /></span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text,#111)', lineHeight: 1.1 }}>{sala?.nome || 'Sala de reunião'}</div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{segunda ? `${fmt(segunda)} – ${fmt(addDias(segunda, 5))}` : 'Carregando…'}</div>
          </div>
        </div>
        <button onClick={irHoje} style={botaoClaro()}>Hoje</button>
        <button onClick={() => mudarSemana(-1)} aria-label="Semana anterior" style={{ ...botaoClaro(), padding: 8 }}><ChevronLeft size={16} /></button>
        <button onClick={() => mudarSemana(1)} aria-label="Próxima semana" style={{ ...botaoClaro(), padding: 8 }}><ChevronRight size={16} /></button>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 10, overflow: 'hidden' }}>
          {(['dia', 'semana'] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: modo === v ? '#0891b2' : 'var(--portal-surface,#fff)', color: modo === v ? '#fff' : 'var(--portal-text-secondary,#555)' }}>{v === 'dia' ? 'Dia' : 'Semana'}</button>
          ))}
        </div>
        <button onClick={() => setAjuda((a) => !a)} title="Como funciona" style={{ ...botaoClaro(), padding: 8 }}><HelpCircle size={16} /></button>
        <button onClick={() => segunda && carregar(segunda)} title="Atualizar" style={{ ...botaoClaro(), padding: 8 }}><RefreshCw size={15} /></button>
        <button onClick={novaAgora} disabled={!sala} style={botao('#0891b2')}><Plus size={15} /> Reservar</button>
      </div>

      {ajuda && (
        <div style={{ ...cartao, marginBottom: 12, fontSize: 13.5, lineHeight: 1.55, color: 'var(--portal-text-secondary,#444)' }}>
          <b style={{ color: '#0891b2' }}>Como reservar:</b> clique num horário vazio (reserva de 1 h) ou arraste para baixo para escolher o intervalo. Também dá pelo botão <b>Reservar</b>.
          {' '}O portal não deixa duas reservas no mesmo horário. Blocos <b style={{ color: '#7c3aed' }}>roxos 📋</b> são reuniões do portal — ao marcar uma reunião, escolha a sala no campo <b>Local</b> e ela já aparece aqui. Os seus blocos ficam preenchidos; os dos outros, claros.
          {' '}Para mudar ou cancelar, clique no bloco (só quem reservou ou um admin).
        </div>
      )}
      {erro && <div style={{ ...cartao, marginBottom: 12, color: '#dc2626', fontWeight: 600 }}>{erro}</div>}

      {modo === 'dia' && segunda && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
          {dias.map((d) => {
            const sel = d === diaSel
            return (
              <button key={d} onClick={() => setDiaSel(d)} style={{ flex: '1 0 52px', padding: '6px 4px', borderRadius: 10, cursor: 'pointer', border: sel ? '2px solid #0891b2' : '1px solid var(--portal-border,#e5e7eb)', background: sel ? 'rgba(8,145,178,.1)' : 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: d === agora.dia ? '#0891b2' : 'var(--portal-text-muted,#888)' }}>{SEMANA[diaDaSemana(d)]}</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{Number(d.slice(8, 10))}</div>
                <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted,#888)' }}>{reservasDoDia(dados?.reservas || [], d).length ? `${reservasDoDia(dados?.reservas || [], d).length} reserva${reservasDoDia(dados?.reservas || [], d).length > 1 ? 's' : ''}` : ' '}</div>
              </button>
            )
          })}
        </div>
      )}

      {dados && sala && segunda ? (
        <AgendaSemana
          dias={modo === 'dia' ? [diaSel || dias[0]] : dias}
          reservas={dados.reservas} eu={dados.eu} agora={agora} pxPorHora={isMobile ? 52 : 48}
          onNovo={(dia, a, b) => setForm({ dia, inicio: hhmm(a), fim: hhmm(b) })}
          onAbrir={setAberta}
        />
      ) : !erro && <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando a agenda…</div>}

      {form && sala && dados && (
        <FormReserva salaId={sala.id} salaNome={sala.nome} inicial={form} reservas={dados.reservas} minDia={agora.dia} onFechar={() => setForm(null)} onSalva={recarregar} />
      )}
      {aberta && dados && (
        <DetalheReserva reserva={aberta} podeMexer={dados.admin || aberta.responsavel_id === dados.eu || aberta.criado_por === dados.eu}
          onFechar={() => setAberta(null)} onMudou={recarregar} onEditar={() => { setForm(aberta); setAberta(null) }} />
      )}
    </div>
  )
}
