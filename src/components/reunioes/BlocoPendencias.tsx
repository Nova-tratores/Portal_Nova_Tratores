'use client'
// R1–R4: bloco de pendências — abre toda reunião. Prévia (só leitura) na pauta;
// na condução cada atrasada recebe UMA de 4 saídas (novo prazo · reatribuir ·
// escalar · cancelar); "novo prazo" trava com 2+ reprogramações.
import { useState } from 'react'
import { AlertTriangle, CalendarClock, UserCog, ArrowUpRight, Ban, CheckCircle2 } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import type { Pendencia, SaidaPendencia } from '@/lib/reunioes/regras'
import { PENDENCIAS_MINUTOS } from '@/lib/reunioes/regras'
import { cartao, botao, botaoClaro, campo, chip, brCurto, Timer, primeiroNome, hojeISO } from './comum'

export default function BlocoPendencias({ pend, usuarios, modoConducao, onTratar, onAbrirTicket }: {
  pend: { atrasadas: Pendencia[]; vencendo: Pendencia[]; concluidas: { n: number; titulos: string[] }; limite: string }
  usuarios: Record<string, { nome: string }>
  modoConducao: boolean
  onTratar?: (ticketId: string, saida: SaidaPendencia, extra: Record<string, unknown>) => Promise<void>
  onAbrirTicket: (id: string) => void
}) {
  const [aberto, setAberto] = useState<{ id: string; saida: SaidaPendencia } | null>(null)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const nome = (id: string) => usuarios[id]?.nome || '—'
  const total = pend.atrasadas.length + pend.vencendo.length

  const confirmar = async () => {
    if (!aberto || !onTratar) return
    setOcupado(true); setErro('')
    try {
      const extra: Record<string, unknown> = {}
      if (aberto.saida === 'novo_prazo') extra.prazo = valor
      if (aberto.saida === 'reatribuir' || aberto.saida === 'escalar') { if (valor) extra.para = valor }
      if (motivo) extra.motivo = motivo
      await onTratar(aberto.id, aberto.saida, extra)
      setAberto(null); setValor(''); setMotivo('')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setOcupado(false) }
  }

  const linha = (p: Pendencia, atrasada: boolean) => {
    const tratando = aberto?.id === p.id
    return (
      <div key={p.id} style={{ ...cartao, padding: 12, borderLeft: `4px solid ${atrasada ? '#dc2626' : '#d97706'}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onAbrirTicket(p.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>#{p.numero}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text,#111)' }}>{p.titulo}</div>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 12 }}>
            <span style={chip(atrasada ? '#dc2626' : '#d97706', atrasada ? 'rgba(220,38,38,.1)' : 'rgba(217,119,6,.12)')}>
              {atrasada ? `${p.dias_atraso} dia${p.dias_atraso === 1 ? '' : 's'} de atraso` : `vence ${brCurto(p.prazo)}`}
            </span>
            <span style={{ color: 'var(--portal-text-muted,#888)' }}>{primeiroNome(nome(p.responsavel_id))}{p.aceite === 'pendente' ? ' · ainda não confirmou' : ''}{p.prazo_reprogramacoes ? ` · reprogramada ${p.prazo_reprogramacoes}×` : ''}</span>
          </div>
        </div>
        {modoConducao && atrasada && !tratando && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
            <button disabled={p.bloqueada_novo_prazo} title={p.bloqueada_novo_prazo ? 'Já reprogramada 2 vezes — vira item de pauta ou é escalada' : 'Definir novo prazo'}
              onClick={() => { setAberto({ id: p.id, saida: 'novo_prazo' }); setValor('') }}
              style={{ ...botao('#2563eb', true), opacity: p.bloqueada_novo_prazo ? .35 : 1, cursor: p.bloqueada_novo_prazo ? 'not-allowed' : 'pointer' }}><CalendarClock size={16} /> Novo prazo</button>
            <button onClick={() => { setAberto({ id: p.id, saida: 'reatribuir' }); setValor('') }} style={botao('#7c3aed', true)}><UserCog size={16} /> Reatribuir</button>
            <button onClick={() => { setAberto({ id: p.id, saida: 'escalar' }); setValor('') }} style={botao('#d97706', true)}><ArrowUpRight size={16} /> Escalar</button>
            <button onClick={() => { setAberto({ id: p.id, saida: 'cancelar' }); setValor('') }} style={botao('#6b7280', true)}><Ban size={16} /> Cancelar</button>
          </div>
        )}
        {tratando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'var(--portal-bg,#f9fafb)' }}>
            {aberto.saida === 'novo_prazo' && <input type="date" min={hojeISO()} value={valor} onChange={(e) => setValor(e.target.value)} style={campo} autoFocus />}
            {aberto.saida === 'reatribuir' && <UserSelect value={valor} onChange={setValor} excluir={[p.responsavel_id]} placeholder="Novo responsável…" />}
            {aberto.saida === 'escalar' && (
              <>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Sem pessoa indicada, vira item de pauta na <b>próxima reunião da série</b>. Com pessoa, ela entra na ação.</div>
                <UserSelect value={valor} onChange={setValor} placeholder="(opcional) escalar para…" autoFocus={false} />
              </>
            )}
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={aberto.saida === 'cancelar' ? 'Motivo do cancelamento' : 'Observação (opcional)'} style={campo} maxLength={500} />
            {erro && <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAberto(null); setErro('') }} style={botaoClaro()}>Voltar</button>
              <button onClick={confirmar} disabled={ocupado || (aberto.saida === 'novo_prazo' && !valor) || (aberto.saida === 'reatribuir' && !valor)} style={{ ...botao(), opacity: ocupado ? .5 : 1 }}><CheckCircle2 size={14} /> Confirmar</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <section style={{ ...cartao, borderColor: total ? 'rgba(220,38,38,.35)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: total ? 10 : 0 }}>
        <AlertTriangle size={16} color={total ? '#dc2626' : '#9ca3af'} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)' }}>Pendências primeiro</span>
        <span style={chip(total ? '#dc2626' : '#6b7280', total ? 'rgba(220,38,38,.1)' : 'rgba(107,114,128,.12)')}>{pend.atrasadas.length} atrasada{pend.atrasadas.length === 1 ? '' : 's'} · {pend.vencendo.length} vencendo até {brCurto(pend.limite)}</span>
        {pend.concluidas.n > 0 && <span title={pend.concluidas.titulos.join('\n')} style={chip('#059669', 'rgba(5,150,105,.1)')}>✓ {pend.concluidas.n} concluída{pend.concluidas.n === 1 ? '' : 's'} desde a última</span>}
        <span style={{ flex: 1 }} />
        {modoConducao && total > 0 && <Timer chave="pend" limiteMin={PENDENCIAS_MINUTOS} ativo />}
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', marginTop: 6 }}>Nada atrasado nem vencendo — segue a pauta.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pend.atrasadas.map((p) => linha(p, true))}
          {pend.vencendo.map((p) => linha(p, false))}
        </div>
      )}
    </section>
  )
}
