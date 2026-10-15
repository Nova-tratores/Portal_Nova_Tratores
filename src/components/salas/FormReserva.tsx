'use client'
// Nova reserva / editar reserva da sala. Avisa na hora se o horário bate com outra reserva
// (com as reservas já carregadas); o banco confere de novo ao salvar (409 = alguém reservou antes).
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal, campo, rotulo, botao, botaoClaro, chamar } from '@/components/reunioes/comum'
import { ABRE, FECHA, PASSO_MIN, hhmm, minutos, isoDe, sobrepoe, rotuloConflito, localDe, type Reserva } from '@/lib/salas/regras'

const HORARIOS = Array.from({ length: (minutos(FECHA) - minutos(ABRE)) / PASSO_MIN + 1 }, (_, i) => hhmm(minutos(ABRE) + i * PASSO_MIN))

export default function FormReserva({ salaId, salaNome, inicial, reservas, minDia, onFechar, onSalva }: {
  salaId: string
  salaNome: string
  /** nova: { dia, inicio, fim } · edição: a reserva */
  inicial: { dia: string; inicio: string; fim: string } | Reserva
  reservas: Reserva[]
  minDia: string
  onFechar: () => void
  onSalva: () => void
}) {
  const editando = 'id' in inicial ? inicial : null
  const [dia, setDia] = useState(editando ? localDe(editando.inicio).dia : (inicial as { dia: string }).dia)
  const [ini, setIni] = useState(editando ? localDe(editando.inicio).hora : (inicial as { inicio: string }).inicio)
  const [fim, setFim] = useState(editando ? localDe(editando.fim).hora : (inicial as { fim: string }).fim)
  const [titulo, setTitulo] = useState(editando?.titulo || '')
  const [descricao, setDescricao] = useState(editando?.descricao || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const conflito = useMemo(() => {
    if (!dia || fim <= ini) return null
    const alvo = { inicio: isoDe(dia, ini), fim: isoDe(dia, fim) }
    return reservas.find((r) => r.status === 'ativa' && r.sala_id === salaId && r.id !== editando?.id && sobrepoe(alvo, r)) || null
  }, [dia, ini, fim, reservas, salaId, editando?.id])

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const json = { sala_id: salaId, dia, inicio: ini, fim, titulo, descricao }
      if (editando) await chamar(`/api/salas/reservas/${editando.id}`, { method: 'PATCH', json })
      else await chamar('/api/salas/reservas', { json })
      onSalva()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar') } finally { setSalvando(false) }
  }
  const pronto = !!titulo.trim() && fim > ini && !conflito

  return (
    <Modal titulo={editando ? 'Alterar reserva' : `Reservar — ${salaNome}`} onFechar={onFechar} largura={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={rotulo}>Para quê?</label>
          <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && pronto) salvar() }}
            placeholder='Ex.: "Visita cliente Fazenda Boa Vista", "Treinamento NF-e"' style={{ ...campo, fontSize: 15 }} maxLength={200} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
          <div><label style={rotulo}>Dia</label><input type="date" min={minDia} value={dia} onChange={(e) => setDia(e.target.value)} style={campo} /></div>
          <div><label style={rotulo}>Início</label>
            <select value={ini} onChange={(e) => { const v = e.target.value; setIni(v); if (fim <= v) setFim(hhmm(Math.min(minutos(v) + 60, minutos(FECHA)))) }} style={campo}>
              {HORARIOS.slice(0, -1).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div><label style={rotulo}>Fim</label>
            <select value={fim} onChange={(e) => setFim(e.target.value)} style={campo}>
              {HORARIOS.filter((h) => h > ini).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        {conflito && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={15} /> {rotuloConflito(conflito)} — escolha outro horário.
          </div>
        )}
        <div>
          <label style={rotulo}>Detalhe (opcional)</label>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Quem vem, o que preparar…" style={{ ...campo, resize: 'vertical' }} maxLength={2000} />
        </div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Voltar</button>
          <button onClick={salvar} disabled={salvando || !pronto} style={{ ...botao('#0891b2'), opacity: salvando || !pronto ? .5 : 1 }}>{salvando ? 'Salvando…' : editando ? 'Salvar' : 'Reservar'}</button>
        </div>
      </div>
    </Modal>
  )
}
