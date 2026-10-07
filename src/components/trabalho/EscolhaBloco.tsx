'use client'
// CENTRAL DE TRABALHO — quem recebe um ticket escolhe em qual BLOCO ele vai
// (um dos seus) e se fica privado. Sem bloco nenhum: atalho pra criar ali mesmo.
// Usado na confirmação do ticket (PainelDoDia) e em "Pra organizar" (Quadros).
import { useEffect, useState } from 'react'
import { Plus, Lock, Users } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { QuadroResumo } from '@/lib/tickets/quadros'
import type { TicketVisibilidade } from '@/lib/tickets/constantes'
import FormQuadro from '@/components/tickets/quadros/FormQuadro'

export interface EscolhaBlocoValor { quadroId: string | null; visibilidade: TicketVisibilidade }

// Cache entre aberturas (o modal do aceite abre um ticket atrás do outro).
let cacheBlocos: QuadroResumo[] | null = null

export async function carregarMeusBlocos(forcar = false): Promise<QuadroResumo[]> {
  if (cacheBlocos && !forcar) return cacheBlocos
  const res = await fetch('/api/tickets/quadros', { headers: await authHeaders() })
  const json = await res.json().catch(() => ({}))
  cacheBlocos = ((json.quadros || []) as QuadroResumo[]).filter((q) => q.meu && q.pode_trabalhar)
  return cacheBlocos
}

export default function EscolhaBloco({ valor, onChange }: {
  valor: EscolhaBlocoValor
  onChange: (v: EscolhaBlocoValor) => void
}) {
  const [blocos, setBlocos] = useState<QuadroResumo[] | null>(cacheBlocos)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarMeusBlocos(true).then((b) => { if (vivo) setBlocos(b) }).catch(() => { if (vivo) setBlocos([]) })
    return () => { vivo = false }
  }, [])

  const chip = (ativo: boolean, cor?: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: ativo ? `2px solid ${cor || '#dc2626'}` : '1px solid var(--portal-border,#e5e7eb)',
    background: ativo ? (cor ? `${cor}1f` : 'rgba(220,38,38,.08)') : 'var(--portal-bg-card,#fff)',
    color: 'var(--portal-text,#111)',
  })
  const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#888)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: .4 }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <span style={rotulo}>Em qual bloco vai?</span>
        {blocos === null ? (
          <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Carregando seus blocos...</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {blocos.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', alignSelf: 'center' }}>Você ainda não tem nenhum bloco.</span>
            )}
            {blocos.map((b) => (
              <button key={b.id} type="button" onClick={() => onChange({ ...valor, quadroId: valor.quadroId === b.id ? null : b.id })}
                style={chip(valor.quadroId === b.id, b.cor)}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: b.cor, flex: 'none' }} /> {b.nome}
              </button>
            ))}
            <button type="button" onClick={() => setCriando(true)} style={{ ...chip(false), borderStyle: 'dashed', color: '#dc2626' }}>
              <Plus size={14} /> {blocos.length === 0 ? 'Criar meu primeiro bloco' : 'Novo bloco'}
            </button>
          </div>
        )}
      </div>

      <div>
        <span style={rotulo}>Quem vê este ticket?</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => onChange({ ...valor, visibilidade: 'privado' })} style={chip(valor.visibilidade === 'privado')}>
            <Lock size={14} /> Privado
          </button>
          <button type="button" onClick={() => onChange({ ...valor, visibilidade: 'publico' })} style={chip(valor.visibilidade === 'publico')}>
            <Users size={14} /> {valor.quadroId ? 'Compartilhado com o bloco' : 'Visível a todos'}
          </button>
        </div>
        <small style={{ display: 'block', marginTop: 6, color: 'var(--portal-text-muted,#888)', fontSize: 12 }}>
          {valor.visibilidade === 'privado'
            ? 'Só você, quem pediu e quem estiver no ticket. Quem pediu sempre acompanha o dia e a situação.'
            : valor.quadroId ? 'Quem participa do bloco também vê.' : 'Qualquer pessoa da Central de Trabalho vê.'}
        </small>
      </div>

      {criando && (
        <FormQuadro onFechar={() => setCriando(false)} onSalvo={async (q) => {
          setCriando(false)
          const lista = await carregarMeusBlocos(true).catch(() => [])
          setBlocos(lista)
          onChange({ ...valor, quadroId: q.id })
        }} />
      )}
    </div>
  )
}
