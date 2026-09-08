'use client'
// Bloco "NFs agrupadas" no modal do card PRINCIPAL: lista os cards juntados
// (NFs, valor original, anexos) e permite remover um do grupo (desfazer —
// o card volta pro kanban em Gerar Boleto e o valor sai do total).
import { useState } from 'react'
import { Link2, Eye, X } from 'lucide-react'
import { formatarMoeda } from '@/lib/financeiro/utils'
import { nfsLabel, removerDoGrupo } from '@/lib/financeiro/grupo'

export default function GrupoDoCardBox({ card, onChanged, audit }) {
  const [removendo, setRemovendo] = useState(null)
  const filhos = card?.grupo_filhos || []
  if (!filhos.length) return null

  const remover = async (filho) => {
    if (!window.confirm(`Remover o card #${filho.id} deste grupo?\n\nEle volta pro kanban em Gerar Boleto com o valor original (${formatarMoeda(filho.grupo_valor_original)}), que sai do total deste card.`)) return
    setRemovendo(filho.id)
    try {
      await removerDoGrupo(filho)
      audit?.({
        acao: 'desagrupar', entidade_id: String(card.id),
        entidade_label: `NF #${card.id} - ${card.nom_cliente || ''}`,
        detalhes: { removido: `#${filho.id}`, valor_devolvido: filho.grupo_valor_original },
      })
      onChanged?.()
    } catch (e) {
      alert('Erro ao remover do grupo: ' + (e?.message || e))
    } finally { setRemovendo(null) }
  }

  const anexosDe = (f) => [
    ...String(f.anexo_nf_servico || '').split(',').map(u => u.trim()).filter(Boolean).map(u => ({ label: 'NF Serviço', url: u })),
    ...String(f.anexo_nf_peca || '').split(',').map(u => u.trim()).filter(Boolean).map(u => ({ label: 'NF Peça', url: u })),
  ]

  return (
    <div style={{ marginTop: '20px', background: 'rgba(67,56,202,0.04)', border: '1.5px solid #c7d2fe', borderRadius: '16px', padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Link2 size={16} color="#4338ca" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#4338ca', letterSpacing: '1px', textTransform: 'uppercase' }}>
          NFs agrupadas neste card ({filhos.length + 1} no total)
        </span>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--portal-text-secondary)', margin: '0 0 14px' }}>
        O valor total e o boleto deste card valem para TODAS as NFs abaixo (as dele + as agrupadas).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filhos.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--portal-text)' }}>
                <span style={{ color: '#9ca3af', fontWeight: 500 }}>#{f.id}</span>{' '}
                {nfsLabel([f]) ? `NF ${nfsLabel([f])}` : 'Sem nº de NF'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--portal-text-secondary)', marginTop: '2px' }}>
                Valor original: <b style={{ color: '#16a34a' }}>{formatarMoeda(f.grupo_valor_original)}</b>
              </div>
            </div>
            {anexosDe(f).map((a, i) => (
              <button key={i} onClick={() => window.open(a.url, '_blank')} title={`Ver ${a.label} do card #${f.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#2563eb', fontSize: '11.5px', fontWeight: 600, flexShrink: 0 }}>
                <Eye size={13} /> {a.label}
              </button>
            ))}
            <button onClick={() => remover(f)} disabled={removendo === f.id} title="Remover do grupo (o card volta pro kanban)"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 10px', cursor: removendo === f.id ? 'wait' : 'pointer', color: '#dc2626', fontSize: '11.5px', fontWeight: 600, flexShrink: 0, opacity: removendo === f.id ? 0.6 : 1 }}>
              <X size={13} /> {removendo === f.id ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
