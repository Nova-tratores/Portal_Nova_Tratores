'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { formatarMoeda, formatarDataBR } from '@/lib/financeiro/utils'
import {
  TrendingUp, AlertTriangle,
  CheckCircle, Clock, FileText, Printer,
  ZoomIn, ZoomOut, Search, X
} from 'lucide-react'

function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
        Relatorio NF <br />
        <span style={{ fontSize: '28px', fontWeight: '400' }}>Nova Tratores</span>
      </h1>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid #e2e8f0',
      borderRadius: '20px',
      padding: '28px 30px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      minWidth: 0,
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ background: color + '18', borderRadius: '10px', padding: '8px', display: 'flex' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <span style={{ fontSize: '30px', color: '#1a1a1a', letterSpacing: '-1px' }}>{value}</span>
      {sub && <span style={{ fontSize: '12px', color: '#9e9e9e' }}>{sub}</span>}
    </div>
  )
}

function StatusBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', color: '#616161', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#9e9e9e' }}>{count} ({pct}%)</span>
      </div>
      <div style={{ background: '#f5f5f5', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
        <div style={{ background: color, width: pct + '%', height: '100%', borderRadius: '6px', transition: '0.6s ease' }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [boletosRelatorio, setBoletosRelatorio] = useState([])
  const [dadosCompletos, setDadosCompletos] = useState([])
  const [zoom, setZoom] = useState(100)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const router = useRouter()

  const handleImprimir = () => { window.print() }

  const STATUS_LABELS_FILTER = {
    gerar_boleto: 'Gerar Boleto',
    enviar_cliente: 'Enviar ao Cliente',
    aguardando_vencimento: 'Aguard. Vencimento',
    pago: 'Pago',
    vencido: 'Vencido',
    concluido: 'Concluido',
  }

  useEffect(() => {
    let filtrado = [...dadosCompletos]
    if (filtroTexto.trim()) {
      const txt = filtroTexto.toLowerCase()
      filtrado = filtrado.filter(b =>
        (b.tarefa || '').toLowerCase().includes(txt) ||
        (b.setor || '').toLowerCase().includes(txt) ||
        (b.forma_pagamento || '').toLowerCase().includes(txt) ||
        String(b.id).includes(txt)
      )
    }
    if (filtroStatus !== 'todos') {
      filtrado = filtrado.filter(b => b.status === filtroStatus)
    }
    if (filtroDataInicio) {
      filtrado = filtrado.filter(b => b.vencimento_boleto && b.vencimento_boleto >= filtroDataInicio)
    }
    if (filtroDataFim) {
      filtrado = filtrado.filter(b => b.vencimento_boleto && b.vencimento_boleto <= filtroDataFim)
    }
    setBoletosRelatorio(filtrado)
  }, [filtroTexto, filtroStatus, filtroDataInicio, filtroDataFim, dadosCompletos])

  const limparFiltros = () => {
    setFiltroTexto('')
    setFiltroStatus('todos')
    setFiltroDataInicio('')
    setFiltroDataFim('')
  }

  const temFiltroAtivo = filtroTexto || filtroStatus !== 'todos' || filtroDataInicio || filtroDataFim

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return router.push('/login')

        const { data: boletos, error: errBoletos } = await supabase
          .from('Chamado_NF')
          .select('id, status, valor_servico, vencimento_boleto, forma_pagamento, tarefa, setor')

        if (errBoletos) throw new Error('Erro ao carregar boletos: ' + errBoletos.message)

        const boletosArr = boletos || []

        const totalBoletos = boletosArr.length
        const boletosEmAberto = boletosArr.filter(b => !['concluido'].includes(b.status)).length
        const boletosAtrasados = boletosArr.filter(b => b.status === 'vencido').length
        const boletosConfirmados = boletosArr.filter(b => ['pago', 'concluido'].includes(b.status)).length
        const totalFaturado = boletosArr
          .filter(b => ['pago', 'concluido'].includes(b.status))
          .reduce((acc, b) => acc + (parseFloat(b.valor_servico) || 0), 0)

        const statusCount = {}
        boletosArr.forEach(b => {
          statusCount[b.status] = (statusCount[b.status] || 0) + 1
        })

        const relatorio = boletosArr
          .filter(b => b.status !== 'pago')
          .sort((a, b) => {
            const order = ['vencido', 'gerar_boleto', 'enviar_cliente', 'aguardando_vencimento', 'concluido']
            return order.indexOf(a.status) - order.indexOf(b.status)
          })
        setBoletosRelatorio(relatorio)
        setDadosCompletos(relatorio)

        setKpis({
          totalBoletos,
          boletosEmAberto,
          boletosAtrasados,
          boletosConfirmados,
          totalFaturado,
          statusCount,
        })

        setLoading(false)
      } catch (e) {
        console.error(e)
        setErro(e.message || 'Erro desconhecido ao carregar o relatorio.')
        setLoading(false)
      }
    }
    fetchData()
  }, [router])

  if (loading) return <LoadingScreen />

  if (erro) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ color: '#ef4444', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center', maxWidth: '600px' }}>{erro}</h1>
      <button onClick={() => window.location.reload()} style={{ color: '#fff', background: 'transparent', border: '0.5px solid #fff', padding: '10px 24px', fontFamily: 'Montserrat', fontSize: '12px', letterSpacing: '2px', cursor: 'pointer' }}>TENTAR NOVAMENTE</button>
    </div>
  )

  const STATUS_LABELS = {
    gerar_boleto: 'Gerar Boleto',
    enviar_cliente: 'Enviar ao Cliente',
    aguardando_vencimento: 'Aguard. Vencimento',
    pago: 'Pago',
    vencido: 'Vencido',
    concluido: 'Concluido',
  }
  const STATUS_COLORS = {
    gerar_boleto: '#f59e0b',
    enviar_cliente: '#3b82f6',
    aguardando_vencimento: '#8b5cf6',
    pago: '#10b981',
    vencido: '#ef4444',
    concluido: '#6b7280',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav>
        <button
          onClick={handleImprimir}
          className="no-print"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}
        >
          <Printer size={14} />
          Imprimir
        </button>
      </FinanceiroNav>

      <main style={{ padding: '24px 32px' }}>

        {/* KPI ROW — Boletos / Chamado_NF */}
        <section className="no-print" style={{ marginBottom: '40px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#bbb', marginBottom: '16px' }}>BOLETOS / FATURAMENTO</p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <KpiCard icon={FileText} label="Total de Processos" value={kpis.totalBoletos} sub="todos os status" color="#6366f1" />
            <KpiCard icon={Clock} label="Em Aberto" value={kpis.boletosEmAberto} sub="aguardando conclusao" color="#f59e0b" />
            <KpiCard icon={AlertTriangle} label="Em Atraso" value={kpis.boletosAtrasados} sub="status vencido" color="#ef4444" />
            <KpiCard icon={CheckCircle} label="Confirmados / Pagos" value={kpis.boletosConfirmados} sub="pago + concluido" color="#10b981" />
            <KpiCard icon={TrendingUp} label="Total Faturado" value={formatarMoeda(kpis.totalFaturado)} sub="processos pago/concluido" color="#0ea5e9" />
          </div>
        </section>

        {/* FUNIL DE STATUS */}
        <div className="no-print" style={{ maxWidth: '500px', marginBottom: '40px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', border: '0.5px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <p style={{ margin: '0 0 24px', fontSize: '11px', letterSpacing: '1.5px', color: '#9e9e9e' }}>FUNIL DE STATUS</p>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <StatusBar
                key={key}
                label={label}
                count={kpis.statusCount[key] || 0}
                total={kpis.totalBoletos}
                color={STATUS_COLORS[key]}
              />
            ))}
          </div>
        </div>

        {/* FILTROS E ZOOM */}
        <section className="no-print" style={{ marginBottom: '30px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', border: '0.5px solid #e2e8f0', padding: '24px 30px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '11px', letterSpacing: '1.5px', color: '#9e9e9e' }}>FILTROS E VISUALIZACAO</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setZoom(z => Math.max(50, z - 10))} style={{ background: '#f5f5f5', border: 'none', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomOut size={16} color="#666" /></button>
                <span style={{ fontSize: '12px', color: '#666', minWidth: '40px', textAlign: 'center' }}>{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(150, z + 10))} style={{ background: '#f5f5f5', border: 'none', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomIn size={16} color="#666" /></button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: '200px' }}>
                <label style={{ fontSize: '10px', letterSpacing: '1px', color: '#9e9e9e', display: 'block', marginBottom: '6px' }}>PESQUISAR</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="#bbb" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={filtroTexto}
                    onChange={e => setFiltroTexto(e.target.value)}
                    placeholder="Tarefa, setor, forma de pagamento..."
                    style={{ width: '100%', padding: '10px 12px 10px 34px', border: '0.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ minWidth: '160px' }}>
                <label style={{ fontSize: '10px', letterSpacing: '1px', color: '#9e9e9e', display: 'block', marginBottom: '6px' }}>STATUS</label>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontFamily: 'Montserrat', outline: 'none', background: '#fff', cursor: 'pointer' }}>
                  <option value="todos">Todos</option>
                  {Object.entries(STATUS_LABELS_FILTER).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: '140px' }}>
                <label style={{ fontSize: '10px', letterSpacing: '1px', color: '#9e9e9e', display: 'block', marginBottom: '6px' }}>VENCIMENTO DE</label>
                <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ minWidth: '140px' }}>
                <label style={{ fontSize: '10px', letterSpacing: '1px', color: '#9e9e9e', display: 'block', marginBottom: '6px' }}>VENCIMENTO ATE</label>
                <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontFamily: 'Montserrat', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {temFiltroAtivo && (
                <button onClick={limparFiltros} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef444415', color: '#ef4444', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontFamily: 'Montserrat', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                  <X size={14} /> Limpar
                </button>
              )}
            </div>
            {temFiltroAtivo && (
              <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#9e9e9e' }}>{boletosRelatorio.length} registro(s) encontrado(s)</p>
            )}
          </div>
        </section>

        {/* TABELA NA TELA */}
        <section className="no-print" style={{ marginBottom: '40px', transform: `scale(${zoom / 100})`, transformOrigin: 'top left', width: `${10000 / zoom}%` }}>
          <div style={{ background: '#fff', borderRadius: '20px', border: '0.5px solid #e2e8f0', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>PROCESSO / TAREFA</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>SETOR</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>FORMA PAGAMENTO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>VENCIMENTO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>STATUS</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: '10px', letterSpacing: '1.5px', color: '#9e9e9e' }}>VALOR</th>
                </tr>
              </thead>
              <tbody>
                {boletosRelatorio.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: '0.5px solid #f5f5f5' }}>
                    <td style={{ padding: '11px 14px', color: '#333' }}>{b.tarefa || b.id}</td>
                    <td style={{ padding: '11px 14px', color: '#666' }}>{b.setor || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#666' }}>{b.forma_pagamento || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#666' }}>{formatarDataBR(b.vencimento_boleto)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: STATUS_COLORS[b.status] + '22', color: STATUS_COLORS[b.status], padding: '3px 10px', borderRadius: '6px', fontSize: '11px', letterSpacing: '0.5px' }}>
                        {STATUS_LABELS[b.status] || b.status}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#333' }}>{formatarMoeda(b.valor_servico)}</td>
                  </tr>
                ))}
                {boletosRelatorio.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#bbb', fontSize: '13px' }}>Nenhum processo encontrado.</td></tr>
                )}
              </tbody>
              {boletosRelatorio.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #f1f5f9' }}>
                    <td colSpan={5} style={{ padding: '12px 14px', fontSize: '12px', letterSpacing: '0.5px', color: '#9e9e9e' }}>TOTAL ({boletosRelatorio.length} processos)</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '15px', color: '#333' }}>
                      {formatarMoeda(boletosRelatorio.reduce((acc, b) => acc + (parseFloat(b.valor_servico) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* RELATORIO PARA IMPRESSAO */}
        <div className="print-only" style={{ display: 'none' }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', letterSpacing: '-0.5px', margin: '0 0 4px' }}>RELATORIO DE PROCESSOS NF — NOVA TRATORES</h2>
            <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} — Exclui processos com status "Pago"</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1a1a1a', color: '#fff' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', letterSpacing: '0.5px' }}>PROCESSO / TAREFA</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', letterSpacing: '0.5px' }}>SETOR</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', letterSpacing: '0.5px' }}>FORMA PAGAMENTO</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', letterSpacing: '0.5px' }}>VENCIMENTO</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', letterSpacing: '0.5px' }}>STATUS</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', letterSpacing: '0.5px' }}>VALOR</th>
              </tr>
            </thead>
            <tbody>
              {boletosRelatorio.map((b, i) => (
                <tr key={b.id} style={{ background: i % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '0.5px solid #e5e5e5' }}>
                  <td style={{ padding: '9px 12px', color: '#222' }}>{b.tarefa || b.id}</td>
                  <td style={{ padding: '9px 12px', color: '#555' }}>{b.setor || '—'}</td>
                  <td style={{ padding: '9px 12px', color: '#555' }}>{b.forma_pagamento || '—'}</td>
                  <td style={{ padding: '9px 12px', color: '#555' }}>{formatarDataBR(b.vencimento_boleto)}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: STATUS_COLORS[b.status] + '22', color: STATUS_COLORS[b.status], padding: '2px 8px', borderRadius: '6px', fontSize: '11px', letterSpacing: '0.5px' }}>
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#222' }}>{formatarMoeda(b.valor_servico)}</td>
                </tr>
              ))}
              {boletosRelatorio.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Nenhum processo encontrado.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0f0f0', borderTop: '1px solid #ccc' }}>
                <td colSpan={5} style={{ padding: '10px 12px', fontWeight: '600', letterSpacing: '0.5px' }}>TOTAL ({boletosRelatorio.length} processos)</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>
                  {formatarMoeda(boletosRelatorio.reduce((acc, b) => acc + (parseFloat(b.valor_servico) || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </main>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          main { margin-left: 0 !important; padding: 30px !important; }
          header > div:last-child { display: none !important; }
        }
      `}</style>
    </div>
  )
}
