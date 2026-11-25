'use client'
// SUGESTÕES PARA A PAUTA (melhorias 4.1, 25/11/2026) — aparece antes da reunião, para quem monta a
// pauta. Dois blocos, cada pedido com "Incluir" (vira um assunto da pauta ligado ao pedido):
//  1. O que ficou da última — os pedidos que nasceram na reunião anterior da série e como estão.
//  2. Travados — pedidos dos participantes aguardando interno, com a bola parada ou com prazo impossível.
// Carrega à parte (/api/reunioes/:id/sugestoes) para não atrasar a abertura da reunião.
import { useCallback, useEffect, useState } from 'react'
import { Lightbulb, Plus, Check, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { chamar, primeiroNome } from './comum'

interface Sugestao { id: string; numero: number; titulo: string; status: string; prazo: string | null; responsavel_id: string; motivo: string; incluido: boolean }
interface Resp { anterior: { id: string; numero: number; prazo: string | null } | null; ultima: Sugestao[]; travados: Sugestao[]; mais: number; ocultos: number; usuarios: Record<string, { nome: string }> }

const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')
const COR_MOTIVO: Record<string, string> = { 'prazo impossível': '#6d28d9', 'bola parada': '#b45309', 'aguardando interno': '#0891b2', feito: '#059669', cancelado: '#64748b', 'em aberto': '#2563eb' }

export default function SugestoesPauta({ reuniaoId, podeIncluir, onIncluido, onAbrirTicket }: {
  reuniaoId: string
  podeIncluir: boolean
  onIncluido: () => void
  onAbrirTicket: (id: string) => void
}) {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(true)
  const [incluindo, setIncluindo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try { setD(await chamar<Resp>(`/api/reunioes/${reuniaoId}/sugestoes`)); setErro('') }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não deu para montar as sugestões') }
  }, [reuniaoId])
  useEffect(() => { carregar() }, [carregar])

  const incluir = async (s: Sugestao, bloco: 'ultima' | 'travado') => {
    setIncluindo(s.id); setErro('')
    try {
      await chamar(`/api/reunioes/${reuniaoId}/itens`, { json: {
        acao: 'incluir', tipo: 'discutir', tempo_min: 5, ticket_referencia_id: s.id,
        pergunta: (bloco === 'ultima' ? `Como está o #${s.numero} ${s.titulo}?` : `Destravar o #${s.numero} ${s.titulo} (${s.motivo})`).slice(0, 500),
      } })
      setD((x) => x && ({ ...x, ultima: x.ultima.map((i) => (i.id === s.id ? { ...i, incluido: true } : i)), travados: x.travados.map((i) => (i.id === s.id ? { ...i, incluido: true } : i)) }))
      onIncluido()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu para incluir') } finally { setIncluindo(null) }
  }

  if (!d && !erro) return null
  const total = (d?.ultima.length || 0) + (d?.travados.length || 0)
  if (d && total === 0 && !d.ocultos) return null

  const linha = (s: Sugestao, bloco: 'ultima' | 'travado') => (
    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--portal-border,#eef2f7)' }}>
      <span style={{ minWidth: 0 }}>
        <button onClick={() => onAbrirTicket(s.id)} style={{ display: 'block', maxWidth: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 14, color: 'var(--portal-text,#0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{s.numero} {s.titulo}</button>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>
          <span style={{ color: COR_MOTIVO[s.motivo] || 'inherit' }}>{s.motivo}</span> · com {primeiroNome(d!.usuarios[s.responsavel_id]?.nome || 'alguém')}{s.prazo ? ` · prazo ${br(s.prazo)}` : ''}
        </span>
      </span>
      {s.incluido
        ? <span style={{ fontSize: 12.5, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={14} /> na pauta</span>
        : podeIncluir && <button className="rd-btn" disabled={incluindo === s.id} onClick={() => incluir(s, bloco)} title="Vira um assunto da pauta (5 min, discutir), ligado ao pedido"><Plus size={14} /> Incluir</button>}
    </div>
  )

  return (
    <section className="rd-card">
      <button onClick={() => setAberto(!aberto)} className="rd-sec" aria-expanded={aberto}
        style={{ ['--c' as string]: '#d97706', width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
        <span className="ic"><Lightbulb size={16} /></span>
        <span style={{ flex: 1 }}><b>Sugestões para a pauta</b><small>O que ficou da última reunião e o que está travado com quem participa</small></span>
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {aberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
          {erro && <div style={{ fontSize: 13, color: '#dc2626' }}>{erro}</div>}
          {d && d.ultima.length > 0 && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>1. O que ficou da última{d.anterior?.prazo ? ` (${br(d.anterior.prazo)})` : ''}</div>
              {d.ultima.map((s) => linha(s, 'ultima'))}
            </div>
          )}
          {d && (d.travados.length > 0 || d.ocultos > 0) && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.ultima.length > 0 ? '2. ' : ''}Travados</div>
              {d.travados.map((s) => linha(s, 'travado'))}
              {d.mais > 0 && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)', paddingTop: 6 }}>+{d.mais} outros travados (veja na Equipe)</div>}
              {d.ocultos > 0 && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)', paddingTop: 6 }}><Lock size={12} style={{ verticalAlign: -1 }} /> +{d.ocultos} {d.ocultos === 1 ? 'pedido privado travado' : 'pedidos privados travados'} (só quem está neles vê o título)</div>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
