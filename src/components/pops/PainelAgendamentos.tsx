'use client'
// POPs — execuções recorrentes (o cron das 05:40 gera o ticket do dia;
// rodar duas vezes no mesmo dia não duplica). Para quem cuida do POP.
import { useState } from 'react'
import { Pause, Play, Plus, Trash2 } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import { descreverRecorrencia, type Recorrencia } from '@/lib/pops/regras'
import { COR_POPS, botao, botaoClaro, br, campo, cartao, chamar, chip, rotulo, vazio, type UsuarioMapa } from './comum'

export interface Agendamento {
  id: string; recorrencia: Recorrencia; dia_semana: number | null; dia_mes: number | null
  responsavel_padrao_id: string; ativo: boolean; inicio_em: string; ultima_data_referencia: string | null
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function PainelAgendamentos({ popId, agendamentos, usuarios, onMudou }: {
  popId: string; agendamentos: Agendamento[]; usuarios: UsuarioMapa; onMudou: () => void
}) {
  const [rec, setRec] = useState<Recorrencia>('diario')
  const [diaSemana, setDiaSemana] = useState(1)
  const [diaMes, setDiaMes] = useState(1)
  const [resp, setResp] = useState('')
  const [inicio, setInicio] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const chamarApi = async (method: string, json?: unknown, qs = '') => {
    setOcupado(true); setErro('')
    try { await chamar(`/api/pops/${popId}/agendamentos${qs}`, { method, json }); onMudou() }
    catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const criar = () => chamarApi('POST', {
    recorrencia: rec, responsavel_padrao_id: resp, ...(inicio ? { inicio_em: inicio } : {}),
    ...(rec === 'semanal' ? { dia_semana: diaSemana } : {}), ...(rec === 'mensal' ? { dia_mes: diaMes } : {}),
  })

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={cartao}>
        <strong>Rotinas deste POP</strong>
        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', margin: '4px 0 10px' }}>
          Todo dia às 05:40 o portal cria a execução de cada rotina que vence no dia, para o responsável. A execução usa a versão publicada naquele momento.
        </div>
        {!agendamentos.length ? <div style={vazio}>Nenhuma rotina. Crie abaixo.</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {agendamentos.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)', opacity: a.ativo ? 1 : .55 }}>
                <span style={{ fontWeight: 700, flex: '1 1 220px' }}>{descreverRecorrencia(a)}</span>
                <span style={{ fontSize: 13 }}>para <strong>{usuarios[a.responsavel_padrao_id]?.nome || '—'}</strong></span>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                  desde {br(a.inicio_em)}{a.ultima_data_referencia ? ` · última ${br(a.ultima_data_referencia)}` : ''}
                </span>
                {!a.ativo && <span style={chip('#6b7280', 'rgba(107,114,128,.14)')}>pausada</span>}
                <button disabled={ocupado} onClick={() => chamarApi('PATCH', { agendamento_id: a.id, ativo: !a.ativo })} style={botaoClaro()}>
                  {a.ativo ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Retomar</>}
                </button>
                <button disabled={ocupado} onClick={() => { if (confirm('Remover esta rotina? As execuções já criadas ficam.')) chamarApi('DELETE', undefined, `?agendamento_id=${a.id}`) }}
                  style={{ ...botaoClaro(), color: '#dc2626' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...cartao, display: 'grid', gap: 10 }}>
        <strong>Nova rotina</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={rotulo}>Repete</label>
            <select value={rec} onChange={(e) => setRec(e.target.value as Recorrencia)} style={{ ...campo, width: 'auto' }}>
              <option value="diario">Todo dia</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
            </select>
          </div>
          {rec === 'semanal' && (
            <div>
              <label style={rotulo}>Dia</label>
              <select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))} style={{ ...campo, width: 'auto' }}>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          {rec === 'mensal' && (
            <div>
              <label style={rotulo}>Dia do mês</label>
              <input type="number" min={1} max={31} value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} style={{ ...campo, width: 90 }} />
            </div>
          )}
          <div>
            <label style={rotulo}>A partir de (opcional)</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={{ ...campo, width: 'auto' }} />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label style={rotulo}>Quem executa</label>
            <UserSelect value={resp} onChange={(id) => setResp(id)} barraBusca />
          </div>
          <button disabled={!resp || ocupado} onClick={criar} style={{ ...botao(COR_POPS), opacity: resp ? 1 : .5 }}><Plus size={14} /> Criar rotina</button>
        </div>
        {rec === 'diario' && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Todo dia inclui sábado, domingo e feriado.</div>}
        {erro && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}
      </div>
    </div>
  )
}
