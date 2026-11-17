'use client'
// Próxima reunião a partir desta (José, 17/11/2026): "às vezes não é sobre o mesmo assunto, é como uma ramificação".
// Assunto e pessoas editáveis; quando: SÓ UMA VEZ (reunião seguinte, avulsa — ação `continuar`) ou repetir
// toda semana / a cada 15 dias / todo mês (vira série — ação `virar_serie`, só se ainda não é de série).
import { useState } from 'react'
import { Repeat, CalendarPlus } from 'lucide-react'
import SeletorPessoas from './SeletorPessoas'
import { Modal, botao, botaoClaro, campo, rotulo, chamar, horaDe, hojeISO } from './comum'

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
type Quando = 'uma_vez' | 'semanal' | 'quinzenal' | 'mensal'

export default function VirarSerie({ reuniaoId, inicio, titulo, pessoas, condutorId, podeRepetir, onFechar, onFeito }: {
  reuniaoId: string
  inicio: string | null
  titulo: string
  pessoas: string[]
  condutorId: string
  /** false = já é de uma série: só "uma vez" */
  podeRepetir: boolean
  onFechar: () => void
  onFeito: (msg: string, novaId?: string) => void
}) {
  const diaSem = inicio ? DIAS[new Date(new Date(inicio).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay()] : 'mesmo dia'
  const horaAtual = horaDe(inicio) || '10:00'
  const [quando, setQuando] = useState<Quando>(podeRepetir ? 'semanal' : 'uma_vez')
  const [assunto, setAssunto] = useState(titulo.replace(/\s*[—–-]\s*\d{2}\/\d{2}(\/\d{2,4})?\s*$/, ''))
  const [gente, setGente] = useState(pessoas.filter((p) => p !== condutorId))
  const [dia, setDia] = useState(hojeISO())
  const [hora, setHora] = useState(horaAtual)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const OPCOES: { id: Quando; titulo: string; dica: string }[] = [
    { id: 'uma_vez', titulo: 'Só uma vez', dica: 'marca a próxima reunião, com o assunto e as pessoas que você escolher' },
    ...(podeRepetir ? [
      { id: 'semanal' as const, titulo: 'Toda semana', dica: `toda ${diaSem} às ${horaAtual}` },
      { id: 'quinzenal' as const, titulo: 'A cada 15 dias', dica: `${diaSem} sim, ${diaSem} não, às ${horaAtual}` },
      { id: 'mensal' as const, titulo: 'Todo mês', dica: `a cada 4 semanas, na ${diaSem}, às ${horaAtual}` },
    ] : []),
  ]

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const pessoasFinal = [condutorId, ...gente]
      if (quando === 'uma_vez') {
        const j = await chamar<{ reuniao_id: string }>(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'continuar', dia, hora, titulo: assunto, participantes: pessoasFinal } })
        window.dispatchEvent(new Event('central-trabalho-mudou'))
        onFeito(`Pronto: "${assunto}" marcada para ${dia.split('-').reverse().join('/')} às ${hora}.`, j.reuniao_id)
      } else {
        const j = await chamar<{ proxima: { inicio: string } | null }>(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'virar_serie', recorrencia: quando, nome: assunto, participantes: pessoasFinal } })
        window.dispatchEvent(new Event('central-trabalho-mudou'))
        const p = j.proxima?.inicio ? new Date(j.proxima.inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }) : null
        onFeito(p ? `Pronto: agora ela se repete. A próxima já está marcada para ${p} às ${horaAtual}.` : 'Pronto: agora ela se repete.')
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="Próxima reunião" onFechar={onFechar} largura={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={rotulo}>Assunto</label>
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} style={{ ...campo, height: 44, fontSize: 15 }} placeholder="Sobre o que vai ser a próxima reunião" />
        </div>
        <div>
          <label style={rotulo}>Quem participa (além de quem conduz)</label>
          <SeletorPessoas valor={gente} excluir={[condutorId]} onChange={(ids) => setGente(ids)} placeholder="Digite o nome…" />
        </div>
        <div>
          <label style={rotulo}>Quando</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OPCOES.map((o) => {
              const on = quando === o.id
              return (
                <button key={o.id} onClick={() => setQuando(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '11px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? '#4f46e5' : 'var(--portal-border,#e2e8f0)'}`, background: on ? 'color-mix(in srgb,#4f46e5 8%,var(--portal-surface,#fefefe))' : 'var(--portal-surface,#fefefe)' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? '#4f46e5' : 'var(--portal-border,#cbd5e1)'}`, display: 'grid', placeItems: 'center' }}>{on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4f46e5' }} />}</span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>{o.titulo}</span>
                    <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>{o.dica}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {quando === 'uma_vez' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12 }}>
            <div><label style={rotulo}>Dia</label><input type="date" min={hojeISO()} value={dia} onChange={(e) => setDia(e.target.value)} style={campo} /></div>
            <div><label style={rotulo}>Hora</label><input type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} style={campo} /></div>
          </div>
        )}
        {!podeRepetir && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Esta reunião já se repete pela série; aqui você marca uma reunião à parte que nasce dela.</div>}
        {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !assunto.trim() || (quando === 'uma_vez' && (!dia || !hora))} style={{ ...botao('#4f46e5'), opacity: salvando || !assunto.trim() ? .6 : 1 }}>
            {quando === 'uma_vez' ? <CalendarPlus size={14} /> : <Repeat size={14} />} {salvando ? 'Marcando…' : quando === 'uma_vez' ? 'Marcar reunião' : 'Repetir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
