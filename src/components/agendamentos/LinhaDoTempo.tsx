'use client'
// Aba "Hoje": uma faixa por agendamento, de 00h a 24h (Brasília), com cada execução
// no horário em que começou — largura = duração, cor = resultado. Mostra onde o dia
// teve problema e se dois pesados se encostaram.
import type { AgendamentoPainel, Rodada } from './tipos'
import { duracao, horaSP, quemDisparou, statusInfo } from './tipos'

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
                      title={`${horaSP(r.iniciado_em)} · ${s.rotulo}${r.duracao_ms != null ? ` · ${duracao(r.duracao_ms)}` : ''} · ${quemDisparou(r)}${r.detalhe ? `\n${r.detalhe}` : ''}`}
                      style={{
                        position: 'absolute', top: 2, bottom: 2,
                        left: `${(ini / 1440) * 100}%`,
                        width: `max(3px, ${(Math.max(fim - ini, 0) / 1440) * 100}%)`,
                        background: s.cor, borderRadius: 2, opacity: r.status === 'pulado' ? 0.35 : 0.85,
                      }}
                    />
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
          <span>· passe o mouse numa marca para ver o detalhe</span>
        </div>
      </div>
    </div>
  )
}
