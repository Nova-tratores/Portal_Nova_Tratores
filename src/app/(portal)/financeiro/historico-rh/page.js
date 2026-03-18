'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
// IMPORTAÇÃO DO MENU MODULAR
import MenuLateral from '@/components/financeiro/MenuLateral'
import { formatarDataBR } from '@/lib/financeiro/utils'
// ÍCONES
import { 
  Bell, Menu, ArrowLeft, FileText, CheckCircle, Search, 
  LayoutDashboard, ClipboardList, TrendingDown, TrendingUp, UserCheck, LogOut, Hash, Briefcase, Calendar 
} from 'lucide-react'

// --- REUTILIZANDO O FUNDO PARA MANTER A IDENTIDADE ---
function GeometricBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', background: '#f0f4f8', pointerEvents: 'none' }}>
      <img src="https://images.unsplash.com/photo-1633167606207-d840b5070fc2?q=80&w=900" style={{ position: 'absolute', top: '-15%', left: '-10%', width: '900px', opacity: 0.15, transform: 'rotate(-15deg)' }} alt="" />
      <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800" style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '800px', opacity: 0.12, transform: 'rotate(10deg)' }} alt="" />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 0%, rgba(240, 244, 248, 0.4) 100%)' }}></div>
    </div>
  )
}

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

export default function HistoricoRH() {
  const [chamados, setChamados] = useState([])
  const [userProfile, setUserProfile] = useState(null) // ESTADO PARA O PERFIL
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const router = useRouter()

  const path = typeof window !== 'undefined' ? window.location.pathname : '/financeiro/historico-rh';

  useEffect(() => {
    const carregarTudo = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      // Busca o perfil para o menu lateral saber as rotas dinâmicas
      const { data: prof } = await supabase.from('financeiro_usu').select('*').eq('id', session.user.id).single()
      setUserProfile(prof)

      const { data, error } = await supabase
        .from('finan_rh')
        .select('*')
        .eq('status', 'concluido')
        .order('created_at', { ascending: false })

      if (error) console.error(error)
      else setChamados(data || [])
      setLoading(false)
    }
    carregarTudo()
  }, [router])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  const chamadosFiltrados = chamados.filter(c => 
    c.funcionario.toLowerCase().includes(busca.toLowerCase()) || 
    c.titulo.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) return <LoadingScreen />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Montserrat, sans-serif', background: 'transparent' }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
      <GeometricBackground />

      {/* MENU LATERAL MODULAR - AGORA PASSANDO O userProfile CORRETAMENTE */}
      <MenuLateral 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        path={path} 
        router={router} 
        handleLogout={handleLogout} 
        userProfile={userProfile}
      />

      <main style={{ marginLeft: isSidebarOpen ? '360px' : '85px', flex: 1, padding: '50px', zIndex: 1, position: 'relative', transition: '0.4s' }}>
        <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'60px' }}>
            <div>
              <h1 style={{ fontWeight: '400', color: '#0f172a', margin: 0, fontSize:'46px', letterSpacing:'-2px' }}>HISTÓRICO: CHAMADOS RH</h1>
              <div style={{ width: '100px', height: '4px', background: '#3b82f6', marginTop: '15px' }}></div>
            </div>

            <div style={{ position: 'relative' }}>
                <Search size={22} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Pesquisar funcionário ou título..." 
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{ padding: '18px 20px 18px 50px', width: '450px', borderRadius: '15px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '16px', background: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}
                />
            </div>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '30px' }}>
          {chamadosFiltrados.length > 0 ? (
            chamadosFiltrados.map((c) => (
              <div key={c.id} style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(15px)', borderRadius: '25px', border: '1px solid #cbd5e1', padding: '35px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)', position: 'relative' }}>
                
                <div style={{ position: 'absolute', top: 0, right: 0, padding: '10px 25px', background: '#22c55e', color: '#fff', fontSize: '12px', fontWeight: '400', borderRadius: '0 0 0 15px' }}>CONCLUÍDO</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#3b82f6', marginBottom: '20px', fontSize: '18px' }}>
                  <Hash size={18} /> <span>{c.id}</span>
                </div>

                <h3 style={{ fontSize: '26px', color: '#0f172a', marginBottom: '10px', fontWeight: '400' }}>{c.funcionario.toUpperCase()}</h3>
                <p style={{ color: '#64748b', fontSize: '18px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Briefcase size={18} /> {c.setor}
                </p>

                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '15px', marginBottom: '25px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>TÍTULO DA SOLICITAÇÃO</span>
                  <span style={{ fontSize: '18px', color: '#334155' }}>{c.titulo}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '16px' }}>
                    <Calendar size={18} /> {formatarDataBR(c.created_at)}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} /> VER RESUMO
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px', background: 'rgba(255,255,255,0.5)', borderRadius: '30px' }}>
              <UserCheck size={60} color="#cbd5e1" style={{ marginBottom: '20px' }} />
              <p style={{ color: '#94a3b8', fontSize: '20px' }}>Nenhum chamado de RH concluído foi encontrado.</p>
            </div>
          )}
        </section>
      </main>

      <div style={{ position: 'fixed', top: '50px', right: '50px', zIndex: 1200 }}>
          <div style={{ cursor:'pointer', color:'#0f172a', background:'rgba(255,255,255,0.8)', padding:'12px', borderRadius:'12px', border:'1px solid #cbd5e1', backdropFilter:'blur(5px)' }}>
              <Bell size={32} strokeWidth={1.5} />
          </div>
      </div>
    </div>
  )
}