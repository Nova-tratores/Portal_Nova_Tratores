'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { formatarDataBR, formatarMoeda } from '@/lib/financeiro/utils'
import {
  FileText, Download, Search, FilterX, Eye, ChevronDown
} from 'lucide-react'

// --- TELA DE CARREGAMENTO ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f7f8fa', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
            Histórico Financeiro <br /> 
            <span style={{ fontSize: '28px', fontWeight: '400' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

// formatarDataBR e formatarMoeda importados de @/lib/utils

// Tabela de despesas de um mês (usada dentro de cada grupo da cascata)
function TabelaDespesas({ items }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <th style={thStyle}>ID</th>
          <th style={thStyle}>FORNECEDOR</th>
          <th style={thStyle}>VALOR</th>
          <th style={thStyle}>NOTA FISCAL</th>
          <th style={thStyle}>METODO</th>
          <th style={thStyle}>VENCIMENTO</th>
          <th style={{ ...thStyle, textAlign: 'center' }}>DOCUMENTOS</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="row-hover" style={{ borderBottom: '1px solid #f1f5f9', transition: '0.2s' }}>
            <td style={{ padding: '18px 25px', fontSize: '13px', color: '#9e9e9e' }}>#{item.id}</td>
            <td style={{ fontSize: '15px', color: '#424242' }}>{item.fornecedor?.toUpperCase()}</td>
            <td style={{ fontSize: '15px', color: '#000' }}>R$ {item.valor}</td>
            <td style={{ fontSize: '15px' }}><span style={tagNota}>NF {item.numero_NF || 'N/A'}</span></td>
            <td style={{ fontSize: '14px', color: '#616161' }}>
              {item.metodo || '—'}
              {item.qtd_parcelas > 1 && <span style={{ display: 'block', fontSize: '11px', color: '#0284c7', fontWeight: '600' }}>{item.qtd_parcelas}x parcelas</span>}
            </td>
            <td style={{ fontSize: '15px', color: '#757575' }}>{formatarDataBR(item.data_vencimento)}</td>
            <td style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {item.anexo_nf && <a href={item.anexo_nf} target="_blank" title="Ver Nota" style={actionIcon}><FileText size={18} /></a>}
                {item.anexo_requisicao && <a href={item.anexo_requisicao} target="_blank" title="Ver Requisição" style={actionIcon}><Eye size={18} /></a>}
                {item.anexo_boleto && item.anexo_boleto.split(',').map((url, i) => url.trim() && (
                  <a key={`bol-${i}`} href={url.trim()} target="_blank" title={`Ver Boleto ${i + 1}`} style={actionIcon}><Download size={18} /></a>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function HistoricoPagar() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)

  // ESTADOS PARA FILTROS
  const [filtroBusca, setFiltroBusca] = useState('')
  const [mesesAbertos, setMesesAbertos] = useState({})

  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const { data } = await supabase.from('finan_pagar')
        .select('*')
        .eq('status', 'concluido')
        .order('id', { ascending: false })
      
      setLista(data || [])
      setLoading(false)
    }
    fetchData()
  }, [router])

  // LÓGICA DE FILTRAGEM (MOSTRA TUDO SE VAZIO)
  const listaFiltrada = lista.filter(item => {
    const q = filtroBusca.trim().toLowerCase();
    if (!q) return true;
    const campos = [
      item.fornecedor,
      item.numero_NF,
      item.data_vencimento,
      formatarDataBR(item.data_vencimento),
      item.metodo,
      item.valor,
      `#${item.id}`,
      item.id,
    ];
    return campos.some(v => v != null && String(v).toLowerCase().includes(q));
  })

  const limparFiltros = () => {
    setFiltroBusca('');
  }

  // AGRUPA POR MÊS/ANO do vencimento — mês atual aberto, anteriores em cascata
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const grupos = useMemo(() => {
    const map = {};
    for (const item of listaFiltrada) {
      const k = item.data_vencimento ? String(item.data_vencimento).slice(0, 7) : 'sem-data';
      (map[k] = map[k] || []).push(item);
    }
    return map;
  }, [listaFiltrada]);
  const chaves = Object.keys(grupos).filter(k => k !== 'sem-data').sort().reverse();
  if (grupos['sem-data']) chaves.push('sem-data');
  const nomeMes = (k) => k === 'sem-data' ? 'Sem data de vencimento' : `${MESES[parseInt(k.split('-')[1]) - 1]} ${k.split('-')[0]}`;
  const totalMes = (k) => (grupos[k] || []).reduce((s, it) => s + (parseFloat(it.valor) || 0), 0);
  const isAberto = (k) => mesesAbertos[k] ?? (k === mesAtual);
  const toggleMes = (k) => setMesesAbertos(prev => ({ ...prev, [k]: !isAberto(k) }));

  if (loading) return <LoadingScreen />

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', fontFamily: 'Inter, sans-serif' }}>
      <FinanceiroNav />

      <main style={{ padding: '24px 32px' }}>

        {/* BARRA DE FILTROS */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ ...filterGroup, flex: '1 1 460px', maxWidth: '640px' }}>
                <label style={filterLabel}>BUSCAR DESPESA</label>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={filterIcon} />
                    <input type="text" placeholder="Buscar por fornecedor, nº da nota, vencimento, método ou ID..." value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} style={filterInput} />
                </div>
            </div>

            {filtroBusca && (
              <button onClick={limparFiltros} style={btnLimpar}>
                  <FilterX size={18} /> LIMPAR
              </button>
            )}
        </div>

        {/* DESPESAS POR MÊS — mês atual aberto, anteriores em cascata */}
        {listaFiltrada.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', padding: '80px', textAlign: 'center', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }}>
            <p style={{ fontSize: '16px', color: '#9e9e9e' }}>Nenhuma despesa concluída encontrada.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {chaves.map((k) => {
              const aberto = isAberto(k);
              const atual = k === mesAtual;
              return (
                <div key={k} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e9ecf1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }}>
                  <button onClick={() => toggleMes(k)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 22px', border: 'none', background: atual ? 'linear-gradient(135deg,#fef2f2,#fff)' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <ChevronDown size={18} style={{ color: '#94a3b8', transform: aberto ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{nomeMes(k)}</span>
                      {atual && <span style={{ fontSize: '10px', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '20px', padding: '3px 10px', letterSpacing: '.5px' }}>MÊS ATUAL</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>{grupos[k].length} despesa{grupos[k].length !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>{formatarMoeda(totalMes(k))}</span>
                    </div>
                  </button>
                  {aberto && (
                    <div style={{ borderTop: '1px solid #f1f4f8', overflowX: 'auto' }}>
                      <TabelaDespesas items={grupos[k]} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style jsx global>{`
        .row-hover:hover { background: #fafafa; }
      `}</style>
    </div>
  )
}

// ESTILOS AUXILIARES
const thStyle = { padding:'20px 25px', fontSize:'11px', color:'#9e9e9e', letterSpacing:'1.5px', textTransform:'uppercase' };
const filterGroup = { display: 'flex', flexDirection: 'column', gap: '8px' };
const filterLabel = { fontSize: '10px', color: '#9e9e9e', letterSpacing: '1px', marginLeft: '5px' };
const filterIcon = { position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e' };
const filterInput = { padding: '15px 15px 15px 45px', width: '240px', borderRadius: '12px', border: '0.5px solid #d1d1d1', outline: 'none', fontSize: '14px', background: '#fff', color: '#333' };
const tagNota = { background: '#f5f5f5', padding: '6px 12px', borderRadius: '8px', color: '#616161', fontSize: '12px', border: '0.5px solid #e0e0e0' };
const actionIcon = { padding: '8px', borderRadius: '10px', background: '#fff', color: '#9e9e9e', border: '0.5px solid #d1d1d1', display: 'flex', transition: '0.2s' };
const btnLimpar = { padding: '15px 25px', borderRadius: '12px', border: 'none', background: '#9e9e9e', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', transition: '0.3s' };