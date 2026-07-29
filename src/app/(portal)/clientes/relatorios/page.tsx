'use client'
// Aba "Relatórios" do módulo Clientes: lista as fotos semanais de OS/PV faturados
// sem NF (uma por sexta). Cada semana abre um documento imprimível (Salvar PDF).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ArrowLeft, ChevronRight, AlertTriangle, Calendar } from 'lucide-react'

interface Semana { semana: string; gerado_em: string; total_cards: number; total_valor: number }

const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtData = (iso: string) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export default function RelatoriosClientesPage() {
  const router = useRouter()
  const [lista, setLista] = useState<Semana[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clientes/relatorio-semanal')
      .then(r => r.ok ? r.json() : [])
      .then(d => setLista(Array.isArray(d) ? d : []))
      .catch(() => setLista([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '16px 12px', maxWidth: 820, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
      <button onClick={() => router.push('/clientes')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 18 }}>
        <ArrowLeft size={16} /> Voltar para Clientes
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Relatórios semanais</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>OS/PV faturados sem nota fiscal — uma foto por semana</p>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8', background: '#fff', border: '1px solid #eef0f3', borderRadius: 14 }}>
            <Calendar size={34} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum relatório ainda.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>O primeiro é gerado na próxima sexta-feira de manhã.</div>
          </div>
        ) : (
          lista.map((s) => (
            <button key={s.semana} onClick={() => router.push(`/clientes/relatorios/${s.semana}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: '1px solid #eef0f3', background: '#fff', cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.total_cards > 0 ? '#fef2f2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {s.total_cards > 0 ? <AlertTriangle size={18} color="#dc2626" /> : <FileText size={18} color="#16a34a" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Semana de {fmtData(s.semana)}</div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                  {s.total_cards > 0
                    ? <><b style={{ color: '#dc2626' }}>{s.total_cards}</b> sem NF · R$ {fmtR$(s.total_valor)}</>
                    : 'Tudo em dia — nenhum card sem NF'}
                </div>
              </div>
              <ChevronRight size={18} color="#cbd5e1" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
