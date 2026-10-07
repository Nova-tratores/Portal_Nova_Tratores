'use client'
// Abas do painel do zap ligadas à MEMÓRIA do Tratorilson:
//  - "Precisa de atendimento": cliente sem resposta (vigia) ou o Tratorilson
//    pediu ajuda. Quem atende escreve o que o Tratorilson deve responder da
//    próxima vez (vira regra) — ou dispensa dizendo o motivo.
//  - "Dispensadas sem atualizar": o que foi fechado sem ensinar o Tratorilson
//    (cards dispensados + perguntas fechadas sem resposta). Dá para ensinar depois.
import { useState } from 'react'
import { MessageCircle, BrainCircuit, Check, Clock, Bot } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

export interface CardAtendimento {
  id: number
  created_at: string
  contato_nome: string | null
  contato_telefone: string | null
  cliente_nome: string | null
  resumo: string | null
  origem?: string | null
  ultima_msg_em?: string | null
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
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
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

// Separa "Cliente sem resposta há 17 h: "a / b"" em espera + mensagens.
function lerResumo(resumo: string | null): { espera: string | null; msgs: string[] } {
  const m = String(resumo || '').match(/^Cliente sem resposta há ([^:]+):\s*"([\s\S]*)"$/)
  if (m) return { espera: m[1], msgs: m[2].split(' / ').map((x) => x.trim()).filter(Boolean) }
  return { espera: null, msgs: resumo ? [resumo] : [] }
}
const iniciais = (n: string) => n.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'

function CardPendente({ c, onMudou }: { c: CardAtendimento; onMudou: () => void }) {
  const [modo, setModo] = useState<null | 'ensinar' | 'dispensar'>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const lido = lerResumo(c.resumo)
  const msgs = lido.msgs
  // tempo REAL desde a última mensagem do cliente (o texto do resumo congela na criação)
  const min = c.ultima_msg_em ? Math.max(0, Math.round((Date.now() - new Date(c.ultima_msg_em).getTime()) / 60000)) : null
  const espera = min === null ? lido.espera : min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`
  const horas = min !== null ? min / 60 : espera && /h$/.test(espera) ? parseInt(espera, 10) : 0
  const corEspera = horas >= 4 ? '#dc2626' : '#d97706'
  const nome = c.contato_nome || c.contato_telefone || 'Contato'
  const selo: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 800 }
  return (
    <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
      {/* quem */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', background: 'rgba(22,163,74,.12)', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{iniciais(nome)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--portal-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</div>
          <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.contato_telefone}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''}
          </div>
        </div>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          {espera
            ? <span style={{ ...selo, color: corEspera, background: corEspera + '1a' }}><Clock size={12} /> esperando há {espera}</span>
            : <span style={{ ...selo, color: '#dc2626', background: 'rgba(220,38,38,.1)' }}><Bot size={12} /> Tratorilson pediu ajuda</span>}
          <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', marginTop: 3 }}>{quando(c.created_at)}</div>
        </div>
      </div>

      {/* o que o cliente escreveu, como no WhatsApp */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', borderRadius: 12, background: 'var(--portal-bg-secondary)' }}>
        {msgs.map((t, i) => (
          <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%', padding: '7px 11px', borderRadius: '4px 12px 12px 12px', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', fontSize: 13.5, color: 'var(--portal-text)', lineHeight: 1.4 }}>{t}</div>
        ))}
      </div>

      {/* ações */}
      {modo === null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {c.link && <a href={c.link} target="_blank" rel="noreferrer" style={btn('#16a34a', true)}><MessageCircle size={14} /> Responder no NovaZap</a>}
          <button style={btn('#2563eb', false)} onClick={() => setModo('ensinar')}><BrainCircuit size={14} /> Ensinar o Tratorilson</button>
          <button onClick={() => setModo('dispensar')} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Dispensar</button>
        </div>
      )}
      {modo === 'ensinar' && (
        <div style={{ borderTop: '1px solid var(--portal-border)', paddingTop: 10 }}>
          <Ensinar rotulo="O que o Tratorilson deve responder da próxima vez numa situação assim?" onCancelar={() => setModo(null)}
            onSalvar={async (t) => { await post('/api/tratorilson/solicitacoes/memoria', { id: c.id, acao: 'atualizar', resposta: t }); onMudou() }} />
        </div>
      )}
      {modo === 'dispensar' && (
        <div style={{ borderTop: '1px solid var(--portal-border)', paddingTop: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)' }}>Por que não vai ensinar o Tratorilson?
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
  if (!cards.length) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: 'var(--portal-text-secondary)' }}>Nenhum cliente esperando atendimento.</div>
  return (
    <div style={{ padding: 18 }}>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
        Responda o cliente no NovaZap e depois ensine o Tratorilson, para da próxima vez ele mesmo responder.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 430px), 1fr))', gap: 14 }}>
        {cards.map((c) => <CardPendente key={c.id} c={c} onMudou={onMudou} />)}
      </div>
    </div>
  )
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
