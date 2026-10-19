'use client'
// AGENDA DA SALA DE REUNIÃO — semana/dia em grade (estilo Google Agenda). Todo usuário logado reserva.
// Clique num horário vazio = 1 h; arrastar = escolhe o intervalo. Sobreposição é barrada no banco.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, HelpCircle, MapPin, CalendarX2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/hooks/useIsMobile'
import AgendaSemana from '@/components/salas/AgendaSemana'
import FormReserva from '@/components/salas/FormReserva'
import DetalheReserva from '@/components/salas/DetalheReserva'
import FormBloqueio from '@/components/agenda/FormBloqueio'
import DetalheBloqueio, { idDoBloco } from '@/components/agenda/DetalheBloqueio'
import { bloqueioNaGrade, type Bloqueio } from '@/lib/agenda/bloqueios'
import { chamar, botao, botaoClaro, cartao } from '@/components/reunioes/comum'
import { semanaDe, diasDaSemana, addDias, hhmm, minutos, diaDaSemana, reservasDoDia, type Reserva, type Sala } from '@/lib/salas/regras'

type RespMinha = { bloqueios: Bloqueio[]; reunioes: { id: string; numero: number; titulo: string; inicio: string; fim: string }[]; migracaoFaltando?: boolean; error?: string }
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
  // "Sala de reunião" (agenda da sala) x "Minha agenda" (meus bloqueios + minhas reuniões)
  const [agendaDe, setAgendaDe] = useState<'sala' | 'minha'>('sala')
  const [minha, setMinha] = useState<RespMinha | null>(null)
  const [formBloqueio, setFormBloqueio] = useState<{ dia: string; inicio: string; fim: string } | null>(null)
  const [bloqueioAberto, setBloqueioAberto] = useState<Bloqueio | null>(null)
  const router = useRouter()

  const carregar = useCallback(async (seg: string) => {
    try {
      setErro('')
      const [d, m] = await Promise.all([
        chamar<Resp>(`/api/salas?de=${seg}&ate=${addDias(seg, 5)}`),
        chamar<RespMinha>(`/api/agenda/bloqueios?de=${seg}&ate=${addDias(seg, 5)}`).catch(() => null),
      ])
      setDados(d); setMinha(m)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
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
  const recarregar = () => { setForm(null); setAberta(null); setFormBloqueio(null); setBloqueioAberto(null); if (segunda) carregar(segunda) }
  const naMinha = agendaDe === 'minha'
  const blocosMinha = useMemo((): Reserva[] => {
    if (!minha || !dados) return []
    return [
      ...minha.bloqueios.flatMap((b) => bloqueioNaGrade(b, dados.eu)),
      ...minha.reunioes.map((r) => ({ id: `r:${r.id}`, sala_id: '', inicio: r.inicio, fim: r.fim, titulo: r.titulo, descricao: null, responsavel_id: '', criado_por: '', reuniao_id: r.id, status: 'ativa' as const })),
    ]
  }, [minha, dados])
  const blocos = naMinha ? blocosMinha : (dados?.reservas || [])
  const abrirBloco = (r: Reserva) => {
    if (!naMinha) { setAberta(r); return }
    const bid = idDoBloco(r)
    if (bid) { setBloqueioAberto(minha?.bloqueios.find((b) => b.id === bid) || null); return }
    if (r.reuniao_id) router.push(`/reunioes/${r.reuniao_id}`)
  }

  if (dados?.migracaoFaltando) {
    return <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}><div style={{ ...cartao, color: '#b45309', fontWeight: 600 }}>{dados.error}</div></div>
  }

  return (
    <div style={{ padding: isMobile ? '12px 10px' : '18px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* topo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setAgendaDe('sala')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, background: !naMinha ? '#0891b2' : 'var(--portal-surface,#fff)', color: !naMinha ? '#fff' : 'var(--portal-text-secondary,#555)' }}><MapPin size={15} /> {sala?.nome || 'Sala de reunião'}</button>
            <button onClick={() => setAgendaDe('minha')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800, background: naMinha ? '#475569' : 'var(--portal-surface,#fff)', color: naMinha ? '#fff' : 'var(--portal-text-secondary,#555)' }}><CalendarX2 size={15} /> Minha agenda</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>{segunda ? `${fmt(segunda)} – ${fmt(addDias(segunda, 5))}` : 'Carregando…'}</div>
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
        {naMinha
          ? <button onClick={() => { const base = diaSel && diaSel >= agora.dia ? diaSel : agora.dia; setFormBloqueio({ dia: base, inicio: '09:00', fim: '10:00' }) }} style={botao('#475569')}><CalendarX2 size={15} /> Bloquear horário</button>
          : <button onClick={novaAgora} disabled={!sala} style={botao('#0891b2')}><Plus size={15} /> Reservar</button>}
      </div>

      {ajuda && (
        <div style={{ ...cartao, marginBottom: 12, fontSize: 13.5, lineHeight: 1.55, color: 'var(--portal-text-secondary,#444)' }}>
          <b style={{ color: '#0891b2' }}>Como reservar:</b> clique num horário vazio (reserva de 1 h) ou arraste para baixo para escolher o intervalo. Também dá pelo botão <b>Reservar</b>.
          {' '}O portal não deixa duas reservas no mesmo horário. Blocos <b style={{ color: '#7c3aed' }}>roxos 📋</b> são reuniões do portal — ao marcar uma reunião, escolha a sala no campo <b>Local</b> e ela já aparece aqui. Os seus blocos ficam preenchidos; os dos outros, claros.
          {' '}Para mudar ou cancelar, clique no bloco (só quem reservou ou um admin).
          <br /><b style={{ color: '#475569' }}>Minha agenda:</b> mostra as suas reuniões e os horários que você bloqueou. Clique num horário vazio para <b>bloquear</b> (visita, médico, férias…): ninguém consegue te colocar numa reunião nesse horário, e os outros veem só &quot;indisponível&quot; — o motivo fica só para você.
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
                <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted,#888)' }}>{reservasDoDia(blocos, d).length ? `${reservasDoDia(blocos, d).length} ${naMinha ? 'item' : 'reserva'}${reservasDoDia(blocos, d).length > 1 ? 's' : ''}` : ' '}</div>
              </button>
            )
          })}
        </div>
      )}

      {naMinha && minha?.migracaoFaltando ? (
        <div style={{ ...cartao, color: '#b45309', fontWeight: 600 }}>{minha.error}</div>
      ) : dados && sala && segunda ? (
        <AgendaSemana
          dias={modo === 'dia' ? [diaSel || dias[0]] : dias}
          reservas={blocos} eu={dados.eu} agora={agora} pxPorHora={isMobile ? 52 : 48}
          onNovo={(dia, a, b) => (naMinha ? setFormBloqueio : setForm)({ dia, inicio: hhmm(a), fim: hhmm(b) })}
          onAbrir={abrirBloco}
        />
      ) : !erro && <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando a agenda…</div>}

      {form && sala && dados && (
        <FormReserva salaId={sala.id} salaNome={sala.nome} inicial={form} reservas={dados.reservas} minDia={agora.dia} onFechar={() => setForm(null)} onSalva={recarregar} />
      )}
      {formBloqueio && dados && <FormBloqueio inicial={formBloqueio} minDia={agora.dia} onFechar={() => setFormBloqueio(null)} onSalvo={recarregar} />}
      {bloqueioAberto && <DetalheBloqueio bloqueio={bloqueioAberto} onFechar={() => setBloqueioAberto(null)} onMudou={recarregar} />}
      {aberta && dados && (
        <DetalheReserva reserva={aberta} podeMexer={dados.admin || aberta.responsavel_id === dados.eu || aberta.criado_por === dados.eu}
          onFechar={() => setAberta(null)} onMudou={recarregar} onEditar={() => { setForm(aberta); setAberta(null) }} />
      )}
    </div>
  )
}
