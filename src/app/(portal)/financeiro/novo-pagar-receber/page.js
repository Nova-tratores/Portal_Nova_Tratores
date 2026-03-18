'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
// IMPORTAÇÃO DO MENU MODULAR
import MenuLateral from '@/components/financeiro/MenuLateral'
// ÍCONES
import { 
  ArrowLeft, FileText, Calendar, User, Hash, 
  CheckCircle, Upload, Paperclip, X, PlusCircle, CreditCard 
} from 'lucide-react'

// --- 1. TELA DE CARREGAMENTO PADRONIZADA ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#212124', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#f8fafc', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '28px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center' }}>
            Fluxo Financeiro <br /> <span style={{ fontWeight: '400', fontSize: '32px', color: '#9e9e9e' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

export default function NovoPagarReceber() {
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [fornecedores, setFornecedores] = useState([])

  const [fileNFServ, setFileNFServ] = useState(null)
  const [fileBoleto, setFileBoleto] = useState(null)
  const [filesReq, setFilesReq] = useState([])

  const [formData, setFormData] = useState({ 
    entidade: '', 
    valor: '', 
    vencimento: '', 
    motivo: '',
    numero_NF: '',
    metodo: '' // Novo campo
  })
  
  const router = useRouter()
  const path = typeof window !== 'undefined' ? window.location.pathname : '/financeiro/novo-pagar-receber';

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')
      const { data: prof } = await supabase.from('financeiro_usu').select('*').eq('id', session.user.id).single()
      setUserProfile(prof)
      const { data: fornData } = await supabase.from('Fornecedores').select('*').order('nome', { ascending: true })
      setFornecedores(fornData || [])
      setPageLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login'); }

  const uploadSingle = async (file, folder) => {
    if (!file) return null
    const filePath = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    await supabase.storage.from('anexos').upload(filePath, file)
    const { data } = supabase.storage.from('anexos').getPublicUrl(filePath)
    return data.publicUrl
  }

  const uploadMultiple = async (files, folder) => {
    if (!files || files.length === 0) return null
    const urls = []
    for (const file of files) {
      const url = await uploadSingle(file, folder)
      if (url) urls.push(url)
    }
    return urls.join(', ')
  }

  const salvar = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const nf = await uploadSingle(fileNFServ, 'pagar')
      const bol = await uploadSingle(fileBoleto, 'pagar')
      const reqs = await uploadMultiple(filesReq, 'pagar')

      const { error } = await supabase.from('finan_pagar').insert([{
        fornecedor: formData.entidade,
        valor: formData.valor,
        data_vencimento: formData.vencimento,
        motivo: formData.motivo,
        numero_NF: formData.numero_NF,
        metodo: formData.metodo,
        anexo_nf: nf,
        anexo_boleto: bol,
        anexo_requisicao: reqs,
        is_requisicao: true,
        status: 'financeiro'
      }])
      if (error) throw error
      alert("Processo criado com sucesso."); 
      router.push('/financeiro')
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  if (pageLoading) return <LoadingScreen />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#2a2a2d', fontFamily: 'Montserrat, sans-serif', color: '#f1f5f9' }}>
      <MenuLateral isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} path={path} router={router} handleLogout={handleLogout} userProfile={userProfile} />

      <main style={{ flex: 1, marginLeft: isSidebarOpen ? '360px' : '85px', transition: '0.4s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px' }}>
        
        <div style={{ width: '100%', maxWidth: '750px', marginBottom: '25px' }}>
            <button onClick={() => router.push('/financeiro')} style={{ background: 'none', border: 'none', color: '#9e9e9e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <ArrowLeft size={18} /> Voltar ao Painel Principal
            </button>
        </div>

        <div style={{ background:'#3f3f44', padding:'60px', borderRadius:'35px', width:'100%', maxWidth:'750px', border: '0.5px solid #55555a', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
          <h2 style={{ textAlign:'center', color:'#ffffff', fontWeight:'300', fontSize:'32px', marginBottom:'50px', letterSpacing:'-1px' }}>Novo Registro Financeiro</h2>
          
          <form onSubmit={salvar} style={{ display:'flex', flexDirection:'column', gap:'30px' }}>

              <div>
                <label style={labelStyle}>Escolha o Fornecedor</label>
                <div style={{ position: 'relative' }}>
                  <User size={20} style={iconInputStyle} />
                  <select required style={inputStyle} onChange={e=>setFormData({...formData, entidade: e.target.value})}>
                      <option value="">Selecione na lista...</option>
                      {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Método de Pagamento</label>
                <div style={{ position: 'relative' }}>
                  <CreditCard size={20} style={iconInputStyle} />
                  <select required style={inputStyle} onChange={e=>setFormData({...formData, metodo: e.target.value})}>
                      <option value="">Selecione...</option>
                      <option value="Boleto">Boleto</option>
                      <option value="Pix">Pix</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Transferência">Transferência</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Número da Nota Fiscal</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={20} style={iconInputStyle} />
                  <input placeholder="000.000.000" required style={inputStyle} onChange={e=>setFormData({...formData, numero_NF: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                  <div>
                    <label style={labelStyle}>Valor do Registro</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e', fontSize: '16px' }}>R$</span>
                      <input type="number" step="0.01" placeholder="0,00" required style={{...inputStyle, paddingLeft: '50px'}} onChange={e=>setFormData({...formData, valor: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Data de Vencimento</label>
                    <div style={{ position: 'relative' }}>
                      <Calendar size={20} style={iconInputStyle} />
                      <input type="date" required style={inputStyle} onChange={e=>setFormData({...formData, vencimento: e.target.value})} />
                    </div>
                  </div>
              </div>

              <div>
                <label style={labelStyle}>Descrição ou Motivo</label>
                <textarea placeholder="Descreva os detalhes deste lançamento..." required style={{...inputStyle, height:'100px', resize: 'none', paddingLeft:'20px'}} onChange={e=>setFormData({...formData, motivo: e.target.value})} />
              </div>

              <div style={{ background:'#4a4a4f', padding:'30px', borderRadius:'20px', border:'0.5px solid #626268', display:'flex', flexDirection:'column', gap:'18px' }}>
                <label style={{...labelStyle, color: '#bdbdbd', marginBottom:'5px'}}>Anexar Documentação</label>
                
                <label style={fileBtnStyle(!!fileNFServ)}>
                    <Upload size={18}/> {fileNFServ ? fileNFServ.name.substring(0, 30) : "Nota Fiscal Principal"}
                    <input type="file" required hidden onChange={e=>setFileNFServ(e.target.files[0])} />
                </label>

                <label style={fileBtnStyle(filesReq.length > 0, true)}>
                    <Paperclip size={18}/> {filesReq.length > 0 ? `${filesReq.length} Requisições Adicionadas` : "Anexar Requisições de Compra"}
                    <input
                      type="file"
                      multiple
                      hidden
                      onChange={e => {
                        const novos = Array.from(e.target.files);
                        setFilesReq(prev => [...prev, ...novos]);
                      }}
                    />
                </label>

                {filesReq.length > 0 && (
                    <div style={{display:'flex', flexWrap:'wrap', gap:'10px', padding:'15px', background:'#2a2a2d', borderRadius:'15px'}}>
                        {filesReq.map((f, i) => (
                            <div key={i} style={{fontSize:'12px', background:'#3f3f44', color:'#f1f5f9', padding:'6px 14px', borderRadius:'10px', display:'flex', alignItems:'center', gap:'8px', border: '0.5px solid #55555a'}}>
                                {f.name.substring(0,15)}...
                                <X size={14} style={{cursor:'pointer', color:'#fca5a5'}} onClick={() => setFilesReq(filesReq.filter((_, idx) => idx !== i))}/>
                            </div>
                        ))}
                        <button type="button" onClick={() => setFilesReq([])} style={{fontSize:'11px', color:'#fca5a5', background:'none', border:'none', cursor:'pointer', paddingLeft: '10px', textDecoration: 'underline'}}>Limpar Tudo</button>
                    </div>
                )}

                <label style={{...fileBtnStyle(!!fileBoleto), borderStyle: 'dashed', opacity: 0.8}}>
                    <CreditCard size={18}/> {fileBoleto ? fileBoleto.name.substring(0, 30) : "Anexar Boleto (Opcional)"}
                    <input type="file" hidden onChange={e=>setFileBoleto(e.target.files[0])} />
                </label>
              </div>

              <button disabled={loading} style={submitBtnStyle(loading)}>
                {loading ? "Processando arquivos..." : "Finalizar e Criar Registro"}
              </button>
            </form>
        </div>
      </main>

      <style jsx global>{`
        select { appearance: none; }
        button:hover { opacity: 1 !important; transform: translateY(-1px); transition: 0.2s; }
      `}</style>
    </div>
  )
}

const labelStyle = { fontSize: '13px', color: '#9e9e9e', marginBottom: '10px', display: 'block', letterSpacing: '1px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '18px 18px 18px 52px', borderRadius: '14px', border: '0.5px solid #55555a', outline: 'none', fontSize: '16px', background: '#242427', color: '#ffffff', boxSizing: 'border-box', transition: '0.3s' };
const iconInputStyle = { position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 };

const tipoBtnStyle = (active, color) => ({
  flex: 1, padding: '18px', borderRadius: '15px', border: active ? `1px solid ${color}` : '0.5px solid #55555a',
  background: active ? `${color}20` : 'transparent', color: active ? color : '#9e9e9e', cursor: 'pointer', transition: '0.3s', fontSize: '16px'
});

const fileBtnStyle = (hasFile, isMultiple = false) => ({
  display: 'flex', alignItems: 'center', gap: '15px', padding: '16px 20px', borderRadius: '12px', 
  border: '0.5px solid #55555a', background: hasFile ? (isMultiple ? '#1e293b' : '#14532d40') : '#242427', 
  color: hasFile ? (isMultiple ? '#93c5fd' : '#4ade80') : '#bdbdbd', fontSize: '15px', cursor: 'pointer', transition: '0.2s'
});

const submitBtnStyle = (loading) => ({
  background: loading ? '#55555a' : '#fca5a520',
  color: '#fca5a5',
  border: '1px solid #fca5a5',
  padding: '22px', borderRadius: '18px',
  cursor: loading ? 'not-allowed' : 'pointer', fontSize: '17px', marginTop: '15px',
  transition: '0.3s', opacity: loading ? 0.6 : 0.9
});