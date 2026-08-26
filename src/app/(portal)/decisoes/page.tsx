'use client'
// Solicitações de Compras — visões: Fila (a bola está comigo, por papel) ·
// Minhas (as que eu abri) · Todas (transparência mútua).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Inbox, Send, List, Plus, RefreshCw, User as UserIcon, Clock, ShoppingCart, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, diasParado, type SolicitacaoCompra, type UsuarioMin,
} from '@/lib/decisoes/constantes'

type Visao = 'fila' | 'minhas' | 'todas'
const VISOES = new Set<Visao>(['fila', 'minhas', 'todas'])

function Badge({ status }: { status: SolicitacaoCompra['status'] }) {
  const i = STATUS_INFO[status]
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: i.cor, background: i.fundo, whiteSpace: 'nowrap' }}>
      {i.label}
    </span>
  )
}

function FormNovaSC({ onFechar, onCriada }: { onFechar: () => void; onCriada: (id: string) => void }) {
  const [conta, setConta] = useState('NOVA')
  const [modelo, setModelo] = useState('')
  const [qtd, setQtd] = useState(1)
  const [precoAlvo, setPrecoAlvo] = useState('')
  const [cliente, setCliente] = useState('')
  const [pv, setPv] = useState('')
  const [just, setJust] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const enviar = async () => {
    setErro(''); setSalvando(true)
    try {
      const res = await fetch('/api/decisoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          conta_omie: conta, modelo, qtd_solicitada: qtd,
          preco_alvo: precoAlvo || null, cliente_codigo: cliente, pedido_venda_ref: pv, justificativa: just,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao criar'); return }
      onCriada(json.solicitacao.id)
    } catch { setErro('Falha de conexão') } finally { setSalvando(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 14,
    border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
            <ShoppingCart size={18} /> Nova Solicitação de Compra
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: '0 0 120px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Conta</div>
              <select value={conta} onChange={(e) => setConta(e.target.value)} style={inputStyle}>
                <option value="NOVA">NOVA</option>
                <option value="CASTRO">CASTRO</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Modelo / descrição da máquina *</div>
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: Trator Mahindra 6075" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: '0 0 100px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Qtd *</div>
              <input type="number" min={1} value={qtd} onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Preço-alvo (un.)</div>
              <input type="number" value={precoAlvo} onChange={(e) => setPrecoAlvo(e.target.value)} placeholder="opcional" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Cliente (código)</div>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="opcional" style={inputStyle} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Pedido de Venda (PV)</div>
              <input value={pv} onChange={(e) => setPv(e.target.value)} placeholder="opcional" style={inputStyle} />
            </label>
          </div>
          <label>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }}>Justificativa * <span style={{ fontWeight: 400, color: '#999' }}>(fica registrada no livro de decisões)</span></div>
            <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={3}
              placeholder="Por que esta compra? Cliente firme, expectativa de giro, promessa de prazo..."
              style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
          {erro && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          <button onClick={enviar} disabled={salvando}
            style={{ padding: '11px 16px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: salvando ? 'default' : 'pointer', opacity: salvando ? .7 : 1 }}>
            {salvando ? 'Enviando...' : 'Abrir SC e enviar à diretoria'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DecisoesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userProfile } = useAuth()
  const { pode, isAdmin } = usePermissoes(userProfile?.id)

  const abaParam = searchParams.get('aba') as Visao | null
  const visao: Visao = abaParam && VISOES.has(abaParam) ? abaParam : 'fila'

  const [scs, setScs] = useState<SolicitacaoCompra[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [contadores, setContadores] = useState<Record<Visao, number> | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [encerradas, setEncerradas] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)

  const podeAbrir = isAdmin || pode('decisoes', 'comercial')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const res = await fetch(`/api/decisoes?visao=${visao}${encerradas ? '&encerradas=1' : ''}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); setScs([]); return }
      setScs(json.solicitacoes || [])
      setUsuarios(json.usuarios || {})
      if (json.contadores) setContadores(json.contadores)
    } catch { setErro('Falha de conexão') } finally { setCarregando(false) }
  }, [visao, encerradas])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const abas: { id: Visao; label: string; icone: React.ReactNode }[] = [
    { id: 'fila', label: 'Minha fila', icone: <Inbox size={15} /> },
    { id: 'minhas', label: 'Minhas SCs', icone: <Send size={15} /> },
    { id: 'todas', label: 'Todas', icone: <List size={15} /> },
  ]

  const brl = (v: number | null) => v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const vazioMsg = useMemo(() => ({
    fila: 'Nada na sua fila — nenhuma SC aguardando sua ação.',
    minhas: 'Você ainda não abriu nenhuma Solicitação de Compra.',
    todas: 'Nenhuma Solicitação de Compra em aberto.',
  }[visao]), [visao])

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {abas.map((a) => {
            const qtd = contadores?.[a.id]
            const ativo = visao === a.id
            return (
              <button key={a.id} onClick={() => router.push(`/decisoes?aba=${a.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: ativo ? '1.5px solid #7c3aed' : '1px solid var(--portal-border,#e5e7eb)',
                  background: ativo ? 'rgba(124,58,237,.07)' : 'var(--portal-surface,#fff)',
                  color: ativo ? '#7c3aed' : 'var(--portal-text-secondary,#555)',
                }}>
                {a.icone} {a.label}
                {typeof qtd === 'number' && qtd > 0 && (
                  <span style={{ minWidth: 18, padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: ativo ? '#7c3aed' : 'var(--portal-bg,#f3f4f6)', color: ativo ? '#fff' : 'var(--portal-text-muted,#888)' }}>{qtd}</span>
                )}
              </button>
            )
          })}
        </div>
        {podeAbrir && (
          <button onClick={() => setModalNovo(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Nova SC
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
          <input type="checkbox" checked={encerradas} onChange={(e) => setEncerradas(e.target.checked)} /> Incluir encerradas
        </label>
        <button onClick={carregar} title="Atualizar" style={{ display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', marginLeft: 'auto' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>Carregando...</div>
      ) : scs.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)' }}>
          <ShoppingCart size={32} style={{ opacity: .35, marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{vazioMsg}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scs.map((sc) => {
            const dias = diasParado(sc.ultima_atividade_em)
            const vend = usuarios[sc.vendedor_id]
            return (
              <div key={sc.id} role="button" tabIndex={0}
                onClick={() => router.push(`/decisoes/${sc.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/decisoes/${sc.id}`) }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', width: '100%' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', flexShrink: 0, width: 46 }}>#{sc.numero}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text,#111)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sc.qtd_atual}× {sc.modelo}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,.1)', padding: '1px 7px', borderRadius: 999 }}>{sc.conta_omie}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, fontSize: 12, color: 'var(--portal-text-muted,#888)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={12} /> {vend?.nome || '—'}</span>
                    {sc.preco_alvo != null && <span>alvo {brl(sc.preco_alvo)}</span>}
                    {sc.pedido_venda_ref && <span>PV {sc.pedido_venda_ref}</span>}
                    {sc.pc_numero && <span>PC {sc.pc_numero}</span>}
                  </div>
                </div>
                <span title="Dias sem movimento" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, flexShrink: 0, color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)' }}>
                  <Clock size={12} /> {dias === 0 ? 'hoje' : `${dias}d`}
                </span>
                <Badge status={sc.status} />
              </div>
            )
          })}
        </div>
      )}

      {modalNovo && <FormNovaSC onFechar={() => setModalNovo(false)} onCriada={(id) => { setModalNovo(false); router.push(`/decisoes/${id}`) }} />}
    </div>
  )
}

export default function DecisoesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>}>
      <DecisoesPageInner />
    </Suspense>
  )
}
