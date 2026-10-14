'use client'
// Aba "Hoje": uma faixa por agendamento, de 00h a 24h (Brasília), com cada execução
// no horário em que começou — largura = duração, cor = resultado. Mostra onde o dia
// teve problema e se dois pesados se encostaram.
import { useEffect, useState } from 'react'
import type { AgendamentoPainel, Rodada } from './tipos'
import { duracao, horaSP, quemDisparou, statusInfo } from './tipos'

// Balão de detalhe da marca. O `title` nativo não funcionava na prática: marca de
// 3 px, tooltip que exige o mouse parado ~1 s e a aba recarregando a cada 60 s.
// Agora: passar o mouse mostra, clicar FIXA (até clicar de novo, noutra marca,
// fora ou Esc). Área de clique de 8 px mesmo quando a execução durou segundos.
interface Balao { r: Rodada; x: number; y: number; fixo: boolean }

const minutoDoDiaSP = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
}

export default function LinhaDoTempo({ hoje, agendamentos }: { hoje: Rodada[]; agendamentos: AgendamentoPainel[] }) {
  const porJob = new Map<string, Rodada[]>()
  for (const r of hoje) porJob.set(r.job, [...(porJob.get(r.job) ?? []), r])
  const nomes = new Map(agendamentos.map((a) => [a.chave, a.nome]))
  // agendamentos da tabela primeiro (mesmo sem execução hoje), depois os jobs do GitHub que registraram
  const jobs = [
    ...agendamentos.filter((a) => a.ativo || porJob.has(a.chave)).map((a) => a.chave),
    ...[...porJob.keys()].filter((j) => !nomes.has(j)).sort(),
  ]
  const agora = minutoDoDiaSP(new Date().toISOString())
  const [balao, setBalao] = useState<Balao | null>(null)

  useEffect(() => {
    if (!balao?.fixo) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBalao(null) }
    const fora = () => setBalao(null)
    window.addEventListener('keydown', esc)
    window.addEventListener('click', fora)
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('click', fora) }
  }, [balao?.fixo])

  const posicao = (e: React.MouseEvent) => ({ x: Math.min(e.clientX + 12, window.innerWidth - 340), y: e.clientY + 14 })
  const mostrar = (r: Rodada, e: React.MouseEvent) => setBalao((b) => (b?.fixo ? b : { r, ...posicao(e), fixo: false }))
  const esconder = () => setBalao((b) => (b?.fixo ? b : null))
  const fixar = (r: Rodada, e: React.MouseEvent) => {
    e.stopPropagation()
    setBalao((b) => (b?.fixo && b.r.id === r.id ? null : { r, ...posicao(e), fixo: true }))
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', overflowX: 'auto' }}>
      <div style={{ minWidth: 860 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 130px', gap: 10, fontSize: '.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          <span>Agendamento</span>
          <div style={{ position: 'relative', height: 14 }}>
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
              <span key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, transform: h === 24 ? 'translateX(-100%)' : h ? 'translateX(-50%)' : undefined }}>{String(h).padStart(2, '0')}h</span>
            ))}
          </div>
          <span>Hoje</span>
        </div>
        {jobs.length === 0 && <div style={{ fontSize: '.82rem', color: '#6b7280', padding: '10px 0' }}>Nenhuma execução registrada hoje.</div>}
        {jobs.map((job) => {
          const rs = porJob.get(job) ?? []
          const ok = rs.filter((r) => r.status === 'ok' || r.status === 'pulado').length
          const ruins = rs.filter((r) => ['erro', 'interrompida', 'bloqueio'].includes(r.status)).length
          return (
            <div key={job} style={{ display: 'grid', gridTemplateColumns: '230px 1fr 130px', gap: 10, alignItems: 'center', padding: '5px 0', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job}>
                {nomes.get(job) ?? job}
                {!nomes.has(job) && <span style={{ fontWeight: 400, color: '#9ca3af' }}> · GitHub</span>}
              </span>
              <div style={{ position: 'relative', height: 16, background: '#f9fafb', borderRadius: 4 }}>
                <div style={{ position: 'absolute', left: `${(agora / 1440) * 100}%`, top: -2, bottom: -2, width: 1, background: '#dc2626', opacity: 0.5 }} />
                {rs.map((r) => {
                  const ini = minutoDoDiaSP(r.iniciado_em)
                  const fim = r.finalizado_em ? minutoDoDiaSP(r.finalizado_em) : agora
                  const s = statusInfo(r.status)
                  return (
                    <div
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${horaSP(r.iniciado_em)} · ${s.rotulo}`}
                      onMouseEnter={(e) => mostrar(r, e)}
                      onMouseLeave={esconder}
                      onClick={(e) => fixar(r, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fixar(r, e as unknown as React.MouseEvent) } }}
                      style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${(ini / 1440) * 100}%`,
                        width: `max(8px, ${(Math.max(fim - ini, 0) / 1440) * 100}%)`,
                        cursor: 'pointer',
                        outline: balao?.fixo && balao.r.id === r.id ? '2px solid #111' : undefined, outlineOffset: 1, borderRadius: 2,
                      }}
                    >
                      <div style={{ position: 'absolute', top: 2, bottom: 2, left: 0, right: 0, background: s.cor, borderRadius: 2, opacity: r.status === 'pulado' ? 0.35 : 0.85 }} />
                    </div>
                  )
                })}
              </div>
              <span style={{ fontSize: '.72rem', color: '#374151' }}>
                {rs.length ? <>{ok} ok{ruins > 0 && <strong style={{ color: '#b91c1c' }}> · {ruins} com problema</strong>}</> : <span style={{ color: '#9ca3af' }}>nenhuma</span>}
              </span>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: '.68rem', color: '#6b7280' }}>
          {['ok', 'erro', 'interrompida', 'bloqueio', 'rodando', 'pulado'].map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: statusInfo(k).cor, opacity: k === 'pulado' ? 0.35 : 0.85 }} /> {statusInfo(k).rotulo}
            </span>
          ))}
          <span>· passe o mouse numa marca para ver o detalhe; clique para fixar</span>
        </div>
      </div>
      {balao && <BalaoDetalhe b={balao} nome={nomes.get(balao.r.job) ?? balao.r.job} onFechar={() => setBalao(null)} />}
    </div>
  )
}

