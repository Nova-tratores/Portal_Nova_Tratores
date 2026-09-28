'use client'
// Configuração da SC (admin) — pessoas fixas por etapa (uma por etapa) +
// limiares do gatilho de bloqueio (valor / excesso de estoque).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Settings, Save } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import UserSelect from '@/components/tickets/UserSelect'
import type { ConfigCompras } from '@/lib/tickets/compras'

const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4 }
const campo: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', outline: 'none' }
const cartao: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12, padding: 18 }

export default function ComprasConfigPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin, loading } = usePermissoes(userProfile?.id)

  const [diretoria, setDiretoria] = useState('')
  const [financeiro, setFinanceiro] = useState('')
  const [comprador, setComprador] = useState('')
  const [valorLimite, setValorLimite] = useState('')
  const [qtdExcesso, setQtdExcesso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch('/api/tickets/compras/config', { headers: await authHeaders() })
      const json = await res.json()
      if (res.ok) {
        const c: ConfigCompras = json.config
        setDiretoria(c.diretoria_id || '')
        setFinanceiro(c.financeiro_id || '')
        setComprador(c.comprador_id || '')
        setValorLimite(c.valor_limite_bloqueio != null ? String(c.valor_limite_bloqueio) : '')
        setQtdExcesso(c.qtd_excesso_estoque != null ? String(c.qtd_excesso_estoque) : '')
      }
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  if (!loading && userProfile && !isAdmin) return <SemPermissao />

  const salvar = async () => {
    setMsg(''); setErro(''); setSalvando(true)
    try {
      const res = await fetch('/api/tickets/compras/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          diretoria_id: diretoria || null,
          financeiro_id: financeiro || null,
          comprador_id: comprador || null,
          valor_limite_bloqueio: valorLimite || null,
          qtd_excesso_estoque: qtdExcesso || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao salvar'); return }
      setMsg('Configuração salva.')
    } catch {
      setErro('Falha de conexão')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
      <button onClick={() => router.push('/tickets/compras')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
        <ArrowLeft size={15} /> Solicitações de Compras
      </button>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: 'var(--portal-text,#111)', margin: '0 0 4px' }}>
        <Settings size={19} color="#dc2626" /> Configuração das Solicitações de Compras
      </h1>
      <p style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', margin: '0 0 18px' }}>
        Defina quem atua em cada etapa do trilho. Cada pessoa também precisa ter acesso ao módulo Tickets.
      </p>

      {carregando ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cartao}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={rotulo}>Diretoria de Compras</label>
                <UserSelect value={diretoria} onChange={setDiretoria} placeholder="Quem avalia e define a quantidade..." autoFocus={false} />
              </div>
              <div>
                <label style={rotulo}>Financeiro</label>
                <UserSelect value={financeiro} onChange={setFinanceiro} placeholder="Quem dá o parecer..." autoFocus={false} />
              </div>
              <div>
                <label style={rotulo}>Comprador</label>
                <UserSelect value={comprador} onChange={setComprador} placeholder="Quem emite o Pedido de Compra..." autoFocus={false} />
              </div>
            </div>
          </div>

          <div style={cartao}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>
              Gatilho de atenção (opcional)
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', margin: '0 0 12px' }}>
              A SC é sinalizada (não travada) quando ultrapassa qualquer um destes. Deixe em branco para desligar.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={rotulo}>Valor total acima de (R$)</label>
                <input type="number" min={0} step="0.01" value={valorLimite} onChange={(e) => setValorLimite(e.target.value)} placeholder="Sem limite" style={campo} />
              </div>
              <div>
                <label style={rotulo}>Estoque atual acima de</label>
                <input type="number" min={0} value={qtdExcesso} onChange={(e) => setQtdExcesso(e.target.value)} placeholder="Sem limite" style={campo} />
              </div>
            </div>
          </div>

          {erro && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {msg && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(5,150,105,.1)', color: '#059669', fontSize: 13, fontWeight: 600 }}>{msg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={salvar} disabled={salvando}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: salvando ? .6 : 1 }}>
              <Save size={16} /> {salvando ? 'Salvando...' : 'Salvar configuração'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
