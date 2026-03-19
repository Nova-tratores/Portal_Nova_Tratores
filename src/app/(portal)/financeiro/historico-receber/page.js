'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { formatarMoeda, formatarDataBR } from '@/lib/financeiro/utils'
import { FileText, CheckCircle, Download, Search } from 'lucide-react'

function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '24px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
            Histórico Recebimentos <br />
            <span style={{ fontSize: '28px', fontWeight: '400' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

export default function HistoricoReceber() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const router = useRouter()

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

  const listaFiltrada = lista.filter(item =>
    item.cliente?.toLowerCase().includes(pesquisa.toLowerCase()) ||
    item.id.toString().includes(pesquisa)
  )

  if (loading) return <LoadingScreen />

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />

      <main style={{ padding: '24px 32px' }}>

        {/* BARRA DE PESQUISA */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#9e9e9e', letterSpacing: '1px', marginLeft: '5px' }}>PESQUISAR CLIENTE / ID</label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e' }} />
              <input
                type="text"
                placeholder="Pesquisar cliente ou ID..."
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                style={{ padding: '15px 15px 15px 45px', width: '300px', borderRadius: '12px', border: '0.5px solid #d1d1d1', outline: 'none', fontSize: '14px', background: '#fff', color: '#333' }}
              />
            </div>
          </div>
        </div>

        {/* TABELA */}
        <div style={{ background: '#fff', borderRadius: '25px', border: '0.5px solid #d1d1d1', overflow: 'hidden', boxShadow: '0 15px 35px rgba(0,0,0,0.05)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>CLIENTE</th>
                <th style={thStyle}>VALOR RECEBIDO</th>
                <th style={thStyle}>VENCIMENTO</th>
                <th style={{ ...thStyle, textAlign:'center' }}>DOCUMENTOS</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((item) => (
                <tr key={item.id} className="row-hover" style={{ borderBottom: '0.5px solid #f1f5f9', transition: '0.2s' }}>
                  <td style={{ padding:'20px 25px', fontSize:'13px', color:'#9e9e9e' }}>#{item.id}</td>
                  <td style={{ fontSize:'15px', color:'#424242' }}>{item.cliente?.toUpperCase()}</td>
                  <td style={{ fontSize:'15px', color:'#000' }}>{formatarMoeda(item.valor)}</td>
                  <td style={{ fontSize:'15px', color:'#757575' }}>{formatarDataBR(item.data_vencimento)}</td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:'8px', justifyContent:'center' }}>
                      {(item.anexo_nf_servico || item.anexo_nf_peca) && (
                        <a href={item.anexo_nf_servico || item.anexo_nf_peca} target="_blank" title="Ver NF" style={actionIcon}>
                          <FileText size={18} />
                        </a>
                      )}
                      {item.anexo_boleto && (
                        <a href={item.anexo_boleto} target="_blank" title="Ver Boleto" style={actionIcon}>
                          <Download size={18} />
                        </a>
                      )}
                      <div style={{ padding:'8px', color:'#22c55e' }}>
                        <CheckCircle size={18} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listaFiltrada.length === 0 && (
            <div style={{padding:'80px', textAlign:'center'}}>
                <p style={{ fontSize:'16px', color:'#9e9e9e' }}>Nenhum registro encontrado no histórico.</p>
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

const thStyle = { padding:'20px 25px', fontSize:'11px', color:'#9e9e9e', letterSpacing:'1.5px', textTransform:'uppercase' };
const actionIcon = { padding: '8px', borderRadius: '10px', background: '#fff', color: '#9e9e9e', border: '0.5px solid #d1d1d1', display: 'flex', transition: '0.2s' };
