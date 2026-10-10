'use client'
// POPs — painel por área: POPs (publicados, revisão vencida), execuções do
// período e % das RECORRENTES concluídas no prazo (avulsa fica fora da conta).
// Números vêm do banco (pops_painel_area) — as listas são só para exibir.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { COR_POPS, br, campo, cartao, chamar, pagina, primeiroNome, vazio, type AreasResp, type UsuarioMapa } from '@/components/pops/comum'

interface Painel {
  periodo: { de: string; ate: string; dias: number }
  totais: Record<string, number>
  pct_no_prazo: number | null
  revisao_vencida: { id: string; codigo: string; titulo: string; dono_id: string; proxima_revisao_em: string }[]
  atrasadas: { ticket_id: string; data_referencia: string | null; ref_externa: string | null; tickets: { numero: number; prazo: string; responsavel_id: string }; pop: { codigo: string; titulo: string } | null }[]
  usuarios: UsuarioMapa
}

function Tile({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string | number; detalhe?: string; cor?: string }) {
  return (
    <div style={{ ...cartao, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--portal-text-muted,#888)' }}>{rotulo}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: cor || 'var(--portal-text,#111)', marginTop: 2 }}>{valor}</div>
      {detalhe && <div style={{ fontSize: 12, color: 'var(--portal-text-secondary,#555)' }}>{detalhe}</div>}
    </div>
  )
}

export default function PainelPops() {
  const { userProfile } = useAuth()
  const [areas, setAreas] = useState<AreasResp | null>(null)
  const [area, setArea] = useState('')
  const [dias, setDias] = useState(30)
  const [p, setP] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [a, r] = await Promise.all([
        chamar<AreasResp>('/api/pops/areas'),
        chamar<Painel>(`/api/pops/painel?dias=${dias}${area ? `&area=${area}` : ''}`),
      ])
      setAreas(a); setP(r)
    } catch (e) { setErro((e as Error).message) }
  }, [area, dias])
  // carregar ao montar/trocar filtro (padrão do portal, ver CentralNav)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const t = p?.totais || {}
  return (
    <div style={pagina}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={area} onChange={(e) => setArea(e.target.value)} style={{ ...campo, width: 'auto' }}>
          <option value="">Todas as áreas</option>
          {(areas?.areas || []).filter((a) => a.ativo).map((a) => <option key={a.id} value={a.id}>{a.sigla} — {a.nome}</option>)}
        </select>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ ...campo, width: 'auto' }}>
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option>
        </select>
        {p && <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>{br(p.periodo.de)} a {br(p.periodo.ate)}</span>}
      </div>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 12 }}>{erro}</div>}
      {!p ? <div style={vazio}>{erro ? '' : 'Carregando…'}</div> : (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginBottom: 16 }}>
            <Tile rotulo="POPs" valor={t.pops_total ?? 0} detalhe={`${t.pops_publicados ?? 0} publicados`} />
            <Tile rotulo="Revisão vencida" valor={t.revisao_vencida ?? 0} cor={t.revisao_vencida ? '#b45309' : undefined} />
            <Tile rotulo="Execuções no período" valor={t.execucoes ?? 0} detalhe={`${t.execucoes_concluidas ?? 0} concluídas · ${t.execucoes_canceladas ?? 0} canceladas`} />
            <Tile rotulo="Recorrentes no prazo" valor={p.pct_no_prazo === null ? '—' : `${p.pct_no_prazo.toLocaleString('pt-BR')}%`}
              detalhe={`${t.recorrentes_no_prazo ?? 0} de ${t.recorrentes ?? 0} rotinas · avulsas fora da conta`}
              cor={p.pct_no_prazo !== null && p.pct_no_prazo < 80 ? '#b91c1c' : COR_POPS} />
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
            <section style={cartao}>
              <h2 style={{ fontSize: 15, margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={15} style={{ color: '#b45309' }} /> Revisão vencida</h2>
              {!p.revisao_vencida.length ? <div style={{ fontSize: 14, color: 'var(--portal-text-muted,#888)' }}>Nenhum POP com revisão vencida.</div> : p.revisao_vencida.map((x) => (
                <Link key={x.id} href={`/pops/${x.id}`} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)', textDecoration: 'none', color: 'inherit', fontSize: 14 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', color: COR_POPS, fontWeight: 800 }}>{x.codigo}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titulo}</span>
                  <span style={{ fontSize: 12, color: '#b45309' }}>{br(x.proxima_revisao_em)} · {primeiroNome(p.usuarios[x.dono_id]?.nome)}</span>
                </Link>
              ))}
            </section>
            <section style={cartao}>
              <h2 style={{ fontSize: 15, margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}><Clock size={15} style={{ color: '#b91c1c' }} /> Execuções atrasadas em aberto</h2>
              {!p.atrasadas.length ? <div style={{ fontSize: 14, color: 'var(--portal-text-muted,#888)' }}>Nenhuma execução atrasada.</div> : p.atrasadas.map((x) => (
                <Link key={x.ticket_id} href={`/pops/executar/${x.ticket_id}`} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: '1px solid var(--portal-border,#e5e7eb)', textDecoration: 'none', color: 'inherit', fontSize: 14 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', color: COR_POPS, fontWeight: 800 }}>{x.pop?.codigo}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{x.tickets.numero}{x.ref_externa ? ` · ${x.ref_externa}` : ''}</span>
                  <span style={{ fontSize: 12, color: '#b91c1c' }}>prazo {br(x.tickets.prazo)} · {primeiroNome(p.usuarios[x.tickets.responsavel_id]?.nome)}</span>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
