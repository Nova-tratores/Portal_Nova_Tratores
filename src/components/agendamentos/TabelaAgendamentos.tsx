'use client'
// Aba "Agendamentos": a lista completa do agendador do portal, com última e próxima
// execução e — só para Dev — Rodar agora, Pausar/Retomar, Mudar horário e Marcar
// para depois (rodar uma vez numa hora escolhida).
import { useState } from 'react'
import { Play, Pause, PlayCircle, CalendarClock, Pencil, X, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { TipoAgendamento } from '@/lib/agendador/regras'
import type { AgendamentoPainel } from './tipos'
import { duracao, horaSP, quemDisparou, statusInfo, tempoRelativo } from './tipos'

async function acao(corpo: Record<string, unknown>): Promise<{ ok: boolean; erro?: string; dados?: Record<string, unknown> }> {
  const r = await fetch('/api/agendador', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, dados: d } : { ok: false, erro: d.error || `Erro ${r.status}` }
}

const btn = (cor: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
  border: `1px solid ${cor}`, background: '#fefefe', color: cor, fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
})

function Pill({ status }: { status: string }) {
  const s = statusInfo(status)
  return <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, fontSize: '.66rem', fontWeight: 700, color: s.cor, background: s.bg, border: `1px solid ${s.borda}`, whiteSpace: 'nowrap' }}>{s.rotulo}</span>
}

