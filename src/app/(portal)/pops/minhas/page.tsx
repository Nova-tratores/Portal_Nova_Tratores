'use client'
// POPs — minhas execuções (sou quem executa ou participo). Para quem só executa
// e não tem a Central de Trabalho; na Central elas aparecem como tickets normais.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { COR_POPS, br, cartao, chamar, chip, pagina, vazio } from '@/components/pops/comum'

interface Ex {
  id: string; numero: number; titulo: string; status: string; prazo: string | null; created_at: string
  ref_externa: string | null; data_referencia: string | null; respondidos: number; total: number
}

const ROTULO: Record<string, [string, string]> = {
  aberto: ['A começar', '#2563eb'], em_andamento: ['Em andamento', '#d97706'], aguardando_terceiro: ['Aguardando', '#7c3aed'],
  aguardando_interno: ['Aguardando', '#0891b2'], resolvido: ['Concluída (conferir)', '#059669'], fechado: ['Fechada', '#6b7280'], cancelado: ['Cancelada', '#dc2626'],
}

export default function Minhas() {
  const { userProfile } = useAuth()
  const [encerradas, setEncerradas] = useState(false)
  const [lista, setLista] = useState<Ex[] | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try { const r = await chamar<{ execucoes: Ex[] }>(`/api/pops/execucoes${encerradas ? '?encerradas=1' : ''}`); setLista(r.execucoes) }
    catch (e) { setErro((e as Error).message) }
  }, [encerradas])
  // carregar ao montar/trocar o filtro (padrão do portal, ver CentralNav)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const hoje = new Date().toISOString().slice(0, 10)
  return (
    <div style={pagina}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[false, true].map((e) => (
          <button key={String(e)} onClick={() => setEncerradas(e)} style={{
            padding: '8px 14px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)',
            background: encerradas === e ? COR_POPS : 'var(--portal-surface,#fff)', color: encerradas === e ? '#fefefe' : 'var(--portal-text,#111)',
          }}>{e ? 'Encerradas' : 'Em aberto'}</button>
        ))}
      </div>
      {erro && <div style={{ ...cartao, color: '#dc2626', marginBottom: 10 }}>{erro}</div>}
      {!lista ? <div style={vazio}>Carregando…</div> : !lista.length ? (
        <div style={vazio}>{encerradas ? 'Nenhuma execução encerrada.' : 'Nada para executar agora.'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {lista.map((x) => {
            const [rot, cor] = ROTULO[x.status] || [x.status, '#6b7280']
            const atrasada = !encerradas && x.prazo && x.prazo < hoje
            const pct = x.total ? Math.round((x.respondidos / x.total) * 100) : 0
            return (
              <Link key={x.id} href={`/pops/executar/${x.id}`} style={{ ...cartao, textDecoration: 'none', color: 'inherit', display: 'grid', gap: 8, borderLeft: `4px solid ${cor}` }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PlayCircle size={18} style={{ color: COR_POPS }} />
                  <strong style={{ flex: 1, minWidth: 0 }}>{x.titulo}</strong>
                  <span style={chip(cor, `${cor}1f`)}>{rot}</span>
                  {atrasada && <span style={chip('#b91c1c', 'rgba(220,38,38,.12)')}>atrasada</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
                  #{x.numero} · {x.prazo ? `para ${br(x.prazo)}` : `aberta ${br(x.created_at.slice(0, 10))}`}{x.ref_externa ? ` · ref. ${x.ref_externa}` : ''}
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--portal-border,#e5e7eb)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: COR_POPS }} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
