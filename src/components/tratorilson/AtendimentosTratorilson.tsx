'use client'
// Abas do painel do zap ligadas à MEMÓRIA do Tratorilson:
//  - "Precisa de atendimento": cliente sem resposta (vigia) ou o Tratorilson
//    pediu ajuda. Quem atende escreve o que o Tratorilson deve responder da
//    próxima vez (vira regra) — ou dispensa dizendo o motivo.
//  - "Dispensadas sem atualizar": o que foi fechado sem ensinar o Tratorilson
//    (cards dispensados + perguntas fechadas sem resposta). Dá para ensinar depois.
import { useState } from 'react'
import { MessageCircle, BrainCircuit, CircleX, Check } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

export interface CardAtendimento {
  id: number
  created_at: string
  contato_nome: string | null
  contato_telefone: string | null
  cliente_nome: string | null
  resumo: string | null
  origem?: string | null
  link?: string | null
  memoria?: string | null
  dispensa_motivo?: string | null
  memoria_por?: string | null
  memoria_em?: string | null
}
export interface PerguntaFechada {
  id: number
  criado_em: string
  contato_nome: string | null
  contato_telefone: string | null
  pergunta: string
  contexto: string | null
  respondido_por: string | null
  respondido_em: string | null
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const btn = (cor: string, cheio: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fff' : cor, textDecoration: 'none',
})
const area: React.CSSProperties = { width: '100%', minHeight: 60, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Falha')
  return j
}

function Ensinar({ onSalvar, onCancelar, rotulo }: { onSalvar: (texto: string) => Promise<void>; onCancelar?: () => void; rotulo: string }) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{rotulo}
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} style={{ ...area, marginTop: 4 }}
          placeholder="Ex.: Contrato de financiamento: pedir o CPF do titular e passar para a Larissa no financeiro." />
      </label>
      {erro && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button style={btn('#16a34a', true)} disabled={salvando || texto.trim().length < 5}
          onClick={async () => { setSalvando(true); setErro(''); try { await onSalvar(texto.trim()) } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) } }}>
          <BrainCircuit size={14} /> {salvando ? 'Salvando…' : 'Atualizar memória'}
        </button>
        {onCancelar && <button style={btn('var(--portal-text-secondary)', false)} onClick={onCancelar}>Cancelar</button>}
      </div>
    </div>
  )
}

