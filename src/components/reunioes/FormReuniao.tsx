'use client'
// Marcar uma reunião: avulsa (quem marca conduz) ou instância de uma série.
import { useState } from 'react'
import { X } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import type { UsuarioMin, Ticket } from '@/lib/tickets/constantes'
import type { Serie } from '@/lib/reunioes/regras'
import { secretarioDaVez } from '@/lib/reunioes/regras'
import { Modal, campo, rotulo, botao, botaoClaro, chamar, hojeISO } from './comum'

export default function FormReuniao({ series, usuarios, meuId, serieInicial, onFechar, onCriada }: {
  series: Serie[]
  usuarios: Record<string, UsuarioMin>
  meuId: string
  serieInicial?: string | null
  onFechar: () => void
  onCriada: (t: Ticket, aviso: string | null) => void
}) {
  const [serieId, setSerieId] = useState(serieInicial || '')
  const serie = series.find((s) => s.id === serieId) || null
  const [dia, setDia] = useState(hojeISO())
  const [hora, setHora] = useState(serie?.hora?.slice(0, 5) || '10:00')
  const [titulo, setTitulo] = useState('')
  const [secretario, setSecretario] = useState<string>(serie ? secretarioDaVez(serie) || '' : '')
  const [participantes, setParticipantes] = useState<string[]>([])
  const [vis, setVis] = useState<'privado' | 'publico'>('publico')
  const [nomesLocais, setNomesLocais] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const nome_ = (id: string) => usuarios[id]?.nome || nomesLocais[id] || id.slice(0, 8)
  const condutor = serie?.condutor_id || meuId

  const escolherSerie = (id: string) => {
    setSerieId(id)
    const s = series.find((x) => x.id === id)
    if (s) { if (s.hora) setHora(s.hora.slice(0, 5)); setSecretario(secretarioDaVez(s) || ''); setVis(s.visibilidade) }
  }

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const j = await chamar<{ reuniao: Ticket; aviso: string | null }>('/api/reunioes', { json: {
        serie_id: serieId || undefined, dia, hora, titulo: titulo || undefined, secretario_id: secretario || undefined,
        participantes, visibilidade: vis,
      } })
      onCriada(j.reuniao, j.aviso)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao marcar') } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="Marcar reunião" onFechar={onFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={rotulo}>Série</label>
          <select value={serieId} onChange={(e) => escolherSerie(e.target.value)} style={campo}>
            <option value="">Reunião avulsa (eu conduzo)</option>
            {series.map((s) => <option key={s.id} value={s.id}>{s.nome} · condutor {nome_(s.condutor_id).split(' ')[0]}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={rotulo}>Dia</label><input type="date" min={hojeISO()} value={dia} onChange={(e) => setDia(e.target.value)} style={campo} /></div>
          <div><label style={rotulo}>Hora</label><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={campo} /></div>
        </div>
        <div><label style={rotulo}>Título (opcional)</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={serie ? `${serie.nome} — ${dia.split('-').reverse().join('/')}` : 'Ex.: Alinhamento da feira'} style={campo} maxLength={200} /></div>
        <div>
          <label style={rotulo}>Secretário (compila a ata) — condutor: {nome_(condutor)}</label>
          <UserSelect value={secretario} onChange={(id, u) => { setSecretario(id); if (u) setNomesLocais((m) => ({ ...m, [id]: u.nome })) }} autoFocus={false} placeholder="Escolher secretário…" />
          {secretario && secretario === condutor && <div style={{ fontSize: 12, color: '#d97706', marginTop: 4 }}>Condutor e secretário são a mesma pessoa — pode, mas quem compila não deveria ser quem cobra.</div>}
        </div>
        <div>
          <label style={rotulo}>Participantes{serie && serie.participantes_padrao.length ? ` (além dos ${serie.participantes_padrao.length} padrão da série)` : ''}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {participantes.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 12.5, background: 'var(--portal-bg,#f3f4f6)', color: 'var(--portal-text,#111)' }}>
                {nome_(id)} <button onClick={() => setParticipantes(participantes.filter((x) => x !== id))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 0, color: 'inherit' }}><X size={12} /></button>
              </span>
            ))}
          </div>
          <UserSelect value="" placeholder="Adicionar participante…" excluir={[...participantes, condutor]} autoFocus={false}
            onChange={(id, u) => { if (u) setNomesLocais((m) => ({ ...m, [id]: u.nome })); setParticipantes([...participantes, id]) }} />
        </div>
        <div>
          <label style={rotulo}>Visibilidade</label>
          <select value={vis} onChange={(e) => setVis(e.target.value as 'privado' | 'publico')} style={campo}>
            <option value="publico">Pública</option><option value="privado">Privada — só os envolvidos e o admin (ações nascem privadas)</option>
          </select>
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !dia || !hora} style={{ ...botao(), opacity: salvando ? .5 : 1 }}>{salvando ? 'Marcando…' : 'Marcar reunião'}</button>
        </div>
      </div>
    </Modal>
  )
}
