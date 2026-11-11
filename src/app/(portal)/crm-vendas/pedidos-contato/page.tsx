'use client'
// Pedidos de contato dos vendedores (app de vendas → "Pedir ao suporte").
// O sino do suporte (Mariano) abre aqui com ?id=<pedido>: ele vê o que o vendedor
// pediu e o contato que o vendedor enxerga hoje, abre a Pasta do cliente se
// precisar, preenche celular/telefone/endereço/localização e salva. O vendedor
// recebe um recado no app e o contato já aparece na quest.
// API: /api/crm-vendas/pedidos-contato.
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchAuth } from '@/lib/auth/client'

interface Pedido {
  id: number; quest_id: number | null; negocio_id: number | null; pedido_por: string; falta: string[]; obs: string | null
  alvo: string | null; cliente_nome: string | null; cliente_cod: number | null; cliente_doc: string | null; chassis: string | null
  cidade: string | null; status: 'aberto' | 'respondido' | 'dispensado'; telefone: string | null; celular: string | null
  endereco: string | null; lat: number | null; lng: number | null; resposta_obs: string | null; respondido_por: string | null
  respondido_em: string | null; created_at: string
}
interface Telefone { numero: string; exibir: string; celular: boolean; origem: string; nome?: string | null }
interface Local { nome: string; lat: number; lng: number; origem: string }
interface Contato { cliente: { nome: string; cod: number | null; doc: string | null } | null; telefones: Telefone[]; endereco: string | null; locais: Local[]; falta: string[] }

const ROTULO_FALTA: Record<string, string> = { telefone: 'Telefone', whatsapp: 'Celular / WhatsApp', endereco: 'Endereço / localização' }
const ORIGEM: Record<string, string> = { omie: 'cadastro Omie', crm: 'CRM', quest: 'da quest', contato: 'contato', suporte: 'suporte' }
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const COR = '#DC2626'

const caixa: React.CSSProperties = { background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 16 }
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', fontSize: 14 }
const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted, #64748b)', marginBottom: 4 }
const botao = (cor: string, cheio = true): React.CSSProperties => ({
  padding: '9px 14px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#111111' : cor,
})

function Tela() {
  const sp = useSearchParams()
  const router = useRouter()
  const idSel = Number(sp.get('id')) || null
  const [status, setStatus] = useState<'aberto' | 'respondido' | 'todos'>('aberto')
  const [lista, setLista] = useState<Pedido[]>([])
  const [aviso, setAviso] = useState('')
  const [erroLista, setErroLista] = useState('')

  const carregarLista = useCallback(async () => {
    const r = await fetchAuth(`/api/crm-vendas/pedidos-contato?status=${status}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErroLista(j.error || `Falha (${r.status})`); return }
    setErroLista(''); setAviso(j.aviso || ''); setLista(j.pedidos || [])
  }, [status])
  useEffect(() => { carregarLista() }, [carregarLista])

  const abrir = (id: number | null) => router.replace(id ? `/crm-vendas/pedidos-contato?id=${id}` : '/crm-vendas/pedidos-contato')

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 16, alignItems: 'start' }} className="pedidos-contato">
      <style>{`@media (max-width: 860px) { .pedidos-contato { grid-template-columns: 1fr !important; } }`}</style>
      <div style={caixa}>
        <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>Pedidos de contato</p>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', margin: '0 0 10px' }}>
          O vendedor não achou telefone ou endereço do cliente no app e pediu ao suporte. Preencha e o vendedor é avisado.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['aberto', 'respondido', 'todos'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} style={{ ...botao(COR, status === s), padding: '5px 10px', fontSize: 12 }}>
              {s === 'aberto' ? 'Em aberto' : s === 'respondido' ? 'Respondidos' : 'Todos'}
            </button>
          ))}
        </div>
        {aviso && <p style={{ fontSize: 13, color: '#b45309' }}>{aviso}</p>}
        {erroLista && <p style={{ fontSize: 13, color: COR }}>{erroLista}</p>}
        {!lista.length && !aviso && !erroLista && <p style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>Nenhum pedido aqui.</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {lista.map((p) => (
            <button key={p.id} type="button" onClick={() => abrir(p.id)}
              style={{ textAlign: 'left', padding: 10, borderRadius: 8, cursor: 'pointer', background: 'transparent',
                border: `1px solid ${p.id === idSel ? COR : 'var(--border, #e2e8f0)'}`, color: 'var(--portal-text, #0f172a)' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{p.cliente_nome || p.alvo || `Pedido #${p.id}`}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                {p.pedido_por} · {quando(p.created_at)} · {p.falta.map((f) => ROTULO_FALTA[f] || f).join(', ')}
              </span>
              {p.status !== 'aberto' && <span style={{ fontSize: 11, fontWeight: 700, color: p.status === 'respondido' ? '#15803d' : '#64748b' }}>{p.status === 'respondido' ? 'Respondido' : 'Não encontrado'}</span>}
            </button>
          ))}
        </div>
      </div>

      {idSel ? <Detalhe key={idSel} id={idSel} onFeito={() => { carregarLista() }} /> : (
        <div style={{ ...caixa, color: 'var(--portal-text-muted, #64748b)', fontSize: 14 }}>Escolha um pedido na lista.</div>
      )}
    </div>
  )
}