function CardPendente({ c, onMudou }: { c: CardAtendimento; onMudou: () => void }) {
  const [modo, setModo] = useState<null | 'dispensar'>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: '4px solid #dc2626', borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>
          {c.contato_nome || 'Contato'}{c.contato_telefone ? <span style={{ fontWeight: 500, color: 'var(--portal-text-secondary)' }}> · {c.contato_telefone}</span> : null}
        </strong>
        <span style={{ fontSize: 11, color: 'var(--portal-text-secondary)' }}>{quando(c.created_at)} · {c.origem === 'vigia' ? 'ficou sem resposta' : 'o Tratorilson pediu ajuda'}</span>
      </div>
      {c.cliente_nome && <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)' }}>{c.cliente_nome}</div>}
      <div style={{ fontSize: 13, color: 'var(--portal-text)', margin: '6px 0', lineHeight: 1.45 }}>{c.resumo}</div>
      {c.link && <a href={c.link} target="_blank" rel="noreferrer" style={btn('#16a34a', false)}><MessageCircle size={14} /> Abrir conversa no NovaZap</a>}
      <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600, marginTop: 10 }}>
        Depois de atender, ensine o Tratorilson para ele mesmo responder da próxima vez.
      </div>
      {modo === null && (
        <>
          <Ensinar rotulo="O que o Tratorilson deve responder numa situação assim?" onSalvar={async (t) => { await post('/api/tratorilson/solicitacoes/memoria', { id: c.id, acao: 'atualizar', resposta: t }); onMudou() }} />
          <button style={{ ...btn('#dc2626', false), marginTop: 6 }} onClick={() => setModo('dispensar')}><CircleX size={14} /> Dispensar sem atualizar</button>
        </>
      )}
      {modo === 'dispensar' && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>Por que não vai atualizar a memória?
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...area, marginTop: 4, minHeight: 44 }} placeholder="Ex.: caso pontual, não se repete" autoFocus />
          </label>
          {erro && <div style={{ color: '#dc2626', fontSize: 12 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button style={btn('#dc2626', true)} disabled={motivo.trim().length < 3}
              onClick={async () => { try { await post('/api/tratorilson/solicitacoes/memoria', { id: c.id, acao: 'dispensar', motivo }); onMudou() } catch (e) { setErro((e as Error).message) } }}>
              <Check size={14} /> Dispensar
            </button>
            <button style={btn('var(--portal-text-secondary)', false)} onClick={() => setModo(null)}>Voltar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PrecisaAtendimento({ cards, onMudou }: { cards: CardAtendimento[]; onMudou: () => void }) {
  if (!cards.length) return <div style={{ padding: 20, fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nenhum cliente esperando atendimento.</div>
  return <div style={{ display: 'grid', gap: 10, padding: 14, maxWidth: 820 }}>{cards.map((c) => <CardPendente key={c.id} c={c} onMudou={onMudou} />)}</div>
}

export function DispensadasSemAtualizar({ cards, perguntas, onMudou }: { cards: CardAtendimento[]; perguntas: PerguntaFechada[]; onMudou: () => void }) {
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const itens = [
    ...cards.map((c) => ({ chave: `c${c.id}`, data: c.memoria_em || c.created_at, nome: c.contato_nome || c.contato_telefone || 'Contato', texto: c.resumo || '', quem: c.memoria_por, motivo: c.dispensa_motivo, link: c.link,
      salvar: (t: string) => post('/api/tratorilson/solicitacoes/memoria', { id: c.id, acao: 'atualizar', resposta: t }) })),
    ...perguntas.map((p) => ({ chave: `p${p.id}`, data: p.respondido_em || p.criado_em, nome: p.contato_nome || p.contato_telefone || 'Contato', texto: `O Tratorilson perguntou: ${p.pergunta}${p.contexto ? ` (cliente: "${p.contexto.slice(0, 200)}")` : ''}`, quem: p.respondido_por, motivo: 'pergunta fechada sem resposta', link: null,
      salvar: (t: string) => post('/api/tratorilson/perguntas', { id: p.id, resposta: t, depois: true }) })),
  ].sort((a, b) => b.data.localeCompare(a.data))
  if (!itens.length) return <div style={{ padding: 20, fontSize: 13, color: 'var(--portal-text-secondary)' }}>Nada dispensado sem atualizar a memória.</div>
  return (
    <div style={{ display: 'grid', gap: 10, padding: 14, maxWidth: 820 }}>
      {itens.map((i) => (
        <div key={i.chave} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: '4px solid #d97706', borderRadius: 10, padding: '11px 13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>{i.nome}</strong>
            <span style={{ fontSize: 11, color: 'var(--portal-text-secondary)' }}>dispensada {quando(i.data)}{i.quem ? ` por ${i.quem}` : ''}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--portal-text)', margin: '6px 0', lineHeight: 1.45 }}>{i.texto}</div>
          {i.motivo && <div style={{ fontSize: 12, color: '#b45309' }}>Motivo: {i.motivo}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {i.link && <a href={i.link} target="_blank" rel="noreferrer" style={btn('#16a34a', false)}><MessageCircle size={14} /> Abrir conversa</a>}
            {abrindo !== i.chave && <button style={btn('#16a34a', true)} onClick={() => setAbrindo(i.chave)}><BrainCircuit size={14} /> Atualizar memória agora</button>}
          </div>
          {abrindo === i.chave && <Ensinar rotulo="O que o Tratorilson deve responder numa situação assim?" onCancelar={() => setAbrindo(null)}
            onSalvar={async (t) => { await i.salvar(t); setAbrindo(null); onMudou() }} />}
        </div>
      ))}
    </div>
  )
}
