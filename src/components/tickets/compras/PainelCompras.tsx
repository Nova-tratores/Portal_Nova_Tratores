'use client'
// Painel de ações da SC na tela de detalhe — mostra, para a etapa atual e o
// papel do usuário, o sub-form certo (definir qtd / parecer / emitir PC / ...).
// Substitui os botões de status genéricos quando o ticket é tipo='compras'.
import { useState, useEffect } from 'react'
import { ShoppingCart, AlertTriangle, ArrowRight, CornerUpLeft, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import {
  SC_TRANSICOES, SC_ETAPA_INFO, podeExecutar,
  type ConfigCompras, type PayloadSC, type ScAcao, type ScEtapa, type ScTransicao,
} from '@/lib/tickets/compras'
import type { Ticket } from '@/lib/tickets/constantes'

interface Props {
  ticket: Ticket
  uid: string | undefined
  isAdmin: boolean
  agindo: boolean
  onAcao: (payload: Record<string, unknown>, aposOk?: () => void) => void
}

const ICONE_ACAO: Record<ScAcao, React.ReactNode> = {
  alterar_qtd: <ArrowRight size={14} />,
  aprovar: <CheckCircle2 size={14} />,
  reprovar: <XCircle size={14} />,
  emitir_pc: <CheckCircle2 size={14} />,
  devolver: <CornerUpLeft size={14} />,
  reenviar: <ArrowRight size={14} />,
  cancelar: <Ban size={14} />,
}

const campo: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: 13.5,
  border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)',
  color: 'var(--portal-text,#111)', outline: 'none',
}
const rotulo: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 4, color: 'var(--portal-text-secondary,#555)' }

