'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
// IMPORTAÇÃO DO NOVO MENU
import MenuLateral from '@/components/financeiro/MenuLateral'
import { formatarMoeda, formatarDataBR } from '@/lib/financeiro/utils'
// ÍCONES MODERNOS
import { 
  Bell, Menu, ArrowLeft, FileText, CheckCircle, Download, 
  Search, LayoutDashboard, ClipboardList, TrendingDown, TrendingUp, UserCheck, LogOut 
} from 'lucide-react'

// --- TELA DE CARREGAMENTO ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;900&display=swap" rel="stylesheet" />
        <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center', lineHeight: '1.4' }}>
            Comunicação Financeiro <br /> 
            <b style={{ fontWeight: '900', fontSize: '28px' }}>Nova Tratores</b>
        </h1>
    </div>
  )
}

export default function HistoricoReceber() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [pesquisa, setPesquisa] = useState('') // ESTADO PARA PESQUISA
  const router = useRouter()

  // Captura o path atual para o menu saber qual botão destacar
  const path = typeof window !== 'undefined' ? window.location.pathname : '/financeiro/historico-receber';

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const { data } = await supabase.from('finan_receber')
        .select('*')
        .eq('status', 'concluido')
        .order('id', { ascending: false })
      
      setLista(data || [])
      setLoading(false)
    }
    fetchData()
  }, [router])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  // FILTRO DE PESQUISA POR CLIENTE OU ID
  const listaFiltrada = lista.filter(item => 
    item.cliente?.toLowerCase().includes(pesquisa.toLowerCase()) ||
    item.id.toString().includes(pesquisa)
  )

  if (loading) return <LoadingScreen />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundImage: `url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')`, backgroundSize: 'cover', backgroundAttachment: 'fixed', fontFamily: 'Montserrat, sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
      
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(241, 245, 249, 0.6)', zIndex: 0 }}></div>

      {/* CHAMADA DO COMPONENTE MENU LATERAL CENTRALIZADO */}
      <MenuLateral 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        path={path} 
        router={router} 
        handleLogout={handleLogout} 
      />

      <main style={{ marginLeft: isSidebarOpen ? '360px' : '85px', flex: 1, padding: '50px', zIndex: 1, position: 'relative', transition: '0.4s' }}>
        <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'60px' }}>
            <div>
                <h1 style={{ fontWeight: '400', color: '#0f172a', margin: 0, fontSize:'46px', letterSpacing:'-2px' }}>HISTÓRICO DE RECEBIMENTOS</h1>
                <div style={{ width: '100px', height: '4px', background: '#3b82f6', marginTop: '15px' }}></div>
            </div>

            {/* FILTRO DE PESQUISA */}
            <div style={{ position: 'relative' }}>
                <Search size={22} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Pesquisar cliente ou ID..." 
                  value={pesquisa}
                  onChange={(e) => setPesquisa(e.target.value)}
                  style={{ padding: '18px 20px 18px 50px', width: '400px', borderRadius: '15px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '16px', background: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}
                />
            </div>
        </header>

        <div style={{ background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(15px)', borderRadius: '25px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
            <thead style={{ background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid #cbd5e1' }}>
              <tr>
                <th style={{ padding:'30px', fontSize:'14px', fontWeight:'400', color:'#94a3b8' }}>ID</th>
                <th style={{ fontSize:'14px', fontWeight:'400', color:'#94a3b8' }}>CLIENTE</th>
                <th style={{ fontSize:'14px', fontWeight:'400', color:'#94a3b8' }}>VALOR RECEBIDO</th>
                <th style={{ fontSize:'14px', fontWeight:'400', color:'#94a3b8' }}>VENCIMENTO</th>
                <th style={{ fontSize:'14px', fontWeight:'400', color:'#94a3b8', textAlign:'center' }}>ARQUIVOS</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0', transition: '0.2s' }}>
                  <td style={{ padding:'25px 30px', fontSize:'16px', color:'#64748b' }}>#{item.id}</td>
                  <td style={{ fontSize:'18px', color:'#0f172a', fontWeight:'400' }}>{item.cliente?.toUpperCase()}</td>
                  <td style={{ fontSize:'18px', color:'#0f172a', fontWeight:'400' }}>{formatarMoeda(item.valor)}</td>
                  <td style={{ fontSize:'18px', color:'#475569', fontWeight:'400' }}>{formatarDataBR(item.data_vencimento)}</td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:'12px', justifyContent:'center' }}>
                      {(item.anexo_nf_servico || item.anexo_nf_peca) && (
                        <a href={item.anexo_nf_servico || item.anexo_nf_peca} target="_blank" style={{ padding:'10px', borderRadius:'10px', background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1' }}>
                          <FileText size={20} />
                        </a>
                      )}
                      {item.anexo_boleto && (
                        <a href={item.anexo_boleto} target="_blank" style={{ padding:'10px', borderRadius:'10px', background:'#fff', color:'#0f172a', border:'1px solid #cbd5e1' }}>
                          <Download size={20} />
                        </a>
                      )}
                      <div style={{ padding:'10px', color:'#22c55e' }}>
                        <CheckCircle size={20} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listaFiltrada.length === 0 && (
            <div style={{padding:'100px', textAlign:'center'}}>
                <p style={{ fontSize:'18px', color:'#94a3b8' }}>Nenhum registro encontrado no histórico.</p>
            </div>
          )}
        </div>
      </main>

      <div style={{ position: 'fixed', top: '50px', right: '50px', zIndex: 1200 }}>
          <div style={{ cursor:'pointer', color:'#0f172a', background:'rgba(255,255,255,0.8)', padding:'12px', borderRadius:'12px', border:'1px solid #cbd5e1', backdropFilter:'blur(5px)' }}>
              <Bell size={26} strokeWidth={1.5} />
          </div>
      </div>
    </div>
  )
}