'use client'
// SC — detalhe + linha do tempo do Livro de Decisões (Visão A por SC) + ações
// por alçada (o botão só aparece pra quem tem o papel e no status certo).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingCart, User as UserIcon, MessageSquare, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, TIPO_INFO, PAPEL_INFO, acoesDisponiveis, compromissoVencido,
  type SolicitacaoCompra, type Decisao, type Papel, type AcaoWorkflow,
} from '@/lib/decisoes/constantes'

interface UsuarioMin { id: string; nome: string; avatar_url?: string | null }

export default function SCDetalhePage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const { userProfile } = useAuth()
  const { pode, isAdmin } = usePermissoes(userProfile?.id)

  const [sc, setSc] = useState<SolicitacaoCompra | null>(null)
  const [decisoes, setDecisoes] = useState<Decisao[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Painel de ação selecionada + campos.
  const [acaoAberta, setAcaoAberta] = useState<AcaoWorkflow | 'comentar' | null>(null)
  const [just, setJust] = useState('')
  const [novaQtd, setNovaQtd] = useState(1)
  const [aprovado, setAprovado] = useState(true)
  const [prazo, setPrazo] = useState('')
  const [pcNumero, setPcNumero] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroAcao, setErroAcao] = useState('')

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const res = await fetch(`/api/decisoes/${id}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setSc(json.solicitacao)
      setDecisoes(json.decisoes || [])
      setUsuarios(json.usuarios || {})
      setNovaQtd(json.solicitacao?.qtd_atual || 1)
    } catch { setErro('Falha de conexão') } finally { setCarregando(false) }
  }, [id])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  // Papéis do usuário (a partir das permissões granulares).
  const papeis = useMemo<Papel[]>(() => {
    const p: Papel[] = []
    if (isAdmin || pode('decisoes', 'comercial')) p.push('comercial')
    if (isAdmin || pode('decisoes', 'diretoria')) p.push('diretoria_compras')
    if (isAdmin || pode('decisoes', 'financeiro')) p.push('financeiro')
    if (isAdmin || pode('decisoes', 'comprador')) p.push('comprador')
    return p
  }, [pode, isAdmin])

  const acoes = sc ? acoesDisponiveis(sc.status, papeis, isAdmin) : []

  const executar = async (acao: AcaoWorkflow | 'comentar') => {
    setErroAcao(''); setEnviando(true)
    try {
      const corpo: Record<string, unknown> = { acao, justificativa: just }
      if (acao === 'comentar') corpo.texto = just
      if (acao === 'alterar_qtd') corpo.qtd_atual = novaQtd
      if (acao === 'parecer') { corpo.aprovado = aprovado; if (aprovado && prazo) corpo.prazo_compromisso = prazo }
      if (acao === 'emitir_pc') corpo.pc_numero = pcNumero
      const res = await fetch(`/api/decisoes/${id}/acoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo),
      })
      const json = await res.json()
      if (!res.ok) { setErroAcao(json.error || 'Falha'); return }
      setAcaoAberta(null); setJust(''); setPcNumero(''); setPrazo('')
      await carregar()
    } catch { setErroAcao('Falha de conexão') } finally { setEnviando(false) }
  }

  if (carregando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
  if (erro || !sc) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{erro || 'Não encontrado'}</div>

  const info = STATUS_INFO[sc.status]
  const brl = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const dt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 14,
    border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  }
  const podeComentar = isAdmin || papeis.length > 0 || sc.vendedor_id === userProfile?.id

  return (
    <div style={{ padding: 20, maxWidth: 820, margin: '0 auto' }}>
      <button onClick={() => router.push('/decisoes')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Solicitações de Compras
      </button>

      {/* Cabeçalho da SC */}
      <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 14, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>
              <ShoppingCart size={14} /> SC #{sc.numero}
              <span style={{ color: '#7c3aed', background: 'rgba(124,58,237,.1)', padding: '1px 7px', borderRadius: 999 }}>{sc.conta_omie}</span>
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: 'var(--portal-text,#111)', margin: '6px 0 0' }}>{sc.qtd_atual}× {sc.modelo}</h1>
          </div>
          <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: info.cor, background: info.fundo }}>{info.label}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 16 }}>
          <Campo rotulo="Vendedor" valor={usuarios[sc.vendedor_id]?.nome || '—'} icone={<UserIcon size={13} />} />
          <Campo rotulo="Qtd solicitada → atual" valor={`${sc.qtd_solicitada} → ${sc.qtd_atual}`} />
          <Campo rotulo="Preço-alvo (un.)" valor={brl(sc.preco_alvo)} />
          {sc.cliente_codigo && <Campo rotulo="Cliente" valor={sc.cliente_codigo} />}
          {sc.pedido_venda_ref && <Campo rotulo="Pedido de Venda" valor={sc.pedido_venda_ref} />}
          {sc.pc_numero && <Campo rotulo="Pedido de Compra" valor={sc.pc_numero} />}
        </div>
      </div>

      {/* Ações por alçada */}
      {(acoes.length > 0 || podeComentar) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {acoes.map((a) => (
            <button key={a.acao} onClick={() => { setAcaoAberta(acaoAberta === a.acao ? null : a.acao); setErroAcao('') }}
              style={{ padding: '9px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: acaoAberta === a.acao ? '1.5px solid #7c3aed' : '1px solid var(--portal-border,#e5e7eb)',
                background: acaoAberta === a.acao ? 'rgba(124,58,237,.08)' : 'var(--portal-surface,#fff)',
                color: a.acao === 'cancelar' ? '#dc2626' : '#7c3aed' }}>
              {a.label}
            </button>
          ))}
          {podeComentar && (
            <button onClick={() => { setAcaoAberta(acaoAberta === 'comentar' ? null : 'comentar'); setErroAcao('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: acaoAberta === 'comentar' ? '1.5px solid #6b7280' : '1px solid var(--portal-border,#e5e7eb)',
                background: acaoAberta === 'comentar' ? 'rgba(107,114,128,.08)' : 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)' }}>
              <MessageSquare size={14} /> Comentar
            </button>
          )}
        </div>
      )}

      {/* Painel da ação selecionada */}
      {acaoAberta && (
        <div style={{ background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12, padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {acaoAberta === 'alterar_qtd' && (
            <label>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Nova quantidade do lote</div>
              <input type="number" min={1} value={novaQtd} onChange={(e) => setNovaQtd(Math.max(1, Number(e.target.value) || 1))} style={{ ...inputStyle, maxWidth: 140 }} />
            </label>
          )}
          {acaoAberta === 'parecer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAprovado(true)} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: aprovado ? '1.5px solid #059669' : '1px solid var(--portal-border,#e5e7eb)', background: aprovado ? 'rgba(5,150,105,.1)' : 'transparent', color: aprovado ? '#059669' : '#888' }}>Aprovar</button>
                <button onClick={() => setAprovado(false)} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: !aprovado ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)', background: !aprovado ? 'rgba(220,38,38,.1)' : 'transparent', color: !aprovado ? '#dc2626' : '#888' }}>Recusar</button>
              </div>
              {aprovado && (
                <label>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Compromisso de liquidação até <span style={{ fontWeight: 400, color: '#999' }}>(opcional — vira cobrança automática)</span></div>
                  <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
                </label>
              )}
            </div>
          )}
          {acaoAberta === 'emitir_pc' && (
            <label>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Nº do Pedido de Compra (Omie)</div>
              <input value={pcNumero} onChange={(e) => setPcNumero(e.target.value)} placeholder="Ex.: 12345" style={{ ...inputStyle, maxWidth: 220 }} />
            </label>
          )}
          <label>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
              {acaoAberta === 'comentar' ? 'Comentário' : 'Justificativa *'}
            </div>
            <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }}
              placeholder={acaoAberta === 'comentar' ? 'Escreva um comentário...' : 'Toda decisão exige justificativa (fica no livro de decisões).'} />
          </label>
          {erroAcao && <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erroAcao}</div>}
          <button onClick={() => executar(acaoAberta)} disabled={enviando}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 9, border: 'none', background: acaoAberta === 'cancelar' ? '#dc2626' : '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? .7 : 1 }}>
            <Send size={14} /> {enviando ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      )}

      {/* Linha do tempo (Livro de Decisões) */}
      <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', margin: '0 0 12px' }}>Linha do tempo — Livro de Decisões</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {decisoes.map((d, i) => {
          const autor = d.ator_id ? (usuarios[d.ator_id]?.nome || 'alguém') : 'Sistema'
          const venc = d.tipo === 'parecer_financeiro' && compromissoVencido(d.prazo_compromisso, sc.status)
          return (
            <div key={d.id} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#7c3aed', marginTop: 5, flexShrink: 0 }} />
                {i < decisoes.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--portal-border,#e5e7eb)' }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text,#111)' }}>{TIPO_INFO[d.tipo]}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,.1)', padding: '1px 7px', borderRadius: 999 }}>{PAPEL_INFO[d.papel]}</span>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#999)' }}>{autor} · {dt(d.ocorrida_em)}</span>
                </div>
                {d.justificativa && <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary,#444)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.justificativa}</div>}
                {(d.estado_anterior?.qtd != null || d.estado_novo?.qtd != null) && d.tipo === 'qtd_alterada' && (
                  <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', marginTop: 3 }}>Lote: {String(d.estado_anterior?.qtd)} → <b>{String(d.estado_novo?.qtd)}</b></div>
                )}
                {d.documento_ref && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', marginTop: 3 }}>Documento: {d.documento_ref}</div>}
                {d.prazo_compromisso && (
                  <div style={{ fontSize: 12.5, marginTop: 3, fontWeight: 700, color: venc ? '#dc2626' : '#0891b2' }}>
                    Compromisso: liquidar até {new Date(d.prazo_compromisso + 'T12:00:00').toLocaleDateString('pt-BR')}{venc ? ' — VENCIDO' : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Campo({ rotulo, valor, icone }: { rotulo: string; valor: string; icone?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted,#999)', textTransform: 'uppercase', letterSpacing: .3 }}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, color: 'var(--portal-text,#111)', marginTop: 2 }}>{icone}{valor}</div>
    </div>
  )
}
