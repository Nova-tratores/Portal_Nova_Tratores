'use client'
// CARGA DA EQUIPE em LISTA (24/11/2026). José: "se o usuário clicar nele mesmo ele consegue ver o
// que está ocupando as horas dele, e melhora essa visualização".
//  · Uma linha por pessoa, a mais ocupada em cima. A barra = SEMANAS de fila (até "ocupada até"):
//    cinza normal, amarela acima de 2 semanas. Atrasado é um selo à parte (antes a barra ficava
//    vermelha em quase todo mundo e não dizia a carga).
//  · Clicou na pessoa: abre a fila dela embaixo, na ordem, com horas e datas. Título só do que
//    quem olha pode ver; o resto é "Outro compromisso" (/api/trabalho/carga?itens=1).
import { useState } from 'react'
import { ChevronDown, ChevronRight, Send, Lock, Repeat } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import SeloAtrasado, { SeloUrgente } from '@/components/tickets/SeloAtrasado'
import type { Carga } from './CargaDaPessoa'
import { COR } from './estiloFila'

interface ItemCarga { id: string | null; numero: number; titulo: string; horas: number; inicio: string; fim: string; prazo: string | null; atrasado: boolean; urgente: boolean; continuo: boolean; pedidoPor: string | null; semEstimativa: boolean; oculto: boolean }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
const semanas = (d: number) => (d <= 0 ? 'livre' : d <= 5 ? `${d} ${d === 1 ? 'dia' : 'dias'} de fila` : `~${Math.round(d / 5)} ${Math.round(d / 5) === 1 ? 'semana' : 'semanas'} de fila`)
const ESCALA = 20 // 20 dias úteis (4 semanas) = barra cheia

export default function EquipeLista({ pessoas, eu, onPedir, onAbrir }: {
  pessoas: Carga[]; eu: string
  onPedir: (userId: string) => void
  onAbrir: (ticketId: string) => void
}) {
  const [aberta, setAberta] = useState<string | null>(null)
  const [itens, setItens] = useState<Record<string, ItemCarga[] | 'erro'>>({})

  const abrir = async (id: string) => {
    if (aberta === id) { setAberta(null); return }
    setAberta(id)
    if (itens[id]) return
    try {
      const r = await fetch(`/api/trabalho/carga?user=${id}&itens=1`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      setItens((x) => ({ ...x, [id]: r.ok ? (j.itensDaFila || []) : 'erro' }))
    } catch { setItens((x) => ({ ...x, [id]: 'erro' })) }
  }

  const ordenadas = [...pessoas].sort((a, b) => (b.diasFila || 0) - (a.diasFila || 0) || b.itens - a.itens || a.nome.localeCompare(b.nome))

  return (
    <section className="mf-card mf-anim" style={{ padding: '6px 8px' }}>
      {ordenadas.map((p) => {
        const dias = p.diasFila || 0
        const aberto = aberta === p.id
        const lista = itens[p.id]
        const cheia = dias > 10
        return (
          <div key={p.id} style={{ borderTop: '1px solid var(--portal-border,#eef2f7)' }}>
            <div role="button" tabIndex={0} aria-expanded={aberto} onClick={() => abrir(p.id)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(p.id) } }}
              className="mf-eq-lin" title="Clique para ver o que ocupa a fila">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {aberto ? <ChevronDown size={16} color={COR.info} /> : <ChevronRight size={16} color={COR.info} />}
                <span className="mf-av" style={{ width: 30, height: 30, fontSize: 11 }}>{iniciais(p.nome)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}{p.id === eu ? ' (você)' : ''}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>{p.setor}</span>
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span className="mf-barra" style={{ ['--c' as string]: cheia ? COR.atencao : '#94a3b8' }}><i style={{ width: `${Math.min(100, (dias / ESCALA) * 100)}%` }} /></span>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
                  {p.itens === 0 ? 'fila vazia' : <>{semanas(dias)}{p.livreEm && <> · ocupada até <span style={{ color: cheia ? COR.atencao : undefined }}>{br(p.livreEm)}</span></>} · {p.itens} {p.itens === 1 ? 'item' : 'itens'}</>}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {p.atrasados > 0 && <SeloAtrasado>{p.atrasados} {p.atrasados === 1 ? 'atrasado' : 'atrasados'}</SeloAtrasado>}
                {p.id !== eu && <button className="mf-btn peq" onClick={(e) => { e.stopPropagation(); onPedir(p.id) }}><Send size={14} /> Pedir</button>}
              </span>
            </div>
            {aberto && (
              <div className="mf-anim" style={{ margin: '0 6px 10px 46px', padding: '4px 12px', borderRadius: 12, background: 'var(--portal-bg-secondary,#f8fafc)' }}>
                {!lista ? <div className="mf-vazio">Carregando a fila…</div>
                  : lista === 'erro' ? <div className="mf-vazio">Não deu para carregar.</div>
                  : lista.length === 0 ? <div className="mf-vazio">Fila vazia.</div>
                  : lista.map((i, k) => (
                    <div key={i.id || `o${k}`} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: k ? '1px solid var(--portal-border,#e9eef5)' : 'none', fontSize: 13.5 }}>
                      <span style={{ color: 'var(--portal-text-muted,#94a3b8)', fontVariantNumeric: 'tabular-nums' }}>{i.continuo ? <Repeat size={13} /> : `${k + 1}.`}</span>
                      <span style={{ minWidth: 0 }}>
                        {i.oculto
                          ? <span style={{ color: 'var(--portal-text-muted,#64748b)' }}><Lock size={12} style={{ verticalAlign: -1 }} /> Pedido (só a pessoa vê o título)</span>
                          : <button className="mf-tit" style={{ fontSize: 13.5 }} onClick={() => i.id && onAbrir(i.id)}>#{i.numero} {i.titulo}</button>}
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>
                          {i.continuo ? 'rotina' : `${i.semEstimativa ? '? h' : `${nf(i.horas)} h`} · ${i.inicio === i.fim ? br(i.inicio) : `${br(i.inicio)}–${br(i.fim)}`}`}
                          {i.pedidoPor && ` · pedido de ${i.pedidoPor.split(' ')[0]}`}
                        </span>
                      </span>
                      <span>{i.atrasado && i.prazo ? <SeloAtrasado>desde {br(i.prazo)}</SeloAtrasado> : i.urgente ? <SeloUrgente /> : null}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
