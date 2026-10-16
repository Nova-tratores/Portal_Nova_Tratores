'use client'
// Janela Mecânicos → Centro do Pós-Vendas (José, 16/10/2026): abas Painel dos técnicos,
// Faturamento ao vivo e a tela antiga (técnicos, ocorrências, GPS).
import PainelTecnicos from './PainelTecnicos'
import FaturamentoVivo from './FaturamentoVivo'

export type AbaCPV = 'painel' | 'vivo' | 'tecnicos'

export default function CentroPosVendas({ aba, onAba }: { aba: AbaCPV; onAba: (a: AbaCPV) => void }) {
  const abas: [AbaCPV, string, string][] = [
    ['painel', 'Painel dos técnicos', 'fa-chart-column'],
    ['vivo', 'Faturamento ao vivo', 'fa-signal'],
    ['tecnicos', 'Técnicos e ocorrências', 'fa-users'],
  ]
  return (
    <div style={{ padding: 'clamp(14px, 2.5vw, 28px) clamp(12px, 2vw, 24px)', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #0891b2, #0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fefefe', fontSize: 17, boxShadow: '0 6px 16px rgba(3,105,161,.3)' }}>
          <i className="fas fa-gauge-high" />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 900, color: 'var(--portal-text, #0f172a)', margin: 0 }}>Pós-Vendas</h1>
          <p style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', margin: 0 }}>Horas, km e faturamento dos técnicos</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, background: 'var(--portal-bg-secondary, #f1f5f9)', borderRadius: 12, padding: 4, flexWrap: 'wrap' }}>
          {abas.map(([id, rot, ic]) => (
            <button key={id} type="button" onClick={() => onAba(id)}
              style={{ border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7,
                background: aba === id ? 'var(--portal-bg-card, #fefefe)' : 'transparent', color: aba === id ? '#0369a1' : 'var(--portal-text-muted, #64748b)', boxShadow: aba === id ? '0 1px 4px rgba(15,23,42,.12)' : 'none' }}>
              <i className={`fas ${ic}`} /> {rot}
            </button>
          ))}
        </div>
      </div>
      {aba === 'painel' ? <PainelTecnicos /> : <FaturamentoVivo />}
    </div>
  )
}
