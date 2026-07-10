'use client'
// Modal de criação de ticket (v1 — tipo genérico).
// A descrição de origem ("quem pediu e por quê") é imutável depois de criada.
import { useState } from 'react'
import { X, Ticket as TicketIcon, Lock, Globe } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { CATEGORIAS_SUGERIDAS, type TicketVisibilidade } from '@/lib/tickets/constantes'
import UserSelect from './UserSelect'

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

export default function FormTicket({ onFechar, onCriado }: Props) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prazo, setPrazo] = useState('')
  const [terceiro, setTerceiro] = useState('')
  const [visibilidade, setVisibilidade] = useState<TicketVisibilidade>('privado')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const criar = async () => {
    setErro('')
    if (!titulo.trim()) { setErro('Informe o título'); return }
    if (!descricao.trim()) { setErro('Descreva o pedido — esse texto fica registrado como origem do ticket'); return }
    if (!responsavelId) { setErro('Escolha o responsável (com quem começa a bola)'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          responsavel_id: responsavelId,
          categoria: categoria.trim(),
          prazo: prazo || null,
          terceiro_envolvido: terceiro.trim(),
          visibilidade,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao criar o ticket'); return }
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
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <TicketIcon size={18} color="#dc2626" /> Novo Ticket
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={rotuloStyle}>Título *</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140}
              placeholder="Ex: Renovação do seguro da frota" style={campoStyle} autoFocus />
          </div>

          <div>
            <label style={rotuloStyle}>O que precisa ser feito, e por quê? *</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
              placeholder="Essa descrição fica registrada como a origem do ticket e não pode ser alterada depois."
              style={{ ...campoStyle, resize: 'vertical' }} />
          </div>

          <div>
            <label style={rotuloStyle}>Responsável (com quem está a bola) *</label>
            <UserSelect value={responsavelId} onChange={setResponsavelId} placeholder="Escolher responsável..." autoFocus={false} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Categoria</label>
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="tickets-categorias"
                placeholder="Opcional" style={campoStyle} />
              <datalist id="tickets-categorias">
                {CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label style={rotuloStyle}>Prazo</label>
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campoStyle} />
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Terceiro envolvido</label>
            <input value={terceiro} onChange={(e) => setTerceiro(e.target.value)} maxLength={140}
              placeholder="Ex: Corretora XYZ (opcional)" style={campoStyle} />
          </div>

          <div>
            <label style={rotuloStyle}>Visibilidade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { valor: 'privado' as const, rotulo: 'Privado (só envolvidos)', icone: <Lock size={14} /> },
                { valor: 'publico' as const, rotulo: 'Visível a todos', icone: <Globe size={14} /> },
              ]).map((op) => (
                <button key={op.valor} type="button" onClick={() => setVisibilidade(op.valor)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: visibilidade === op.valor ? '1.5px solid #dc2626' : '1px solid var(--portal-border, #e5e7eb)',
                    background: visibilidade === op.valor ? 'rgba(220,38,38,.07)' : 'transparent',
                    color: visibilidade === op.valor ? '#dc2626' : 'var(--portal-text-secondary, #555)',
                  }}>
                  {op.icone} {op.rotulo}
                </button>
              ))}
            </div>
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
              {salvando ? 'Criando...' : 'Abrir ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
