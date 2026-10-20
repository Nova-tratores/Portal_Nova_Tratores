'use client'
// POPs — histórico de execuções de UM POP (aba "Execuções" da ficha): quem fez,
// quando, de qual rotina, com qual referência (OS, chassi, placa) e quanto preencheu.
// Clicar abre a execução (fotos e respostas) em modo leitura para quem cuida do POP.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Repeat, Search } from 'lucide-react'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'
import { COR_POPS, br, campo, cartao, chamar, chip, primeiroNome, vazio, type UsuarioMapa } from './comum'

interface Execucao {
  ticket_id: string; numero: number; status: TicketStatus; prazo: string | null
  responsavel_id: string | null; criado_em: string; resolvido_em: string | null
  data_referencia: string | null; ref_externa: string | null; recorrente: boolean
  versao: number | null; respondidos: number; total: number
}
interface Resp { execucoes: Execucao[]; usuarios: UsuarioMapa; limite: number }

export default function HistoricoExecucoes({ popId }: { popId: string }) {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [ref, setRef] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let vivo = true
    chamar<Resp>(`/api/pops/${popId}/execucoes${busca ? `?ref=${encodeURIComponent(busca)}` : ''}`)
      .then((r) => { if (vivo) { setD(r); setErro('') } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
  }, [popId, busca])
  useEffect(() => { const t = setTimeout(() => setBusca(ref.trim()), 400); return () => clearTimeout(t) }, [ref])

  if (erro) return <div style={{ ...cartao, color: '#dc2626' }}>{erro}</div>
  if (!d) return <div style={vazio}>Carregando…</div>

  const concluidas = d.execucoes.filter((x) => x.status === 'resolvido' || x.status === 'fechado').length
  return (
    <div style={cartao}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ flex: '1 1 200px' }}>
          {d.execucoes.length} execução(ões){d.execucoes.length ? ` · ${concluidas} concluída(s)` : ''}
          {d.execucoes.length >= d.limite && <span style={{ fontWeight: 400, fontSize: 12 }}> (as {d.limite} mais recentes)</span>}
        </strong>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--portal-text-muted,#888)' }} />
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Buscar pela referência (OS, chassi, placa…)"
            style={{ ...campo, width: 280, paddingLeft: 28 }} />
        </div>
      </div>
      {!d.execucoes.length ? <div style={vazio}>{busca ? 'Nenhuma execução com essa referência.' : 'Este POP ainda não foi executado.'}</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--portal-text-muted,#888)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={th}>#</th><th style={th}>Dia</th><th style={th}>Quem executa</th><th style={th}>Referência</th>
                <th style={th}>Versão</th><th style={th}>Passos</th><th style={th}>Situação</th><th style={th}>Concluída</th>
              </tr>
            </thead>
            <tbody>
              {d.execucoes.map((x) => {
                const s = STATUS_INFO[x.status]
                return (
                  <tr key={x.ticket_id} style={{ borderTop: '1px solid var(--portal-border,#e5e7eb)' }}>
                    <td style={td}><Link href={`/pops/executar/${x.ticket_id}`} style={{ color: COR_POPS, fontWeight: 800 }}>#{x.numero}</Link></td>
                    <td style={td}>
                      {br(x.data_referencia || x.criado_em.slice(0, 10))}
                      {x.recorrente && <Repeat size={12} style={{ marginLeft: 4, verticalAlign: -1, color: 'var(--portal-text-muted,#888)' }} aria-label="rotina" />}
                    </td>
                    <td style={td}>{x.responsavel_id ? primeiroNome(d.usuarios[x.responsavel_id]?.nome || '—') : '—'}</td>
                    <td style={td}>{x.ref_externa || '—'}</td>
                    <td style={td}>{x.versao ? `v${x.versao}` : '—'}</td>
                    <td style={td}>{x.respondidos}/{x.total}</td>
                    <td style={td}>{s ? <span style={chip(s.cor, s.fundo)}>{s.label}</span> : x.status}</td>
                    <td style={td}>{x.resolvido_em ? br(x.resolvido_em.slice(0, 10)) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 800 }
const td: React.CSSProperties = { padding: '8px', whiteSpace: 'nowrap' }
