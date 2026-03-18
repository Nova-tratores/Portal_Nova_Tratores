'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
// IMPORTAÇÃO DO MENU MODULAR
import MenuLateral from '@/components/financeiro/MenuLateral'
// ÍCONES MODERNOS
import { ArrowLeft, FileText, Calendar, CreditCard, User, Hash, Info, CheckCircle, Upload, Paperclip } from 'lucide-react'

// --- 1. TELA DE CARREGAMENTO PADRONIZADA (ESTILO ATUALIZADO) ---
function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#212124', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#f8fafc', fontFamily: 'Montserrat, sans-serif', fontWeight: '300', fontSize: '28px', letterSpacing: '4px', textTransform: 'uppercase', textAlign: 'center', lineHeight: '1.4' }}>
            Fluxo de Faturamento <br /> 
            <span style={{ fontWeight: '400', fontSize: '32px', color: '#9e9e9e' }}>Nova Tratores</span>
        </h1>
    </div>
  )
}

export default function NovoChamadoNF() {
  const [todosUsuarios, setTodosUsuarios] = useState([])
  const [userProfile, setUserProfile] = useState(null) 
  const [tipoNF, setTipoNF] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false) 
  const router = useRouter()

  const [formData, setFormData] = useState({
    nom_cliente: '', valor_servico: '', num_nf_servico: '', num_nf_peca: '',
    forma_pagamento: '', tarefa: '', tarefa_destinatario: '', obs: '',
    qtd_parcelas: 1
  })
  
  const [datasParcelas, setDatasParcelas] = useState(['', '', '', '', ''])
  const [fileServico, setFileServico] = useState(null)
  const [filePeca, setFilePeca] = useState(null)
  const [fileComprovante, setFileComprovante] = useState(null)

  const path = typeof window !== 'undefined' ? window.location.pathname : '/financeiro/novo-chamado-nf';

  const exigeComprovante = ['Pix', 'Cartão a vista', 'Cartão Parcelado'].includes(formData.forma_pagamento);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const { data: profile } = await supabase.from('financeiro_usu').select('*').eq('id', session.user.id).single()
      setUserProfile(profile)

      const { data } = await supabase.from('financeiro_usu').select('id, nome, funcao')
      if (data) setTodosUsuarios(data)
      setPageLoading(false)
    }
    load()
  }, [router])

  const handleLogout = async () => { 
    await supabase.auth.signOut(); 
    router.push('/login'); 
  }

  const uploadFile = async (file, path) => {
    if (!file) return null
    const fileExt = file.name.split('.').pop()
    const filePath = `${path}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const { error } = await supabase.storage.from('anexos').upload(filePath, file)
    if (error) throw error
    const { data } = supabase.storage.from('anexos').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); 
    setLoading(true)
    try {
      const urlS = (tipoNF === 'servico' || tipoNF === 'ambas') ? await uploadFile(fileServico, 'servicos') : null
      const urlP = (tipoNF === 'pecas' || tipoNF === 'ambas') ? await uploadFile(filePeca, 'pecas') : null
      const urlComp = exigeComprovante ? await uploadFile(fileComprovante, 'comprovantes') : null

      const statusI = exigeComprovante ? 'validar_pix' : 'gerar_boleto'
      const tarefaI = exigeComprovante ? `Validar Recebimento ${formData.forma_pagamento}` : 'Gerar Boleto'
      
      const datasFinal = datasParcelas.slice(0, formData.qtd_parcelas).filter(d => d !== '').join(', ')
      const vencimentoFinal = datasParcelas[0] === '' ? null : datasParcelas[0];

      const valorTotal = parseFloat(formData.valor_servico) || 0;
      const qtd = formData.qtd_parcelas || 1;
      const valorPorParcela = (valorTotal / qtd).toFixed(2);

      const valoresParcelasObj = {};
      for (let i = 1; i <= 5; i++) {
          valoresParcelasObj[`valor_parcela${i}`] = i <= qtd ? valorPorParcela : 0;
      }

      const { error } = await supabase.from('Chamado_NF').insert([{
        ...formData,
        ...valoresParcelasObj,
        setor: 'Financeiro', 
        status: statusI, 
        tarefa: tarefaI,
        anexo_nf_servico: urlS, 
        anexo_nf_peca: urlP, 
        comprovante_pagamento: urlComp,
        vencimento_boleto: vencimentoFinal,
        datas_parcelas: datasFinal
      }])

      if (error) throw error
      alert("Faturamento registrado com sucesso."); 
      router.push('/financeiro')
    } catch (err) { 
      alert("Erro ao salvar: " + err.message) 
    } finally { setLoading(false) }
  }

  // OBJETOS DE ESTILO PARA MANTER O PADRÃO 50% MAIS CLARO E FONTES MAIORES
  const inputStyle = {
    width: '100%',
    padding: '18px 20px 18px 52px',
    borderRadius: '14px',
    border: '1px solid #55555a',
    outline: 'none',
    background: '#242427',
    color: '#ffffff',
    fontFamily: 'Montserrat, sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    transition: '0.3s ease',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '400',
    color: '#9e9e9e',
    marginBottom: '10px',
    letterSpacing: '1px',
    textTransform: 'uppercase'
  }

  if (pageLoading) return <LoadingScreen />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#2a2a2d', fontFamily: 'Montserrat, sans-serif', color: '#f1f5f9' }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400&display=swap" rel="stylesheet" />
      
      <MenuLateral isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} path={path} router={router} handleLogout={handleLogout} userProfile={userProfile} />

      <div style={{ flex: 1, marginLeft: isSidebarOpen ? '360px' : '85px', transition: '0.4s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px' }}>
        
        <div style={{ width: '100%', maxWidth: '750px', display: 'flex', justifyContent: 'flex-start' }}>
            <button onClick={() => router.push('/financeiro')} style={{ background: 'none', border: 'none', color: '#9e9e9e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', marginBottom: '25px' }}>
                <ArrowLeft size={18} /> Voltar ao Painel
            </button>
        </div>

        <div style={{ width: '100%', maxWidth: '750px', background: '#3f3f44', padding: '60px', borderRadius: '35px', border: '0.5px solid #55555a', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
          
          <h2 style={{ color: '#ffffff', fontWeight: '300', fontSize: '32px', textAlign: 'center', marginBottom: '50px', letterSpacing: '-1px' }}>Novo Faturamento</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* TIPO DE NOTA */}
            <div>
              <label style={labelStyle}>Categoria de Nota</label>
              <div style={{ position: 'relative' }}>
                  <FileText size={20} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 }} />
                  <select required style={{...inputStyle, appearance: 'none', cursor: 'pointer'}} onChange={(e) => setTipoNF(e.target.value)}>
                      <option value="">Selecione o tipo...</option>
                      <option value="servico">Nota de Serviço</option>
                      <option value="pecas">Nota de Peças</option>
                      <option value="ambas">Ambas (Serviço e Peças)</option>
                  </select>
              </div>
            </div>

            {/* DOCUMENTOS DINÂMICOS */}
            {tipoNF && (
              <div style={{ display:'flex', flexDirection:'column', gap:'25px', padding: '30px', background: '#242427', borderRadius: '20px', border: '1px solid #55555a' }}>
                {(tipoNF === 'servico' || tipoNF === 'ambas') && (
                  <div>
                    <label style={labelStyle}>Nº Nota Serviço</label>
                    <input type="text" placeholder="Número" required style={{...inputStyle, paddingLeft: '16px'}} onChange={(e)=>setFormData({...formData, num_nf_servico: e.target.value})} />
                    <input type="file" required style={{fontSize: '13px', marginTop: '12px', color: '#bdbdbd'}} onChange={(e)=>setFileServico(e.target.files[0])} />
                  </div>
                )}
                {(tipoNF === 'pecas' || tipoNF === 'ambas') && (
                  <div style={{ borderTop: tipoNF === 'ambas' ? '1px solid #55555a' : 'none', paddingTop: tipoNF === 'ambas' ? '25px' : 0 }}>
                    <label style={labelStyle}>Nº Nota Peças</label>
                    <input type="text" placeholder="Número" required style={{...inputStyle, paddingLeft: '16px'}} onChange={(e)=>setFormData({...formData, num_nf_peca: e.target.value})} />
                    <input type="file" required style={{fontSize: '13px', marginTop: '12px', color: '#bdbdbd'}} onChange={(e)=>setFilePeca(e.target.files[0])} />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
              <div>
                  <label style={labelStyle}>Nome do Cliente</label>
                  <div style={{ position: 'relative' }}>
                      <User size={20} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 }} />
                      <input type="text" placeholder="Nome completo" required style={inputStyle} onChange={(e)=>setFormData({...formData, nom_cliente: e.target.value})} />
                  </div>
              </div>
              <div>
                  <label style={labelStyle}>Valor Total</label>
                  <div style={{ position: 'relative' }}>
                      <Hash size={20} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 }} />
                      <input type="number" step="0.01" placeholder="0,00" required style={inputStyle} onChange={(e)=>setFormData({...formData, valor_servico: e.target.value})} />
                  </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Condição de Pagamento</label>
              <div style={{ position: 'relative' }}>
                  <CreditCard size={20} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 }} />
                  <select required style={{...inputStyle, appearance: 'none', cursor: 'pointer'}} onChange={(e)=>setFormData({...formData, forma_pagamento: e.target.value})}>
                      <option value="">Selecione...</option>
                      <option value="Pix">À vista no Pix</option>
                      <option value="Boleto 30 dias">Boleto 30 dias</option>
                      <option value="Boleto Parcelado">Boleto Parcelado</option>
                      <option value="Cartão a vista">Cartão à vista</option>
                      <option value="Cartão Parcelado">Cartão Parcelado</option>
                  </select>
              </div>
            </div>

            {/* SEÇÃO DE COMPROVANTE */}
            {exigeComprovante && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '400', color: '#93c5fd', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>Comprovante Obrigatório</label>
                  <label style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', 
                      padding: '28px', background: 'rgba(147, 197, 253, 0.05)', border: '1px dashed #55555a', 
                      borderRadius: '18px', cursor: 'pointer', transition: '0.3s'
                  }}>
                    <Upload size={26} color="#93c5fd" />
                    <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '15px', fontWeight: '400', color: '#ffffff', display: 'block' }}>{fileComprovante ? fileComprovante.name : 'Selecionar Arquivo'}</span>
                        <span style={{ fontSize: '12px', color: '#9e9e9e' }}>Conferência obrigatória</span>
                    </div>
                    <input type="file" required style={{ display: 'none' }} onChange={(e)=>setFileComprovante(e.target.files[0])} />
                  </label>
              </div>
            )}

            {/* DATAS DINÂMICAS */}
            {(formData.forma_pagamento === 'Pix' || formData.forma_pagamento === 'Boleto 30 dias' || formData.forma_pagamento === 'Cartão a vista') && (
              <div>
                  <label style={labelStyle}>Data de Vencimento / Referência</label>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={20} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', zIndex: 10 }} />
                    <input type="date" required style={inputStyle} onChange={(e) => {
                      const d = [...datasParcelas]; d[0] = e.target.value; setDatasParcelas(d);
                    }} />
                  </div>
              </div>
            )}

            {(formData.forma_pagamento === 'Boleto Parcelado' || formData.forma_pagamento === 'Cartão Parcelado') && (
                <div style={{ background: '#242427', padding: '35px', borderRadius: '20px', border: '1px solid #55555a' }}>
                  <label style={{...labelStyle, fontSize: '13px'}}>Número de Parcelas (Máximo 5)</label>
                  <input type="number" min="1" max="5" placeholder="Quantidade" style={{...inputStyle, paddingLeft: '16px', marginBottom: '25px'}} onChange={(e) => setFormData({...formData, qtd_parcelas: Math.min(5, parseInt(e.target.value) || 1)})} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      {Array.from({ length: formData.qtd_parcelas }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '400', color: '#bdbdbd', minWidth: '90px' }}>{i + 1}ª PARC.</span>
                          <input type="date" required style={{...inputStyle, padding: '12px 18px'}} onChange={(e) => {
                              const d = [...datasParcelas]; d[i] = e.target.value; setDatasParcelas(d);
                          }} />
                        </div>
                      ))}
                  </div>
                </div>
            )}

            <button disabled={loading} style={{ 
                background: loading ? '#55555a' : '#93c5fd20', 
                color: '#93c5fd', 
                border: '1px solid #93c5fd', 
                padding: '22px', 
                borderRadius: '18px', 
                fontWeight: '400', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                fontSize: '17px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '12px',
                transition: '0.3s',
                opacity: 0.9
            }}>
              {loading ? 'Processando Registro...' : <><CheckCircle size={20}/> Registrar Faturamento</>}
            </button>
          </form>
        </div>
      </div>

      <style jsx global>{`
        select { appearance: none; }
        button:hover { opacity: 1 !important; transform: translateY(-1px); transition: 0.2s; }
      `}</style>
    </div>
  )
}