'use client'
// Modal "Juntar cards" da fase Gerar Boleto: seleciona 2+ cards do MESMO
// cliente, escolhe qual é o principal e junta — as NFs ficam todas no card
// principal, o valor é somado e o financeiro anexa UM boleto pro grupo todo.
// Os cards juntados somem do kanban (vivem dentro do principal; dá pra desfazer).
import { useEffect, useMemo, useState } from 'react'
import { X, Link2, Check } from 'lucide-react'
import { formatarMoeda } from '@/lib/financeiro/utils'
import { parseValorNum } from '@/lib/financeiro/parcelas'
import { juntarCards, nfsLabel } from '@/lib/financeiro/grupo'

const norm = (s) => String(s || '').trim().toUpperCase()

export default function AgruparCardsModal({ open, cards, onClose, onDone, audit }) {
  const [selIds, setSelIds] = useState([])
  const [paiId, setPaiId] = useState(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (open) { setSelIds([]); setPaiId(null); setSalvando(false) } }, [open])

  const lista = useMemo(() => {
    return [...(cards || [])].sort((a, b) => {
      const ca = norm(a.nom_cliente), cb = norm(b.nom_cliente)
      if (ca !== cb) return ca < cb ? -1 : 1
      return (a.id || 0) - (b.id || 0)
    })
  }, [cards])

  if (!open) return null

  const clienteSel = selIds.length
    ? norm((cards || []).find(c => c.id === selIds[0])?.nom_cliente)
    : null
  const selecionados = (cards || []).filter(c => selIds.includes(c.id))
  const total = selecionados.reduce((s, c) => s + (parseValorNum(c.valor_servico) || 0), 0)

  const toggle = (card) => {
    if (salvando) return
    if (selIds.includes(card.id)) {
      const resto = selIds.filter(id => id !== card.id)
      setSelIds(resto)
      if (paiId === card.id) setPaiId(resto[0] ?? null)
    } else {
      if (clienteSel && norm(card.nom_cliente) !== clienteSel) return
      setSelIds([...selIds, card.id])
      if (!paiId) setPaiId(card.id)
    }
  }

  const confirmar = async () => {
    const pai = selecionados.find(c => c.id === paiId)
    const filhos = selecionados.filter(c => c.id !== paiId)
    if (!pai || filhos.length === 0) return
    if (!window.confirm(
      `Juntar ${filhos.length + 1} cards de ${pai.nom_cliente || 'cliente'} no card #${pai.id}?\n\n` +
      `Valor total: ${formatarMoeda(total)}\n` +
      `Os cards ${filhos.map(f => `#${f.id}`).join(', ')} somem do kanban e passam a viver dentro do #${pai.id} (dá pra desfazer pelo card principal).`
    )) return
    setSalvando(true)
    try {
      await juntarCards(pai, filhos)
      audit?.({
        acao: 'agrupar', entidade_id: String(pai.id),
        entidade_label: `NF #${pai.id} - ${pai.nom_cliente || ''}`,
        detalhes: { juntados: filhos.map(f => `#${f.id}`), valor_total: total },
      })
      onDone?.()
    } catch (e) {
      alert('Erro ao juntar os cards: ' + (e?.message || e))
      setSalvando(false)
    }
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--portal-bg-card)', width: '760px', maxWidth: '100%', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--portal-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 24px', borderBottom: '1px solid var(--portal-border)', flexShrink: 0 }}>
          <Link2 size={18} color="#4338ca" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--portal-text)' }}>Juntar cards num boleto único</div>
            <div style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', marginTop: '2px' }}>
              Marque os cards do MESMO cliente, escolha o principal e confirme. As NFs ficam todas juntas e o financeiro anexa um boleto só.
            </div>
          </div>
          <button onClick={() => !salvando && onClose?.()} title="Fechar"
            style={{ background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px' }}>
          {lista.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--portal-text-secondary)', textAlign: 'center', padding: '30px 0' }}>Nenhum card na fase Gerar Boleto.</p>
          )}
          {lista.map((c) => {
            const marcado = selIds.includes(c.id)
            const bloqueado = !marcado && clienteSel && norm(c.nom_cliente) !== clienteSel
            const nfs = nfsLabel([c])
            return (
              <div key={c.id} onClick={() => !bloqueado && toggle(c)}
                title={bloqueado ? 'Só dá pra juntar cards do mesmo cliente' : ''}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '8px',
                  border: `1.5px solid ${marcado ? '#4338ca' : 'var(--portal-border)'}`, borderRadius: '10px',
                  background: marcado ? 'rgba(67,56,202,0.06)' : 'var(--portal-bg-card)',
                  opacity: bloqueado ? 0.4 : 1, cursor: bloqueado ? 'not-allowed' : 'pointer', transition: '0.15s',
                }}>
                <input type="checkbox" readOnly checked={marcado} disabled={bloqueado}
                  style={{ width: '17px', height: '17px', accentColor: '#4338ca', cursor: 'inherit', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--portal-text)' }}>
                    <span style={{ color: '#9ca3af', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>#{c.id}</span>{' '}
                    {c.nom_cliente?.toUpperCase() || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', marginTop: '2px' }}>
                    {nfs ? `NF ${nfs}` : 'Sem nº de NF'}{c.forma_pagamento ? ` · ${c.forma_pagamento}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#16a34a', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatarMoeda(c.valor_servico)}
                </div>
                {marcado && (
                  <label onClick={(e) => e.stopPropagation()}
                    title="O card principal recebe as NFs, o valor somado e o boleto único"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700,
                      color: paiId === c.id ? '#4338ca' : 'var(--portal-text-secondary)', cursor: 'pointer',
                      border: `1px solid ${paiId === c.id ? '#4338ca' : 'var(--portal-border)'}`,
                      borderRadius: '8px', padding: '5px 9px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                    <input type="radio" checked={paiId === c.id} onChange={() => setPaiId(c.id)}
                      style={{ accentColor: '#4338ca', cursor: 'pointer' }} />
                    Principal
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 24px', borderTop: '1px solid var(--portal-border)', flexShrink: 0, background: 'var(--portal-bg-secondary)' }}>
          <div style={{ flex: 1, fontSize: '13px', color: 'var(--portal-text-secondary)' }}>
            {selIds.length === 0
              ? 'Nenhum card marcado'
              : <>{selIds.length} card{selIds.length > 1 ? 's' : ''} · Total: <b style={{ color: '#16a34a', fontSize: '15px' }}>{formatarMoeda(total)}</b></>}
          </div>
          <button onClick={confirmar} disabled={selIds.length < 2 || !paiId || salvando}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', border: 'none', borderRadius: '10px',
              padding: '12px 22px', fontSize: '14px', fontWeight: 700,
              background: selIds.length < 2 || salvando ? '#9ca3af' : '#4338ca', color: '#fff',
              cursor: selIds.length < 2 || salvando ? 'default' : 'pointer',
            }}>
            <Check size={16} /> {salvando ? 'Juntando…' : `Juntar no card ${paiId ? `#${paiId}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
