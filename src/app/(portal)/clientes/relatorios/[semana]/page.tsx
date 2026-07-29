'use client'
// Documento imprimível do relatório de UMA semana: os OS/PV faturados sem NF,
// agrupados por cliente, com total. Botão imprimir/salvar PDF (@media print some
// com o cabeçalho de ações). Chega por /clientes/relatorios/<YYYY-MM-DD>.
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Item { tipo: 'OS' | 'PV'; numero: string; empresa: string; cliente: string; valor: number; data: string }
interface Relatorio { semana: string; gerado_em: string; total_cards: number; total_valor: number; dados: Item[] }

const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtData = (iso: string) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—') }

export default function RelatorioSemanaPage() {
  const params = useParams()
  const router = useRouter()
  const semana = String(params?.semana || '')
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!semana) return
    fetch(`/api/clientes/relatorio-semanal?semana=${encodeURIComponent(semana)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d) => setRel(d))
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [semana])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontFamily: 'sans-serif' }}>Carregando relatório…</div>
  if (erro || !rel) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontFamily: 'sans-serif' }}>Relatório não encontrado.</div>

  // Agrupar por cliente
  const grupos = new Map<string, Item[]>()
  for (const i of rel.dados || []) {
    const k = i.cliente || 'Sem cliente'
    const arr = grupos.get(k) || []; arr.push(i); grupos.set(k, arr)
  }
  const clientes = [...grupos.entries()].sort((a, b) =>
    b[1].reduce((s, i) => s + i.valor, 0) - a[1].reduce((s, i) => s + i.valor, 0))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4; margin: 12mm; }
        @media print { .rel-actions, aside, nav, header, .fixed { display: none !important; } body { background: #fff !important; } }
      `}} />

      <div className="rel-actions" style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontFamily: 'sans-serif' }}>
        <button onClick={() => router.push('/clientes/relatorios')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
        <button onClick={() => window.print()} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Imprimir / Salvar PDF</button>
        <span style={{ fontSize: 12.5, color: '#64748b' }}>Semana de {fmtData(rel.semana)} · {rel.total_cards} card(s) · R$ {fmtR$(rel.total_valor)}</span>
      </div>

      <div style={{ maxWidth: '210mm', margin: '0 auto', padding: 20, fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#0f172a' }}>
        {/* Cabeçalho */}
        <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 14, marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>Faturamentos sem Nota Fiscal</h1>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            Nova Tratores · Relatório semanal — semana de <b>{fmtData(rel.semana)}</b>
            <span style={{ marginLeft: 8, color: '#94a3b8' }}>(gerado em {fmtData(rel.gerado_em)})</span>
          </div>
        </div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Cards sem NF</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: rel.total_cards > 0 ? '#dc2626' : '#16a34a' }}>{rel.total_cards}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Valor total</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>R$ {fmtR$(rel.total_valor)}</div>
          </div>
        </div>

        {rel.total_cards === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#16a34a', fontSize: 15, fontWeight: 700, border: '1px dashed #bbf7d0', borderRadius: 12, background: '#f0fdf4' }}>
            ✓ Nenhum faturamento sem nota nesta semana — tudo em dia!
          </div>
        ) : (
          clientes.map(([cliente, itens]) => {
            const totalCli = itens.reduce((s, i) => s + i.valor, 0)
            return (
              <div key={cliente} style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>{cliente}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>R$ {fmtR$(totalCli)}</span>
                </div>
                {itens.map((i, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '54px 1fr auto auto', gap: 10, alignItems: 'center', padding: '9px 14px', borderTop: idx ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                    <span style={{ fontWeight: 800, color: i.tipo === 'OS' ? '#0369a1' : '#b45309' }}>{i.tipo}</span>
                    <span style={{ fontWeight: 600 }}>#{i.numero}<span style={{ color: '#94a3b8', fontWeight: 400 }}> · {i.empresa}</span></span>
                    <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtData(i.data)}</span>
                    <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>R$ {fmtR$(i.valor)}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}

        <div style={{ marginTop: 20, paddingTop: 10, borderTop: '2px solid #f1f5f9', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, textAlign: 'center' }}>
          Nova Tratores · Relatório gerado automaticamente
        </div>
      </div>
    </>
  )
}
