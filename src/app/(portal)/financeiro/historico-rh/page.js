'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { formatarDataBR } from '@/lib/financeiro/utils'
import { FileText, Search, Hash, Briefcase, Calendar, UserCheck } from 'lucide-react'

function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
            Histórico RH <br />
            <span style={{ fontSize: '28px', fontWeight: '400' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

export default function HistoricoRH() {
  const [chamados, setChamados] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const carregarTudo = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

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

  const chamadosFiltrados = chamados.filter(c =>
    c.funcionario.toLowerCase().includes(busca.toLowerCase()) ||
    c.titulo.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) return <LoadingScreen />

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />

      <main style={{ padding: '24px 32px' }}>

        {/* BARRA DE PESQUISA */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#9e9e9e', letterSpacing: '1px', marginLeft: '5px' }}>PESQUISAR FUNCIONÁRIO / TÍTULO</label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e' }} />
              <input
                type="text"
                placeholder="Pesquisar funcionário ou título..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ padding: '15px 15px 15px 45px', width: '300px', borderRadius: '12px', border: '0.5px solid #d1d1d1', outline: 'none', fontSize: '14px', background: '#fff', color: '#333' }}
              />
            </div>
          </div>
        </div>

        {/* CARDS */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {chamadosFiltrados.length > 0 ? (
            chamadosFiltrados.map((c) => (
              <div key={c.id} style={{ background: '#fff', borderRadius: '20px', border: '0.5px solid #d1d1d1', padding: '28px', boxShadow: '0 15px 35px rgba(0,0,0,0.05)', position: 'relative' }}>

                <div style={{ position: 'absolute', top: 0, right: 0, padding: '8px 18px', background: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: '400', borderRadius: '0 0 0 12px', letterSpacing: '1px' }}>CONCLUÍDO</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9e9e9e', marginBottom: '14px', fontSize: '13px' }}>
                  <Hash size={14} /> <span>#{c.id}</span>
                </div>

                <h3 style={{ fontSize: '18px', color: '#424242', marginBottom: '8px', fontWeight: '500' }}>{c.funcionario.toUpperCase()}</h3>
                <p style={{ color: '#757575', fontSize: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Briefcase size={14} /> {c.setor}
                </p>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '0.5px solid #e2e8f0' }}>
                  <span style={{ fontSize: '10px', color: '#9e9e9e', display: 'block', marginBottom: '6px', letterSpacing: '1px' }}>TÍTULO DA SOLICITAÇÃO</span>
                  <span style={{ fontSize: '14px', color: '#424242' }}>{c.titulo}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #f1f5f9', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9e9e9e', fontSize: '13px' }}>
                    <Calendar size={14} /> {formatarDataBR(c.created_at)}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: '#9e9e9e', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={16} /> VER RESUMO
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '20px', border: '0.5px solid #d1d1d1' }}>
              <UserCheck size={48} color="#d1d1d1" style={{ marginBottom: '16px' }} />
              <p style={{ color: '#9e9e9e', fontSize: '16px' }}>Nenhum chamado de RH concluído foi encontrado.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