export default function PainelCompras({ ticket, uid, isAdmin, agindo, onAcao }: Props) {
  const [config, setConfig] = useState<ConfigCompras | null>(null)
  const [sel, setSel] = useState<ScAcao | null>(null)

  // Campos do sub-form ativo
  const payload = (ticket.payload || {}) as PayloadSC
  const [qtd, setQtd] = useState('')
  const [valorUnit, setValorUnit] = useState('')
  const [texto, setTexto] = useState('')
  const [decisao, setDecisao] = useState<'aprovado' | 'ressalva'>('aprovado')
  const [prazo, setPrazo] = useState('')
  const [pedido, setPedido] = useState('')

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await fetch('/api/tickets/compras/config', { headers: await authHeaders() })
        const json = await res.json()
        if (res.ok) setConfig(json.config)
      } catch { /* sem config: só admin age */ }
    }
    carregar()
  }, [])

  const etapa = (ticket.sc_etapa || '') as ScEtapa
  const info = SC_ETAPA_INFO[etapa]
  const transicoes = SC_TRANSICOES[etapa] || []
  const cfg = config || { diretoria_id: null, financeiro_id: null, comprador_id: null, valor_limite_bloqueio: null, qtd_excesso_estoque: null }
  const disponiveis = transicoes.filter((t) =>
    podeExecutar(t, { userId: uid || '', isAdmin }, cfg, ticket.solicitante_id))

  const abrir = (t: ScTransicao) => {
    setSel(t.acao)
    setTexto('')
    setQtd(String(payload.quantidade_aprovada ?? payload.quantidade_solicitada ?? ''))
    setValorUnit(String(payload.valor_unitario ?? payload.preco_alvo ?? ''))
    setPrazo(payload.prazo_compromisso || '')
    setPedido(payload.pedido_omie_numero || '')
    setDecisao('aprovado')
  }

  const enviar = () => {
    if (!sel) return
    const base: Record<string, unknown> = { acao: sel }
    if (sel === 'alterar_qtd') {
      base.quantidade_aprovada = Number(qtd)
      if (valorUnit) base.valor_unitario = Number(valorUnit)
      base.texto = texto.trim()
    } else if (sel === 'aprovar') {
      base.decisao = decisao
      base.texto = texto.trim()
      if (prazo) base.prazo_compromisso = prazo
    } else if (sel === 'emitir_pc') {
      base.pedido_omie_numero = pedido.trim()
      if (texto.trim()) base.texto = texto.trim()
    } else {
      // devolver / reprovar / reenviar / cancelar
      if (texto.trim()) base.texto = texto.trim()
    }
    onAcao(base, () => setSel(null))
  }

  if (SC_ETAPA_INFO[etapa]?.status === 'fechado' || etapa === 'cancelada' || etapa === 'concluida') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
        <ShoppingCart size={15} /> Solicitação {etapa === 'cancelada' ? 'cancelada' : 'concluída'} — trilho encerrado.
      </div>
    )
  }

  const acaoAtual = transicoes.find((t) => t.acao === sel)

  return (
    <div>
      {/* Etapa atual + banner de bloqueio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: payload.bloqueio ? 8 : 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: info?.cor, background: info?.fundo }}>
          <ShoppingCart size={13} /> Etapa: {info?.label}
        </span>
      </div>
      {payload.bloqueio && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: 8, background: 'rgba(217,119,6,.1)', color: '#b45309', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>SC sinalizada — {payload.bloqueio.motivo}. Atenção redobrada nesta aprovação.</span>
        </div>
      )}

      {/* Botões de ação disponíveis para o papel do usuário */}
      {disponiveis.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#999)' }}>
          Aguardando ação de <strong>{info?.label}</strong>. Você acompanha esta SC, mas a bola não está com você.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {disponiveis.map((t) => {
            const destaque = t.acao === 'alterar_qtd' || t.acao === 'aprovar' || t.acao === 'emitir_pc'
            const ativo = sel === t.acao
            return (
              <button key={t.acao} disabled={agindo} onClick={() => (ativo ? setSel(null) : abrir(t))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: ativo ? '1.5px solid #dc2626' : destaque ? 'none' : '1px solid var(--portal-border,#e5e7eb)',
                  background: ativo ? 'rgba(220,38,38,.07)' : destaque ? '#059669' : 'var(--portal-surface,#fff)',
                  color: ativo ? '#dc2626' : destaque ? '#fff' : 'var(--portal-text-secondary,#555)',
                  opacity: agindo ? .6 : 1,
                }}>
                {ICONE_ACAO[t.acao]} {t.rotulo}
              </button>
            )
          })}
        </div>
      )}

      {/* Sub-form da ação selecionada */}
      {sel && acaoAtual && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#f9fafb)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sel === 'alterar_qtd' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={rotulo}>Quantidade aprovada *</label>
                <input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} style={campo} />
              </div>
              <div>
                <label style={rotulo}>Valor unitário (R$)</label>
                <input type="number" min={0} step="0.01" value={valorUnit} onChange={(e) => setValorUnit(e.target.value)} style={campo} />
              </div>
            </div>
          )}
          {sel === 'aprovar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['aprovado', 'ressalva'] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDecisao(d)}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      border: decisao === d ? '1.5px solid #059669' : '1px solid var(--portal-border,#e5e7eb)',
                      background: decisao === d ? 'rgba(5,150,105,.08)' : 'transparent',
                      color: decisao === d ? '#059669' : 'var(--portal-text-secondary,#555)' }}>
                    {d === 'aprovado' ? 'Aprovar' : 'Aprovar com ressalva'}
                  </button>
                ))}
              </div>
              <div>
                <label style={rotulo}>Prazo de compromisso (liquidação)</label>
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campo} />
              </div>
            </div>
          )}
          {sel === 'emitir_pc' && (
            <div>
              <label style={rotulo}>Nº do Pedido de Compra (Omie) *</label>
              <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex: 12345" style={campo} />
            </div>
          )}

          <div>
            <label style={rotulo}>
              {sel === 'alterar_qtd' ? 'Justificativa *'
                : sel === 'aprovar' || sel === 'reprovar' ? 'Parecer *'
                : sel === 'emitir_pc' ? 'Condições finais (opcional)'
                : 'Motivo (opcional)'}
            </label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
              placeholder={acaoAtual.exigeTexto ? 'Fica gravado para sempre na timeline.' : 'Opcional'}
              style={{ ...campo, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setSel(null)} disabled={agindo}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--portal-text-secondary,#555)' }}>
              Cancelar
            </button>
            <button onClick={enviar}
              disabled={agindo
                || (acaoAtual.exigeTexto && !texto.trim())
                || (sel === 'alterar_qtd' && (!qtd || Number(qtd) <= 0))
                || (sel === 'emitir_pc' && !pedido.trim())}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                opacity: agindo || (acaoAtual.exigeTexto && !texto.trim()) || (sel === 'alterar_qtd' && (!qtd || Number(qtd) <= 0)) || (sel === 'emitir_pc' && !pedido.trim()) ? .5 : 1 }}>
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
