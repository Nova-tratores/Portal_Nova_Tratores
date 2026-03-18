'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
// IMPORTAÇÃO DO MENU MODULAR
import MenuLateral from '@/components/financeiro/MenuLateral'
import { formatarDataBR, formatarMoeda } from '@/lib/financeiro/utils'
// ÍCONES
import { 
  Bell, ArrowLeft, FileText, CheckCircle, Download, 
  Search, LayoutDashboard, Calendar, Hash, FilterX, Eye
} from 'lucide-react'

// --- TELA DE CARREGAMENTO ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
            Histórico Financeiro <br /> 
            <span style={{ fontSize: '28px', fontWeight: '400' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

// formatarDataBR e formatarMoeda importados de @/lib/utils

export default function HistoricoPagar() {
  const [lista, setLista] = useState([])
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  
  // ESTADOS PARA FILTROS
  const [filtroForn, setFiltroForn] = useState('')
  const [filtroNota, setFiltroNota] = useState('')
  const [filtroData, setFiltroData] = useState('')

  const router = useRouter()
  const path = typeof window !== 'undefined' ? window.location.pathname : '/financeiro/historico-pagar';

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const { data: prof } = await supabase.from('financeiro_usu').select('*').eq('id', session.user.id).single()
      setUserProfile(prof)

      const { data } = await supabase.from('finan_pagar')
        .select('*')
        .eq('status', 'concluido')
        .order('id', { ascending: false })
      
      setLista(data || [])
      setLoading(false)
    }
    fetchData()
  }, [router])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  // LÓGICA DE FILTRAGEM (MOSTRA TUDO SE VAZIO)
  const listaFiltrada = lista.filter(item => {
    const matchForn = !filtroForn || item.fornecedor?.toLowerCase().includes(filtroForn.toLowerCase());
    const matchNota = !filtroNota || item.numero_NF?.toString().includes(filtroNota);
    const matchData = !filtroData || item.data_vencimento === filtroData;
    return matchForn && matchNota && matchData;
  })

  const limparFiltros = () => {
    setFiltroForn(''); setFiltroNota(''); setFiltroData('');
  }

  if (loading) return <LoadingScreen />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Montserrat, sans-serif' }}>
      <MenuLateral isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} path={path} router={router} handleLogout={handleLogout} userProfile={userProfile} />

      <main style={{ marginLeft: isSidebarOpen ? '360px' : '85px', flex: 1, padding: '50px', transition: '0.4s ease' }}>
        
        <header style={{ marginBottom: '40px' }}>
            <h1 style={{ fontWeight: '400', color: '#333', margin: 0, fontSize:'42px', letterSpacing:'-1.5px' }}>HISTÓRICO A PAGAR</h1>
            <div style={{ width: '60px', height: '4px', background: '#9e9e9e', marginTop: '12px', borderRadius: '2px' }}></div>
        </header>

        {/* BARRA DE FILTROS */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={filterGroup}>
                <label style={filterLabel}>FILTRAR FORNECEDOR</label>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={filterIcon} />
                    <input type="text" placeholder="Nome do fornecedor..." value={filtroForn} onChange={(e) => setFiltroForn(e.target.value)} style={filterInput} />
                </div>
            </div>

            <div style={filterGroup}>
                <label style={filterLabel}>Nº NOTA FISCAL</label>
                <div style={{ position: 'relative' }}>
                    <Hash size={18} style={filterIcon} />
                    <input type="text" placeholder="Número da nota..." value={filtroNota} onChange={(e) => setFiltroNota(e.target.value)} style={filterInput} />
                </div>
            </div>

            <div style={filterGroup}>
                <label style={filterLabel}>DATA VENCIMENTO</label>
                <div style={{ position: 'relative' }}>
                    <Calendar size={18} style={filterIcon} />
                    <input type="date" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} style={filterInput} />
                </div>
            </div>

            <button onClick={limparFiltros} style={btnLimpar}>
                <FilterX size={18} /> LIMPAR FILTROS
            </button>
        </div>

        {/* TABELA DE RESULTADOS */}
        <div style={{ background: '#fff', borderRadius: '25px', border: '0.5px solid #d1d1d1', overflow: 'hidden', boxShadow: '0 15px 35px rgba(0,0,0,0.05)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>FORNECEDOR</th>
                <th style={thStyle}>VALOR</th>
                <th style={thStyle}>NOTA FISCAL</th>
                <th style={thStyle}>VENCIMENTO</th>
                <th style={{ ...thStyle, textAlign:'center' }}>DOCUMENTOS</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((item) => (
                <tr key={item.id} className="row-hover" style={{ borderBottom: '0.5px solid #f1f5f9', transition: '0.2s' }}>
                  <td style={{ padding:'20px 25px', fontSize:'13px', color:'#9e9e9e' }}>#{item.id}</td>
                  <td style={{ fontSize:'15px', color:'#424242' }}>{item.fornecedor?.toUpperCase()}</td>
                  <td style={{ fontSize:'15px', color:'#000' }}>R$ {item.valor}</td>
                  <td style={{ fontSize:'15px' }}>
                    <span style={tagNota}>NF {item.numero_NF || 'N/A'}</span>
                  </td>
                  <td style={{ fontSize:'15px', color:'#757575' }}>{formatarDataBR(item.data_vencimento)}</td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:'8px', justifyContent:'center' }}>
                      {item.anexo_nf && (
                        <a href={item.anexo_nf} target="_blank" title="Ver Nota" style={actionIcon}>
                            <FileText size={18} />
                        </a>
                      )}
                      {item.anexo_requisicao && (
                        <a href={item.anexo_requisicao} target="_blank" title="Ver Requisição" style={actionIcon}>
                            <Eye size={18} />
                        </a>
                      )}
                      {item.anexo_boleto && (
                        <a href={item.anexo_boleto} target="_blank" title="Ver Boleto" style={actionIcon}>
                            <Download size={18} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {listaFiltrada.length === 0 && (
            <div style={{padding:'80px', textAlign:'center'}}>
                <p style={{ fontSize:'16px', color:'#9e9e9e' }}>Nenhum pagamento concluído encontrado.</p>
            </div>
          )}
        </div>
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