function Detalhe({ id, onFeito }: { id: number; onFeito: () => void }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [contato, setContato] = useState<Contato | null>(null)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({ celular: '', telefone: '', endereco: '', mapa: '', obs: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    const r = await fetchAuth(`/api/crm-vendas/pedidos-contato?id=${id}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErro(j.error || `Falha (${r.status})`); return }
    setErro(''); setPedido(j.pedido); setContato(j.contato)
    if (j.pedido?.status === 'respondido') {
      setForm({
        celular: j.pedido.celular || '', telefone: j.pedido.telefone || '', endereco: j.pedido.endereco || '',
        mapa: j.pedido.lat != null ? `${j.pedido.lat}, ${j.pedido.lng}` : '', obs: j.pedido.resposta_obs || '',
      })
    }
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  async function enviar(acao: 'responder' | 'dispensar') {
    let motivo: string | null = null
    if (acao === 'dispensar') {
      motivo = prompt('Por que não deu para conseguir o contato? (vai para o vendedor)')
      if (motivo === null) return
    }
    setSalvando(true); setMsg('')
    try {
      const r = await fetchAuth('/api/crm-vendas/pedidos-contato', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acao === 'responder' ? { id, acao, ...form } : { id, acao, motivo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error || `Falha (${r.status})`); return }
      setMsg(j.avisado ? 'Salvo. O vendedor foi avisado no app.' : 'Salvo.')
      onFeito(); carregar()
    } finally { setSalvando(false) }
  }

  if (erro) return <div style={caixa}><p style={{ color: COR, fontSize: 14 }}>{erro}</p></div>
  if (!pedido) return <div style={caixa}><p style={{ fontSize: 14 }}>Carregando…</p></div>

  const cod = contato?.cliente?.cod ?? pedido.cliente_cod
  const doc = (contato?.cliente?.doc ?? pedido.cliente_doc ?? '').replace(/\D/g, '')
  const pasta = cod ? `/clientes?cod=${cod}${doc ? `&doc=${doc}` : ''}` : null
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={caixa}>
        <p style={{ fontSize: 12, fontWeight: 800, color: COR, margin: 0 }}>
          {pedido.status === 'aberto' ? 'EM ABERTO' : pedido.status === 'respondido' ? `RESPONDIDO por ${pedido.respondido_por} em ${quando(pedido.respondido_em)}` : `NÃO ENCONTRADO (${pedido.respondido_por})`}
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, margin: '4px 0' }}>{pedido.cliente_nome || pedido.alvo || `Pedido #${pedido.id}`}</p>
        <p style={{ fontSize: 14, margin: '0 0 6px' }}>
          <b>{pedido.pedido_por}</b> pediu em {quando(pedido.created_at)}: <b>{pedido.falta.map((f) => ROTULO_FALTA[f] || f).join(', ')}</b>
        </p>
        <p style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)', margin: 0 }}>
          {[pedido.cidade && `Cidade: ${pedido.cidade}`, pedido.chassis && `Trator: …${pedido.chassis.slice(-6)}`, pedido.alvo, pedido.quest_id && `Quest #${pedido.quest_id}`, pedido.negocio_id && `Negócio #${pedido.negocio_id}`].filter(Boolean).join(' · ')}
        </p>
        {pedido.obs && <p style={{ fontSize: 14, margin: '8px 0 0', padding: 8, borderRadius: 8, background: 'rgba(245,158,11,.12)' }}>Recado do vendedor: {pedido.obs}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {pasta
            ? <a href={pasta} target="_blank" rel="noreferrer" style={{ ...botao(COR, false), textDecoration: 'none' }}>Abrir a Pasta do cliente ↗</a>
            : <a href="/clientes" target="_blank" rel="noreferrer" style={{ ...botao(COR, false), textDecoration: 'none' }}>Procurar o cliente na Pasta ↗</a>}
        </div>
      </div>

      <div style={caixa}>
        <p style={{ fontWeight: 800, margin: '0 0 8px' }}>O que o vendedor vê hoje</p>
        {!contato && <p style={{ fontSize: 13, color: 'var(--portal-text-muted, #64748b)' }}>Não foi possível montar o contato (quest ou negócio apagado?).</p>}
        {contato && (
          <div style={{ fontSize: 14, display: 'grid', gap: 4 }}>
            {contato.telefones.length
              ? contato.telefones.map((t) => <span key={t.numero}>📞 {t.exibir} <span style={{ color: 'var(--portal-text-muted, #64748b)', fontSize: 12 }}>· {t.nome || ORIGEM[t.origem] || t.origem}{t.celular ? '' : ' · fixo'}</span></span>)
              : <span style={{ color: '#b45309' }}>Nenhum telefone.</span>}
            {contato.endereco ? <span>📍 {contato.endereco}</span> : <span style={{ color: '#b45309' }}>Sem endereço.</span>}
            {contato.locais.map((l) => (
              <a key={`${l.lat},${l.lng}`} href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                🗺️ {l.nome} ↗
              </a>
            ))}
            {!contato.locais.length && <span style={{ color: '#b45309' }}>Sem ponto no mapa.</span>}
          </div>
        )}
      </div>

      <div style={caixa}>
        <p style={{ fontWeight: 800, margin: '0 0 10px' }}>{pedido.status === 'aberto' ? 'Preencher o contato' : 'Corrigir a resposta'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label><span style={rotulo}>Celular / WhatsApp (com DDD)</span><input style={input} value={form.celular} onChange={set('celular')} placeholder="(14) 99999-9999" inputMode="tel" /></label>
          <label><span style={rotulo}>Telefone fixo (com DDD)</span><input style={input} value={form.telefone} onChange={set('telefone')} placeholder="(14) 3351-0000" inputMode="tel" /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><span style={rotulo}>Endereço</span><input style={input} value={form.endereco} onChange={set('endereco')} placeholder="Sítio São José, estrada Piraju–Tejupá km 8, Tejupá" /></label>
        <label style={{ display: 'block', marginTop: 12 }}>
          <span style={rotulo}>Localização: link do Google Maps ou "latitude, longitude"</span>
          <input style={input} value={form.mapa} onChange={set('mapa')} placeholder="https://maps.app.goo.gl/…  ou  -23.2085, -49.3709" />
        </label>
        <label style={{ display: 'block', marginTop: 12 }}><span style={rotulo}>Recado para o vendedor (opcional)</span><textarea style={{ ...input, minHeight: 60 }} value={form.obs} onChange={set('obs')} placeholder="Ex.: falar com o filho, Rogério" /></label>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={salvando} onClick={() => enviar('responder')} style={botao('#16a34a')}>{salvando ? 'Salvando…' : 'Salvar e avisar o vendedor'}</button>
          {pedido.status === 'aberto' && <button type="button" disabled={salvando} onClick={() => enviar('dispensar')} style={botao('#64748b', false)}>Não encontrei</button>}
          {msg && <span style={{ fontSize: 13, fontWeight: 600 }}>{msg}</span>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', marginTop: 10 }}>
          Isto grava no portal (o app do vendedor puxa na hora e vale também para as outras quests do mesmo cliente/trator). Não altera o cadastro na Omie: se o dado é do cliente, corrija lá também pela Pasta.
        </p>
      </div>
    </div>
  )
}

export default function PedidosContatoPage() {
  return <Suspense fallback={null}><Tela /></Suspense>
}
