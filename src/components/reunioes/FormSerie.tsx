'use client'
// Criar/editar uma série de reuniões ("Semanal Oficina").
import { useState } from 'react'
import { X } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import type { Serie, Recorrencia } from '@/lib/reunioes/regras'
import { Modal, campo, rotulo, botao, botaoClaro, chamar } from './comum'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function FormSerie({ inicial, usuarios, meuId, onFechar, onSalvo }: {
  inicial?: Serie | null
  usuarios: Record<string, UsuarioMin>
  meuId: string
  onFechar: () => void
  onSalvo: (s: Serie) => void
}) {
  const [nome, setNome] = useState(inicial?.nome || '')
  const [condutor, setCondutor] = useState(inicial?.condutor_id || meuId)
  const [secretarios, setSecretarios] = useState<string[]>(inicial?.secretarios_rodizio || [])
  const [participantes, setParticipantes] = useState<string[]>(inicial?.participantes_padrao || [])
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(inicial?.recorrencia || 'semanal')
  const [dia, setDia] = useState<number>(inicial?.dia_semana ?? 1)
  const [hora, setHora] = useState(inicial?.hora?.slice(0, 5) || '10:00')
  const [duracao, setDuracao] = useState(inicial?.duracao_min || 30)
  const [corte, setCorte] = useState(inicial?.corte_antecedencia_horas ?? 18)
  const [vis, setVis] = useState<'privado' | 'publico'>(inicial?.visibilidade || 'publico')
  const [ativa, setAtiva] = useState(inicial?.ativa ?? true)
  const [nomesLocais, setNomesLocais] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const nome_ = (id: string) => usuarios[id]?.nome || nomesLocais[id] || id.slice(0, 8)

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const body = { nome, condutor_id: condutor, secretarios_rodizio: secretarios, participantes_padrao: participantes, recorrencia, dia_semana: recorrencia === 'nenhuma' ? null : dia, hora: recorrencia === 'nenhuma' ? null : hora, duracao_min: duracao, corte_antecedencia_horas: corte, visibilidade: vis, ativa }
      const j = inicial
        ? await chamar<{ serie: Serie }>(`/api/reunioes/series/${inicial.id}`, { method: 'PATCH', json: body })
        : await chamar<{ serie: Serie }>('/api/reunioes/series', { json: body })
      onSalvo(j.serie)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar') } finally { setSalvando(false) }
  }

  const lista = (ids: string[], set: (v: string[]) => void, titulo: string, dica: string) => (
    <div>
      <label style={rotulo}>{titulo}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {ids.map((id) => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 12.5, background: 'var(--portal-bg,#f3f4f6)', color: 'var(--portal-text,#111)' }}>
            {nome_(id)} <button onClick={() => set(ids.filter((x) => x !== id))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 0, color: 'inherit' }}><X size={12} /></button>
          </span>
        ))}
      </div>
      <UserSelect value="" placeholder={dica} excluir={ids} autoFocus={false}
        onChange={(id, u) => { if (u) setNomesLocais((m) => ({ ...m, [id]: u.nome })); set([...ids, id]) }} />
    </div>
  )

  return (
    <Modal titulo={inicial ? 'Configurar série' : 'Nova série de reuniões'} onFechar={onFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={rotulo}>Nome</label><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder='Ex.: "Semanal Oficina", "Comercial segunda"' style={campo} maxLength={120} /></div>
        <div>
          <label style={rotulo}>Condutor (quem cobra)</label>
          <UserSelect value={condutor} onChange={(id, u) => { setCondutor(id); if (u) setNomesLocais((m) => ({ ...m, [id]: u.nome })) }} autoFocus={false} />
        </div>
        {lista(secretarios, setSecretarios, 'Secretários (rodízio — quem compila a ata)', 'Adicionar secretário…')}
        {lista(participantes, setParticipantes, 'Participantes padrão', 'Adicionar participante…')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={rotulo}>Recorrência</label>
            <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as Recorrencia)} style={campo}>
              <option value="nenhuma">Nenhuma (avulsas)</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option>
            </select>
          </div>
          <div><label style={rotulo}>Duração (min)</label><input type="number" min={5} max={480} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={campo} /></div>
          {recorrencia !== 'nenhuma' && (
            <>
              <div><label style={rotulo}>Dia da semana</label><select value={dia} onChange={(e) => setDia(Number(e.target.value))} style={campo}>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
              <div><label style={rotulo}>Hora</label><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={campo} /></div>
            </>
          )}
          <div><label style={rotulo}>Corte da pauta (horas antes)</label><input type="number" min={0} max={168} value={corte} onChange={(e) => setCorte(Number(e.target.value))} style={campo} /></div>
          <div>
            <label style={rotulo}>Visibilidade</label>
            <select value={vis} onChange={(e) => setVis(e.target.value as 'privado' | 'publico')} style={campo}>
              <option value="publico">Pública (quem tem a Central vê)</option><option value="privado">Privada (RH, disciplina, saúde)</option>
            </select>
          </div>
        </div>
        {inicial && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Série ativa (gera instâncias)</label>}
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !nome.trim()} style={{ ...botao(), opacity: salvando || !nome.trim() ? .5 : 1 }}>{salvando ? 'Salvando…' : inicial ? 'Salvar' : 'Criar série'}</button>
        </div>
      </div>
    </Modal>
  )
}
