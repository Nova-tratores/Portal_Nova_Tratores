'use client'
// Modal de abertura de Solicitação de Compras (tipo='compras'). O vendedor
// preenche os campos estruturados; a bola vai direto para a Diretoria.
// A descrição/origem ("por que precisa comprar") é imutável depois de criada.
import { useState } from 'react'
import { X, ShoppingCart } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Props {
  onFechar: () => void
  onCriado: (ticketId: string) => void
}

const campoStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
  color: 'var(--portal-text, #111)', outline: 'none',
}
const rotuloStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6,
  color: 'var(--portal-text-secondary, #555)', textTransform: 'uppercase', letterSpacing: .4,
}

export default function FormSC({ onFechar, onCriado }: Props) {
  const [produto, setProduto] = useState('')
  const [produtoCodigo, setProdutoCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [precoAlvo, setPrecoAlvo] = useState('')
  const [clienteDestino, setClienteDestino] = useState('')
  const [pvNumero, setPvNumero] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const criar = async () => {
    setErro('')
    if (!produto.trim()) { setErro('Informe o produto'); return }
    if (!quantidade || Number(quantidade) <= 0) { setErro('Informe a quantidade solicitada'); return }
    if (!clienteDestino.trim()) { setErro('Informe o cliente destino'); return }
    if (!pvNumero.trim()) { setErro('Informe o nº do PV'); return }
    if (!descricao.trim()) { setErro('Descreva a solicitação — esse texto fica registrado como origem'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          tipo: 'compras',
          produto: produto.trim(),
          produto_codigo: produtoCodigo.trim() || undefined,
          quantidade_solicitada: Number(quantidade),
          preco_alvo: precoAlvo ? Number(precoAlvo) : undefined,
          cliente_destino: clienteDestino.trim(),
          pv_numero: pvNumero.trim(),
          descricao: descricao.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao abrir a SC'); return }
      onCriado(json.ticket.id)
    } catch {
      setErro('Falha de conexão — tente novamente')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <ShoppingCart size={18} color="#dc2626" /> Nova Solicitação de Compras
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={rotuloStyle}>Produto *</label>
            <input value={produto} onChange={(e) => setProduto(e.target.value)} maxLength={160}
              placeholder="Ex: Trator Mahindra 6075" style={campoStyle} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Código do produto</label>
              <input value={produtoCodigo} onChange={(e) => setProdutoCodigo(e.target.value)}
                placeholder="SKU (opcional)" style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Quantidade *</label>
              <input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 1" style={campoStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Preço-alvo (unitário)</label>
              <input type="number" min={0} step="0.01" value={precoAlvo} onChange={(e) => setPrecoAlvo(e.target.value)}
                placeholder="R$ (opcional)" style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Nº do PV *</label>
              <input value={pvNumero} onChange={(e) => setPvNumero(e.target.value)}
                placeholder="Pedido de venda" style={campoStyle} />
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Cliente destino *</label>
            <input value={clienteDestino} onChange={(e) => setClienteDestino(e.target.value)} maxLength={160}
              placeholder="Cliente vinculado à compra" style={campoStyle} />
          </div>

          <div>
            <label style={rotuloStyle}>Justificativa / origem *</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
              placeholder="Por que esta compra é necessária? Esse texto fica registrado como origem e não pode ser alterado."
              style={{ ...campoStyle, resize: 'vertical' }} />
          </div>

          {erro && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onFechar} disabled={salvando}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--portal-text-secondary, #555)' }}>
              Cancelar
            </button>
            <button onClick={criar} disabled={salvando}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: salvando ? .6 : 1 }}>
              {salvando ? 'Abrindo...' : 'Abrir solicitação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