export default function TabelaAgendamentos({ agendamentos, podeAlterar, aoMudar }: { agendamentos: AgendamentoPainel[]; podeAlterar: boolean; aoMudar: () => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [modal, setModal] = useState<{ tipo: 'pausar' | 'horario' | 'marcar'; ag: AgendamentoPainel } | null>(null)

  async function executar(chave: string, corpo: Record<string, unknown>, okTexto: string) {
    setOcupado(chave); setAviso(null)
    const r = await acao({ chave, ...corpo })
    setOcupado(null)
    setAviso(r.ok ? { tipo: 'ok', texto: okTexto } : { tipo: 'erro', texto: r.erro || 'Falhou.' })
    if (r.ok) { setModal(null); aoMudar() }
    return r.ok
  }

  const recorrentes = agendamentos.filter((a) => a.tipo !== 'uma_vez')
  const umaVez = agendamentos.filter((a) => a.tipo === 'uma_vez')

  const linha = (a: AgendamentoPainel) => {
    const u = a.ultima
    return (
      <div key={a.chave} className="ag-linha" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.4fr) 170px minmax(200px,1.3fr) 120px minmax(150px,1fr)' + (podeAlterar ? ' 230px' : ''), gap: 12, padding: '10px 14px', borderTop: '1px solid #f3f4f6', alignItems: 'center', opacity: a.ativo ? 1 : 0.75 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.84rem', color: '#111111' }}>{a.nome}</div>
          <div style={{ fontSize: '.68rem', color: '#6b7280' }}>{a.modulo}{a.usa_omie ? ' · usa a Omie' : ''}{a.grupo ? ` · grupo ${a.grupo}` : ''}</div>
          {!a.tarefaExiste && <div style={{ fontSize: '.68rem', color: '#b91c1c', fontWeight: 700 }}>tarefa “{a.handler}” não existe no código</div>}
        </div>
        <div className="ag-cel" data-rotulo="Quando" style={{ fontSize: '.78rem', color: '#111111' }}>{a.quando}</div>
        <div className="ag-cel" data-rotulo="Última execução" style={{ fontSize: '.74rem', color: '#374151' }}>
          {a.rodandoAgora ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1d4ed8', fontWeight: 700 }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> rodando há {tempoRelativo(a.rodandoAgora.desde).replace('há ', '')}
            </span>
          ) : u ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span><Pill status={u.status} /> <span style={{ color: '#6b7280' }}>{horaSP(u.iniciado_em, true)} · {duracao(u.duracao_ms)}</span></span>
              <span style={{ fontSize: '.66rem', color: '#9ca3af' }}>{quemDisparou(u)}</span>
              {u.detalhe && <span style={{ fontSize: '.66rem', color: u.status === 'erro' ? '#b91c1c' : '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} title={u.detalhe}>{u.detalhe}</span>}
            </div>
          ) : <span style={{ color: '#9ca3af' }}>ainda não rodou</span>}
        </div>
        <div className="ag-cel" data-rotulo="Próxima" style={{ fontSize: '.76rem', color: '#111111' }}>
          {a.ativo ? (a.proxima ? <>{horaSP(a.proxima, true)}<div style={{ fontSize: '.66rem', color: '#9ca3af' }}>{tempoRelativo(a.proxima)}</div></> : <span style={{ color: '#9ca3af' }}>{a.tipo === 'uma_vez' ? 'já rodou' : '—'}</span>) : '—'}
        </div>
        <div className="ag-cel" data-rotulo="Situação" style={{ fontSize: '.72rem' }}>
          {a.ativo
            ? <span style={{ color: '#047857', fontWeight: 700 }}>● ligado</span>
            : <span style={{ color: '#92400e' }}><strong>○ pausado</strong>{a.pausado_por ? ` por ${a.pausado_por}` : ''}{a.pausado_motivo ? <div style={{ color: '#6b7280' }}>{a.pausado_motivo}</div> : null}</span>}
        </div>
        {podeAlterar && (
          <div className="ag-acoes" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ocupado === a.chave ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : (
              <>
                {a.tipo !== 'uma_vez' && (
                  <button style={btn('#1d4ed8')} disabled={!!a.rodandoAgora} onClick={() => executar(a.chave, { acao: 'rodar' }, `${a.nome}: começou a rodar.`)}><Play size={12} /> Rodar agora</button>
                )}
                {a.tipo !== 'uma_vez' && (a.ativo
                  ? <button style={btn('#92400e')} onClick={() => setModal({ tipo: 'pausar', ag: a })}><Pause size={12} /> Pausar</button>
                  : <button style={btn('#047857')} onClick={() => executar(a.chave, { acao: 'retomar' }, `${a.nome}: ligado de novo.`)}><PlayCircle size={12} /> Retomar</button>)}
                {a.tipo !== 'uma_vez' && <button style={btn('#374151')} onClick={() => setModal({ tipo: 'horario', ag: a })}><Pencil size={12} /> Horário</button>}
                {a.tipo !== 'uma_vez' && <button style={btn('#374151')} onClick={() => setModal({ tipo: 'marcar', ag: a })}><CalendarClock size={12} /> Marcar</button>}
                {a.tipo === 'uma_vez' && !a.ultima && <button style={btn('#b91c1c')} onClick={() => executar(a.chave, { acao: 'cancelar' }, 'Execução marcada cancelada.')}><X size={12} /> Cancelar</button>}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const cabecalho = (
    <div className="ag-th" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.4fr) 170px minmax(200px,1.3fr) 120px minmax(150px,1fr)' + (podeAlterar ? ' 230px' : ''), gap: 12, padding: '8px 14px', background: '#fafafa', fontSize: '.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
      <span>Agendamento</span><span>Quando</span><span>Última execução</span><span>Próxima</span><span>Situação</span>{podeAlterar && <span>Ações (Dev)</span>}
    </div>
  )

  return (
    <div>
      {aviso && (
        <div style={{ padding: '8px 12px', marginBottom: 10, borderRadius: 8, fontSize: '.8rem', background: aviso.tipo === 'ok' ? '#ecfdf5' : '#fef2f2', color: aviso.tipo === 'ok' ? '#047857' : '#b91c1c', border: `1px solid ${aviso.tipo === 'ok' ? '#a7f3d0' : '#fecaca'}` }}>
          {aviso.texto}
        </div>
      )}
      {!podeAlterar && <p style={{ fontSize: '.74rem', color: '#6b7280', marginBottom: 8 }}>Só o Dev pausa, muda horário ou roda na hora. Você vê tudo.</p>}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto' }}>
        <div className="ag-min" style={{ minWidth: podeAlterar ? 1160 : 920 }}>
          {cabecalho}
          {recorrentes.map(linha)}
        </div>
      </div>
      {umaVez.length > 0 && (
        <>
          <h4 style={{ fontSize: '.82rem', fontWeight: 800, margin: '18px 0 8px', color: '#111111' }}>Marcados para rodar uma vez</h4>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto' }}>
            <div className="ag-min" style={{ minWidth: podeAlterar ? 1160 : 920 }}>{cabecalho}{umaVez.map(linha)}</div>
          </div>
        </>
      )}

      {modal?.tipo === 'pausar' && <ModalPausar ag={modal.ag} fechar={() => setModal(null)} confirmar={(motivo) => executar(modal.ag.chave, { acao: 'pausar', motivo }, `${modal.ag.nome}: pausado.`)} />}
      {modal?.tipo === 'horario' && <ModalHorario ag={modal.ag} fechar={() => setModal(null)} confirmar={(c) => executar(modal.ag.chave, { acao: 'alterar', ...c }, `${modal.ag.nome}: horário alterado.`)} />}
      {modal?.tipo === 'marcar' && <ModalMarcar ag={modal.ag} fechar={() => setModal(null)} confirmar={(iso) => executar(modal.ag.chave, { acao: 'marcar', executar_em: iso }, `${modal.ag.nome}: marcado.`)} />}
      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        /* Celular: cada agendamento vira um cartão (rótulos no lugar do cabeçalho) */
        @media (max-width: 768px) {
          .ag-min { min-width: 0 !important; }
          .ag-th { display: none !important; }
          .ag-linha { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px 12px !important; padding: 12px !important; align-items: start !important; }
          .ag-linha > :first-child, .ag-linha > .ag-acoes, .ag-linha > .ag-cel[data-rotulo='Última execução'] { grid-column: 1 / -1; }
          .ag-linha > :first-child > div:first-child { font-size: 15px !important; }
          .ag-linha > :first-child > div { font-size: 12px !important; }
          .ag-cel { font-size: 13px !important; }
          .ag-cel span, .ag-cel div { font-size: 12px !important; max-width: none !important; white-space: normal !important; }
          .ag-cel::before { content: attr(data-rotulo); display: block; font-size: 11px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; }
          .ag-acoes button { flex: 1 1 calc(50% - 6px); justify-content: center; min-height: 40px; font-size: 13px !important; }
        }`}</style>
    </div>
  )
}

// ── Janelas ────────────────────────────────────────────────────────────────────

function Janela({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div onClick={fechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, width: 'min(460px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: '.95rem', color: '#111111' }}>{titulo}</strong>
          <button onClick={fechar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const campo: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '.84rem', background: '#fefefe', color: '#111111' }
const rotulo: React.CSSProperties = { display: 'block', fontSize: '.72rem', fontWeight: 700, color: '#374151', margin: '10px 0 4px' }
const confirmarBtn: React.CSSProperties = { marginTop: 14, width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fefefe', fontWeight: 800, cursor: 'pointer' }

function ModalPausar({ ag, fechar, confirmar }: { ag: AgendamentoPainel; fechar: () => void; confirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Janela titulo={`Pausar: ${ag.nome}`} fechar={fechar}>
      <p style={{ fontSize: '.78rem', color: '#6b7280' }}>Enquanto pausado não roda sozinho (o “Rodar agora” continua funcionando). O motivo aparece para todos.</p>
      <label style={rotulo}>Motivo</label>
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} style={campo} placeholder="Ex.: Omie da Castro em manutenção até amanhã" />
      <button style={{ ...confirmarBtn, opacity: motivo.trim() ? 1 : 0.5 }} disabled={!motivo.trim()} onClick={() => confirmar(motivo)}>Pausar</button>
    </Janela>
  )
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function ModalHorario({ ag, fechar, confirmar }: { ag: AgendamentoPainel; fechar: () => void; confirmar: (c: Record<string, unknown>) => void }) {
  const [tipo, setTipo] = useState<TipoAgendamento>(ag.tipo)
  const [hora, setHora] = useState(ag.hora || '20:00')
  const [intervalo, setIntervalo] = useState(String(ag.intervalo_min || 15))
  const [dias, setDias] = useState<number[]>(ag.dias_semana?.length ? ag.dias_semana : [0, 1, 2, 3, 4, 5, 6])
  const [comJanela, setComJanela] = useState(!!ag.janela_inicio)
  const [jIni, setJIni] = useState(ag.janela_inicio || '07:00')
  const [jFim, setJFim] = useState(ag.janela_fim || '20:00')
  const [diaMes, setDiaMes] = useState(String(ag.dia_mes || 1))

  const enviar = () => confirmar({
    tipo,
    hora: tipo === 'intervalo' ? null : hora,
    intervalo_min: tipo === 'intervalo' ? Number(intervalo) : null,
    dias_semana: tipo === 'mensal' || dias.length === 7 ? null : dias,
    janela_inicio: tipo === 'intervalo' && comJanela ? jIni : null,
    janela_fim: tipo === 'intervalo' && comJanela ? jFim : null,
    dia_mes: tipo === 'mensal' ? Number(diaMes) : null,
  })

  return (
    <Janela titulo={`Horário: ${ag.nome}`} fechar={fechar}>
      <p style={{ fontSize: '.74rem', color: '#6b7280' }}>Agora: <strong>{ag.quando}</strong>. Horários de Brasília.</p>
      <label style={rotulo}>Tipo</label>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAgendamento)} style={campo}>
        <option value="intervalo">A cada N minutos</option>
        <option value="diario">Todo dia num horário</option>
        <option value="semanal">Em dias da semana</option>
        <option value="mensal">Uma vez por mês</option>
      </select>
      {tipo === 'intervalo' ? (
        <>
          <label style={rotulo}>A cada (minutos)</label>
          <input type="number" min={1} max={1440} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} style={campo} />
          <label style={{ ...rotulo, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={comJanela} onChange={(e) => setComJanela(e.target.checked)} /> Só entre
          </label>
          {comJanela && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="time" value={jIni} onChange={(e) => setJIni(e.target.value)} style={campo} />
              <input type="time" value={jFim} onChange={(e) => setJFim(e.target.value)} style={campo} />
            </div>
          )}
        </>
      ) : (
        <>
          <label style={rotulo}>Horário</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={campo} />
        </>
      )}
      {tipo === 'mensal' ? (
        <>
          <label style={rotulo}>Dia do mês (1 a 28)</label>
          <input type="number" min={1} max={28} value={diaMes} onChange={(e) => setDiaMes(e.target.value)} style={campo} />
        </>
      ) : (
        <>
          <label style={rotulo}>Dias da semana</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {DIAS.map((d, i) => {
              const on = dias.includes(i)
              return (
                <button key={d} type="button" onClick={() => setDias(on ? dias.filter((x) => x !== i) : [...dias, i].sort())}
                  style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${on ? '#dc2626' : '#d1d5db'}`, background: on ? '#fef2f2' : '#fefefe', color: on ? '#b91c1c' : '#6b7280', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  {d}
                </button>
              )
            })}
          </div>
        </>
      )}
      <button style={confirmarBtn} onClick={enviar}>Salvar horário</button>
    </Janela>
  )
}

function ModalMarcar({ ag, fechar, confirmar }: { ag: AgendamentoPainel; fechar: () => void; confirmar: (iso: string) => void }) {
  const [quando, setQuando] = useState('')
  return (
    <Janela titulo={`Rodar uma vez: ${ag.nome}`} fechar={fechar}>
      <p style={{ fontSize: '.78rem', color: '#6b7280' }}>Roda uma única vez no horário escolhido (Brasília), além dos horários normais. Bom para tarefas pesadas fora do expediente.</p>
      <label style={rotulo}>Quando</label>
      <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} style={campo} />
      <button style={{ ...confirmarBtn, opacity: quando ? 1 : 0.5 }} disabled={!quando} onClick={() => confirmar(`${quando}:00-03:00`)}>Marcar</button>
    </Janela>
  )
}