function BalaoDetalhe({ b, nome, onFechar }: { b: Balao; nome: string; onFechar: () => void }) {
  const { r } = b
  const s = statusInfo(r.status)
  const fim = r.finalizado_em ? horaSP(r.finalizado_em) : 'em andamento'
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left: b.x, top: b.y, zIndex: 1000, width: 330, maxWidth: 'calc(100vw - 24px)',
        background: '#fff', color: '#111111', border: `1px solid ${s.borda}`, borderLeft: `4px solid ${s.cor}`, borderRadius: 10,
        boxShadow: '0 12px 30px -10px rgba(0,0,0,0.35)', padding: '10px 12px', fontSize: '.78rem', lineHeight: 1.45,
        pointerEvents: b.fixo ? 'auto' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</strong>
        <span style={{ fontSize: '.66rem', fontWeight: 700, color: s.cor, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{s.rotulo}</span>
      </div>
      <div style={{ color: '#374151', marginTop: 4 }}>
        {horaSP(r.iniciado_em)} → {fim}{r.duracao_ms != null ? ` · ${duracao(r.duracao_ms)}` : ''} · {quemDisparou(r)}
      </div>
      {r.detalhe && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto', color: '#111111' }}>{r.detalhe}</div>}
      {r.progresso && Object.keys(r.progresso).length > 0 && (
        <div style={{ marginTop: 6, color: '#374151' }}>{Object.entries(r.progresso).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      )}
      {b.fixo && <button type="button" onClick={onFechar} style={{ marginTop: 8, fontSize: '.7rem', border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>fechar (Esc)</button>}
    </div>
  )
}
