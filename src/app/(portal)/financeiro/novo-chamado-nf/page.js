'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { useAuditLog } from '@/hooks/useAuditLog'
import { FileText, Calendar, CreditCard, User, Hash, CheckCircle, Upload, Paperclip, X } from 'lucide-react'

export default function NovoChamadoNF() {
  const { log: auditLog } = useAuditLog()
  const [todosUsuarios, setTodosUsuarios] = useState([])
  const [tipoNF, setTipoNF] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
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

  const exigeComprovante = ['Pix', 'Cartão a vista', 'Cartão Parcelado'].includes(formData.forma_pagamento);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')
      const { data } = await supabase.from('financeiro_usu').select('id, nome, funcao')
      if (data) setTodosUsuarios(data)
      setPageLoading(false)
    }
    load()
  }, [router])

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

      const datasFinal = datasParcelas.slice(1, formData.qtd_parcelas).filter(d => d !== '').join(', ')
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
      auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'Chamado_NF', entidade_label: `NF ${formData.nom_cliente} - R$ ${formData.valor_servico}`, detalhes: { cliente: formData.nom_cliente, valor: formData.valor_servico, forma_pagamento: formData.forma_pagamento } })
      alert("Faturamento registrado com sucesso.");
      router.push('/financeiro')
    } catch (err) {
      alert("Erro ao salvar: " + err.message)
    } finally { setLoading(false) }
  }

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#6b7280', fontSize: '16px', letterSpacing: '2px', fontFamily: 'Montserrat, sans-serif' }}>Carregando...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Montserrat, sans-serif', color: '#1e293b' }}>
      <FinanceiroNav />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
        <div style={{ width: '100%', maxWidth: '720px' }}>

          <h2 style={{ fontWeight: '500', fontSize: '24px', color: '#1e293b', marginBottom: '32px' }}>Novo Faturamento</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* TIPO DE NOTA */}
            <Field label="Categoria de Nota" icon={<FileText size={18} />}>
              <select required style={selectStyle} onChange={(e) => setTipoNF(e.target.value)}>
                <option value="">Selecione o tipo...</option>
                <option value="servico">Nota de Servico</option>
                <option value="pecas">Nota de Pecas</option>
                <option value="ambas">Ambas (Servico e Pecas)</option>
              </select>
            </Field>

            {/* DOCUMENTOS DINÂMICOS */}
            {tipoNF && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                {(tipoNF === 'servico' || tipoNF === 'ambas') && (
                  <div>
                    <label style={labelStyle}>N. Nota Servico</label>
                    <input type="text" placeholder="Numero" required style={inputStyle} onChange={(e) => setFormData({ ...formData, num_nf_servico: e.target.value })} />
                    <FileUploadBtn file={fileServico} onSelect={setFileServico} label="Anexar NF Servico" required />
                  </div>
                )}
                {(tipoNF === 'pecas' || tipoNF === 'ambas') && (
                  <div style={{ borderTop: tipoNF === 'ambas' ? '1px solid #e5e7eb' : 'none', paddingTop: tipoNF === 'ambas' ? '20px' : 0 }}>
                    <label style={labelStyle}>N. Nota Pecas</label>
                    <input type="text" placeholder="Numero" required style={inputStyle} onChange={(e) => setFormData({ ...formData, num_nf_peca: e.target.value })} />
                    <FileUploadBtn file={filePeca} onSelect={setFilePeca} label="Anexar NF Pecas" required />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Nome do Cliente" icon={<User size={18} />}>
                <input type="text" placeholder="Nome completo" required style={inputIconStyle} onChange={(e) => setFormData({ ...formData, nom_cliente: e.target.value })} />
              </Field>
              <Field label="Valor Total" icon={<Hash size={18} />}>
                <input type="number" step="0.01" placeholder="0,00" required style={inputIconStyle} onChange={(e) => setFormData({ ...formData, valor_servico: e.target.value })} />
              </Field>
            </div>

            <Field label="Condicao de Pagamento" icon={<CreditCard size={18} />}>
              <select required style={selectStyle} onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })}>
                <option value="">Selecione...</option>
                <option value="Pix">A vista no Pix</option>
                <option value="Boleto 30 dias">Boleto 30 dias</option>
                <option value="Boleto Parcelado">Boleto Parcelado</option>
                <option value="Cartão a vista">Cartao a vista</option>
                <option value="Cartão Parcelado">Cartao Parcelado</option>
              </select>
            </Field>

            {/* COMPROVANTE */}
            {exigeComprovante && (
              <div style={{ padding: '20px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                <label style={{ ...labelStyle, color: '#3b82f6', marginBottom: '12px' }}>Comprovante Obrigatorio</label>
                <FileUploadBtn file={fileComprovante} onSelect={setFileComprovante} label="Selecionar Comprovante" accent required />
              </div>
            )}

            {/* DATAS SIMPLES */}
            {(formData.forma_pagamento === 'Pix' || formData.forma_pagamento === 'Boleto 30 dias' || formData.forma_pagamento === 'Cartão a vista') && (
              <Field label="Data de Vencimento / Referencia" icon={<Calendar size={18} />}>
                <input type="date" required style={inputIconStyle} onChange={(e) => {
                  const d = [...datasParcelas]; d[0] = e.target.value; setDatasParcelas(d);
                }} />
              </Field>
            )}

            {/* PARCELAMENTO */}
            {(formData.forma_pagamento === 'Boleto Parcelado' || formData.forma_pagamento === 'Cartão Parcelado') && (
              <div style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                <label style={labelStyle}>Numero de Parcelas (Maximo 5)</label>
                <input type="number" min="1" max="5" placeholder="Quantidade" style={{ ...inputStyle, marginBottom: '20px' }}
                  onChange={(e) => setFormData({ ...formData, qtd_parcelas: Math.min(5, parseInt(e.target.value) || 1) })} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: formData.qtd_parcelas }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', minWidth: '80px' }}>{i + 1}a Parcela</span>
                      <input type="date" required style={{ ...inputStyle, flex: 1 }} onChange={(e) => {
                        const d = [...datasParcelas]; d[i] = e.target.value; setDatasParcelas(d);
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OBSERVACOES */}
            <div>
              <label style={labelStyle}>Observacoes (opcional)</label>
              <textarea
                rows={3}
                placeholder="Informacoes adicionais sobre este faturamento..."
                style={{ ...inputStyle, resize: 'none', minHeight: '80px' }}
                onChange={(e) => setFormData({ ...formData, obs: e.target.value })}
              />
            </div>

            <button disabled={loading} type="submit" style={{
              background: loading ? '#e5e7eb' : '#1e293b',
              color: loading ? '#6b7280' : '#ffffff',
              border: 'none',
              padding: '16px',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: '0.2s',
              fontFamily: 'Montserrat, sans-serif'
            }}>
              {loading ? 'Processando...' : <><CheckCircle size={18} /> Registrar Faturamento</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// --- COMPONENTES AUXILIARES ---
function Field({ label, icon, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1, display: 'flex' }}>{icon}</div>}
        {children}
      </div>
    </div>
  )
}

function FileUploadBtn({ file, onSelect, label, accent, required }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px', marginTop: '10px',
      background: file ? (accent ? '#dbeafe' : '#f0fdf4') : '#f8fafc',
      border: `1px ${file ? 'solid' : 'dashed'} ${file ? (accent ? '#93c5fd' : '#86efac') : '#d1d5db'}`,
      borderRadius: '10px', cursor: 'pointer', transition: '0.2s',
      fontSize: '14px', color: file ? (accent ? '#1d4ed8' : '#16a34a') : '#6b7280'
    }}>
      {file ? <CheckCircle size={18} /> : <Upload size={18} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file ? file.name : label}
      </span>
      {file && (
        <span onClick={(e) => { e.preventDefault(); onSelect(null); }} style={{ color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
          <X size={16} />
        </span>
      )}
      <input type="file" required={required && !file} hidden onChange={(e) => onSelect(e.target.files[0])} />
    </label>
  )
}

// --- ESTILOS ---
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', background: '#ffffff', color: '#1e293b', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'Montserrat, sans-serif', transition: '0.2s' };
const inputIconStyle = { ...inputStyle, paddingLeft: '42px' };
const selectStyle = { ...inputIconStyle, appearance: 'none', cursor: 'pointer' };
