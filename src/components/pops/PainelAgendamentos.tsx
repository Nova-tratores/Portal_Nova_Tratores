'use client'
// POPs — execuções recorrentes (o cron das 05:40 gera o ticket do dia;
// rodar duas vezes no mesmo dia não duplica). Para quem cuida do POP.
import { useState } from 'react'
import { Pause, Play, Plus, Trash2 } from 'lucide-react'
import UserSelect from '@/components/tickets/UserSelect'
import { INTERVALOS_MESES, descreverRecorrencia, proximaData, type AgendamentoRef, type Recorrencia } from '@/lib/pops/regras'
import { COR_POPS, botao, botaoClaro, br, campo, cartao, chamar, chip, rotulo, vazio, type UsuarioMapa } from './comum'

export interface Agendamento {
  id: string; recorrencia: Recorrencia; dia_semana: number | null; dia_mes: number | null
  intervalo_meses?: number | null
  responsavel_padrao_id: string; ativo: boolean; inicio_em: string; ultima_data_referencia: string | null
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const NOME_MESES: Record<number, string> = { 1: 'Todo mês', 2: 'A cada 2 meses', 3: 'A cada 3 meses (trimestral)', 4: 'A cada 4 meses', 6: 'A cada 6 meses (semestral)', 12: 'Uma vez por ano' }

const hojeLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// As próximas N datas (para a prévia de quem está criando a rotina).
function proximas(ag: AgendamentoRef, desde: string, n: number): string[] {
  const out: string[] = []
  let de = desde
  while (out.length < n) {
    const p = proximaData(ag, de)
    if (!p) break
    out.push(p)
    const d = new Date(`${p}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
    de = d.toISOString().slice(0, 10)
  }
  return out
}

export default function PainelAgendamentos({ popId, agendamentos, usuarios, onMudou }: {
  popId: string; agendamentos: Agendamento[]; usuarios: UsuarioMapa; onMudou: () => void
}) {
  // 'diario' | 'semanal' | nº de meses ('1' = todo mês, '6' = semestral…)
  const [rep, setRep] = useState('diario')
  const [diaSemana, setDiaSemana] = useState(1)
  const [diaMes, setDiaMes] = useState(1)
  const [resp, setResp] = useState('')
  const [inicio, setInicio] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const rec: Recorrencia = rep === 'diario' || rep === 'semanal' ? rep : 'mensal'
  const meses = rec === 'mensal' ? Number(rep) : 1
  // A cada N meses: a 1ª data define o mês de partida e o dia do mês.
  const diaEfetivo = meses > 1 && inicio ? Number(inicio.slice(8, 10)) : diaMes
  const hoje = hojeLocal()
  const podeCriar = !!resp && (meses === 1 || !!inicio)
  const previa = rec === 'mensal' && (meses === 1 || inicio)
    ? proximas({ recorrencia: 'mensal', dia_semana: null, dia_mes: diaEfetivo, intervalo_meses: meses, inicio_em: inicio || hoje, ativo: true }, inicio && inicio > hoje ? inicio : hoje, 3)
    : []

  const chamarApi = async (method: string, json?: unknown, qs = '') => {
    setOcupado(true); setErro('')
    try { await chamar(`/api/pops/${popId}/agendamentos${qs}`, { method, json }); onMudou() }
    catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const criar = () => chamarApi('POST', {
    recorrencia: rec, responsavel_padrao_id: resp, ...(inicio ? { inicio_em: inicio } : {}),
    ...(rec === 'semanal' ? { dia_semana: diaSemana } : {}),
    ...(rec === 'mensal' ? { dia_mes: diaEfetivo, ...(meses > 1 ? { intervalo_meses: meses } : {}) } : {}),
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
            {agendamentos.map((a) => {
              const prox = a.ativo ? proximaData(a, hoje) : null
              return (
                <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)', opacity: a.ativo ? 1 : .55 }}>
                  <span style={{ fontWeight: 700, flex: '1 1 220px' }}>{descreverRecorrencia(a)}</span>
                  <span style={{ fontSize: 13 }}>para <strong>{usuarios[a.responsavel_padrao_id]?.nome || '—'}</strong></span>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                    desde {br(a.inicio_em)}{a.ultima_data_referencia ? ` · última ${br(a.ultima_data_referencia)}` : ''}
                  </span>
                  {prox && <span style={{ fontSize: 12, fontWeight: 700, color: COR_POPS }}>próxima {br(prox)}</span>}
                  {!a.ativo && <span style={chip('#6b7280', 'rgba(107,114,128,.14)')}>pausada</span>}
                  <button disabled={ocupado} onClick={() => chamarApi('PATCH', { agendamento_id: a.id, ativo: !a.ativo })} style={botaoClaro()}>
                    {a.ativo ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Retomar</>}
                  </button>
                  <button disabled={ocupado} onClick={() => { if (confirm('Remover esta rotina? As execuções já criadas ficam.')) chamarApi('DELETE', undefined, `?agendamento_id=${a.id}`) }}
                    style={{ ...botaoClaro(), color: '#dc2626' }}><Trash2 size={13} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ ...cartao, display: 'grid', gap: 10 }}>
        <strong>Nova rotina</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={rotulo}>Repete</label>
            <select value={rep} onChange={(e) => setRep(e.target.value)} style={{ ...campo, width: 'auto' }}>
              <option value="diario">Todo dia</option><option value="semanal">Toda semana</option>
              {INTERVALOS_MESES.map((n) => <option key={n} value={String(n)}>{NOME_MESES[n]}</option>)}
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
          {rec === 'mensal' && meses === 1 && (
            <div>
              <label style={rotulo}>Dia do mês</label>
              <input type="number" min={1} max={31} value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} style={{ ...campo, width: 90 }} />
            </div>
          )}
          <div>
            <label style={rotulo}>{meses > 1 ? 'Primeira vez em' : 'A partir de (opcional)'}</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={{ ...campo, width: 'auto' }} />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label style={rotulo}>Quem executa</label>
            <UserSelect value={resp} onChange={(id) => setResp(id)} barraBusca />
          </div>
          <button disabled={!podeCriar || ocupado} onClick={criar} style={{ ...botao(COR_POPS), opacity: podeCriar ? 1 : .5 }}><Plus size={14} /> Criar rotina</button>
        </div>
        {rec === 'diario' && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Todo dia inclui sábado, domingo e feriado.</div>}
        {meses > 1 && !inicio && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Escolha a data da primeira vez: dela saem o dia do mês e a contagem dos meses.</div>}
        {previa.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--portal-text-secondary,#555)' }}>
            Próximas: <strong>{previa.map((p) => br(p)).join(' · ')}</strong>
          </div>
        )}
        {erro && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>{erro}</div>}
      </div>
    </div>
  )
}
