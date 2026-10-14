'use client'
// Aba "Histórico": cada execução registrada (agendador, botão, marcado ou GitHub),
// com filtro por agendamento, resultado e período. Clicar abre o detalhe.
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { AgendamentoPainel, Rodada } from './tipos'
import { duracao, horaSP, quemDisparou, statusInfo, STATUS } from './tipos'

const campo: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '.8rem', background: '#fefefe', color: '#111111' }

export default function HistoricoExecucoes({ agendamentos }: { agendamentos: AgendamentoPainel[] }) {
  const [job, setJob] = useState('')
  const [status, setStatus] = useState('')
  const [dias, setDias] = useState(2)
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const p = new URLSearchParams({ dias: String(dias), limite: '500' })
      if (job) p.set('job', job)
      if (status) p.set('status', status)
      const r = await fetch(`/api/agendador/historico?${p}`, { headers: await authHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setRodadas(d.rodadas || [])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [job, status, dias])

  useEffect(() => { carregar() }, [carregar])

  const nomes = new Map(agendamentos.map((a) => [a.chave, a.nome]))
  const jobs = Array.from(new Set([...agendamentos.map((a) => a.chave), ...rodadas.map((r) => r.job)])).sort((a, b) => (nomes.get(a) ?? a).localeCompare(nomes.get(b) ?? b))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <select value={job} onChange={(e) => setJob(e.target.value)} style={campo}>
          <option value="">Todos os agendamentos</option>
          {jobs.map((j) => <option key={j} value={j}>{nomes.get(j) ?? j}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={campo}>
          <option value="">Qualquer resultado</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={campo}>
          <option value={1}>Últimas 24 h</option>
          <option value={2}>Últimos 2 dias</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
        {carregando && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: '#6b7280' }} />}
        <span style={{ fontSize: '.74rem', color: '#6b7280' }}>{rodadas.length} execução(ões){rodadas.length >= 500 ? ' (mostrando as 500 mais recentes)' : ''}</span>
      </div>
      {erro && <div style={{ color: '#b91c1c', fontSize: '.8rem', marginBottom: 8 }}>{erro}</div>}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto' }}>
        <div style={{ minWidth: 820 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(220px,1.3fr) 130px 90px minmax(160px,1fr) minmax(200px,1.4fr)', gap: 10, padding: '8px 14px', background: '#fafafa', fontSize: '.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            <span>Início</span><span>Agendamento</span><span>Resultado</span><span>Duração</span><span>Disparado por</span><span>Detalhe</span>
          </div>
          {rodadas.map((r) => (
            <div key={r.id} onClick={() => setAberta(aberta === r.id ? null : r.id)} style={{ padding: '8px 14px', borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(220px,1.3fr) 130px 90px minmax(160px,1fr) minmax(200px,1.4fr)', gap: 10, alignItems: 'center', fontSize: '.76rem' }}>
                <span style={{ color: '#374151' }}>{horaSP(r.iniciado_em, true)}</span>
                <span style={{ fontWeight: 600, color: '#111111' }}>{nomes.get(r.job) ?? r.job}</span>
                <span>
                  <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, fontSize: '.66rem', fontWeight: 700, color: statusInfo(r.status).cor, background: statusInfo(r.status).bg, border: `1px solid ${statusInfo(r.status).borda}` }}>{statusInfo(r.status).rotulo}</span>
                </span>
                <span style={{ color: '#6b7280' }}>{duracao(r.duracao_ms)}</span>
                <span style={{ color: '#6b7280' }}>{quemDisparou(r)}</span>
                <span style={{ color: r.status === 'erro' ? '#b91c1c' : '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: aberta === r.id ? 'normal' : 'nowrap' }}>{r.detalhe || ''}</span>
              </div>
              {aberta === r.id && r.progresso && (
                <div style={{ marginTop: 6, fontSize: '.72rem', color: '#374151' }}>
                  Progresso: {Object.entries(r.progresso).map(([k, v]) => `${k} ${v}`).join(' · ')}
                </div>
              )}
            </div>
          ))}
          {!rodadas.length && !carregando && <div style={{ padding: 14, fontSize: '.8rem', color: '#6b7280' }}>Nenhuma execução nesse filtro.</div>}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
