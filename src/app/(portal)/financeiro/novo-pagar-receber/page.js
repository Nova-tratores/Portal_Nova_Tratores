'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useAuth } from '@/hooks/useAuth'
import { notificarAdminsClient } from '@/hooks/useNotificarAdmins'
import {
  FileText, Calendar, User, Hash,
  CheckCircle, Upload, Paperclip, X, CreditCard, Package, ExternalLink, Search
} from 'lucide-react'

export default function NovoPagarReceber() {
  const { log: auditLog } = useAuditLog()
  const { userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [fornecedores, setFornecedores] = useState([])

  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  const [showFornecedorList, setShowFornecedorList] = useState(false)
  const fornecedorRef = useRef(null)

  const [fileNFServ, setFileNFServ] = useState(null)
  const [filesBoleto, setFilesBoleto] = useState([])
  const [filesReq, setFilesReq] = useState([])

  // Requisições do financeiro (carregadas uma vez)
  const [reqsFinanceiro, setReqsFinanceiro] = useState([])
  const [buscaNota, setBuscaNota] = useState('')
  const [notaSelecionada, setNotaSelecionada] = useState(null)
  const [nfAutoUrl, setNfAutoUrl] = useState(null)

  const [qtdParcelas, setQtdParcelas] = useState(2)
  const [parcelas, setParcelas] = useState([])

  const [formData, setFormData] = useState({
    entidade: '',
    valor: '',
    vencimento: '',
    motivo: '',
    numero_NF: '',
    metodo: ''
  })

  const router = useRouter()

  // Resolver URL de anexo — caminho relativo vira URL pública do bucket requisicoes
  const resolverUrlAnexo = (caminho) => {
    if (!caminho) return null
    if (caminho.startsWith('http')) return caminho
    const { data } = supabase.storage.from('requisicoes').getPublicUrl(caminho)
    return data.publicUrl
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')

      const [{ data: fornData }, { data: reqData, error: reqError }] = await Promise.all([
        supabase.from('Fornecedores').select('*').order('nome', { ascending: true }),
        supabase.from('Requisicao')
          .select('id, titulo, numero_nota, foto_nf, boleto_fornecedor, recibo_fornecedor, valor_despeza, tipo, fornecedor, solicitante, setor, data, obs, status')
          .eq('status', 'financeiro')
          .order('id', { ascending: false })
      ])

      if (reqError) console.error('[Init] Erro Supabase:', reqError)
      setFornecedores(fornData || [])
      setReqsFinanceiro(reqData || [])
      setPageLoading(false)
    }
    init()
  }, [router])

  // Filtra requisições do financeiro client-side (instantâneo, sem async)
  const notasEncontradas = (() => {
    if (!buscaNota || buscaNota.length < 2) return []
    const termoLower = buscaNota.toLowerCase()
    const filtrados = reqsFinanceiro.filter(r => {
      const nota = String(r.numero_nota || '').toLowerCase()
      const id = String(r.id)
      const titulo = (r.titulo || '').toLowerCase()
      return nota.includes(termoLower) || id.includes(termoLower) || titulo.includes(termoLower)
    })
    // Agrupar por numero_nota + fornecedor
    const mapa = {}
    filtrados.forEach(r => {
      const chave = `${r.numero_nota || r.id}__${r.fornecedor || 'sem'}`
      if (!mapa[chave]) mapa[chave] = { nota: r.numero_nota || `REQ #${r.id}`, fornecedor: r.fornecedor || '', reqs: [], temNF: false, valorTotal: 0 }
      mapa[chave].reqs.push(r)
      if (r.foto_nf) mapa[chave].temNF = true
      const val = parseFloat((r.valor_despeza || '0').toString().replace(',', '.')) || 0
      mapa[chave].valorTotal += val
    })
    return Object.values(mapa)
  })()

  // Selecionar uma nota encontrada — preenche tudo automaticamente
  const selecionarNotaEncontrada = (grupo) => {
    setNotaSelecionada(grupo)
    setBuscaNota(grupo.nota)

    // Preencher fornecedor, NF, valor e descrição
    const descricao = grupo.reqs.map(r => `#${r.id} ${r.titulo || ''}`).join(', ')
    setBuscaFornecedor(grupo.fornecedor)
    setFormData(prev => ({
      ...prev,
      entidade: grupo.fornecedor,
      numero_NF: grupo.nota,
      valor: grupo.valorTotal.toFixed(2),
      motivo: descricao,
    }))

    // Pegar primeiro anexo de NF (resolver URL)
    const reqComNF = grupo.reqs.find(r => r.foto_nf)
    setNfAutoUrl(reqComNF ? resolverUrlAnexo(reqComNF.foto_nf) : null)
    if (reqComNF?.foto_nf) setFileNFServ(null)
  }

  // Limpar importação
  const limparImportacao = () => {
    setNotaSelecionada(null)
    setBuscaNota('')
    setNfAutoUrl(null)
    setFormData(prev => ({ ...prev, numero_NF: '' }))
  }

  // Gerar PDF da requisição e fazer upload pro bucket
  const gerarPdfRequisicao = async (r) => {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF('portrait', 'mm', 'a4')
    const W = 210
    let y = 15

    const line = (label, value, x = 14) => {
      doc.setFontSize(8); doc.setTextColor(120); doc.text(label.toUpperCase(), x, y)
      y += 4
      doc.setFontSize(11); doc.setTextColor(30, 41, 59); doc.text(String(value || '---'), x, y)
      y += 7
    }

    // Cabeçalho
    doc.setFontSize(18); doc.setTextColor(30, 41, 59)
    doc.text('REQUISICAO DE MATERIAIS E SERVICOS', 14, y); y += 8
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(14, y, W - 14, y); y += 8

    // ID + Categoria
    doc.setFontSize(28); doc.setTextColor(0)
    doc.text(`#${r.id}`, W - 14, 23, { align: 'right' })
    doc.setFontSize(10); doc.setTextColor(100)
    doc.text((r.tipo || 'Peca').toUpperCase(), W - 14, 30, { align: 'right' })

    // Dados
    line('Titulo', r.titulo)
    line('Solicitante', r.solicitante)
    line('Setor', r.setor)
    line('Data', r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '---')

    // Financeiro
    y += 4
    doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(14, y, W - 14, y); y += 6
    line('Fornecedor', r.fornecedor)
    line('Numero Nota Fiscal', r.numero_nota)
    line('Valor', `R$ ${r.valor_despeza || '0,00'}`)

    // Descrição
    if (r.obs || r.Motivo || r.ReqMotivo) {
      y += 4
      doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 6
      doc.setFontSize(8); doc.setTextColor(120); doc.text('DESCRICAO / JUSTIFICATIVA', 14, y); y += 5
      doc.setFontSize(10); doc.setTextColor(50)
      const texto = (r.obs || r.Motivo || r.ReqMotivo || '').replace(/\[APPSHEET_ID:.*?\]/g, '').trim()
      const linhas = doc.splitTextToSize(texto, W - 28)
      doc.text(linhas, 14, y); y += linhas.length * 5
    }

    // Rodapé
    doc.setFontSize(7); doc.setTextColor(150)
    doc.text(`Nova Tratores • Requisicao #${r.id} • Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 285)
    doc.text(`Cod: ${String(r.id).padStart(8, '0')}`, W - 14, 285, { align: 'right' })

    // Upload
    const blob = doc.output('blob')
    const filePath = `pagar/req-${r.id}-${Date.now()}.pdf`
    await supabase.storage.from('anexos').upload(filePath, blob, { contentType: 'application/pdf' })
    const { data } = supabase.storage.from('anexos').getPublicUrl(filePath)
    return data.publicUrl
  }

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
      // NF: usa a automática ou faz upload da manual
      const nf = nfAutoUrl || await uploadSingle(fileNFServ, 'pagar')
      const bol = await uploadMultiple(filesBoleto, 'pagar')

      // Requisições: gera PDF de cada requisição + boletos/recibos
      const urlsAuto = []
      if (notaSelecionada) {
        for (const r of notaSelecionada.reqs) {
          const pdfUrl = await gerarPdfRequisicao(r)
          if (pdfUrl) urlsAuto.push(pdfUrl)
          if (r.boleto_fornecedor) urlsAuto.push(resolverUrlAnexo(r.boleto_fornecedor))
          if (r.recibo_fornecedor) urlsAuto.push(resolverUrlAnexo(r.recibo_fornecedor))
        }
      }
      const urlsManuais = await uploadMultiple(filesReq, 'pagar')
      const todasUrls = [...urlsAuto, ...(urlsManuais ? urlsManuais.split(', ') : [])].filter(Boolean)
      const reqs = todasUrls.length > 0 ? todasUrls.join(', ') : null

      const isParcelado = formData.metodo === 'Boleto Parcelado' && parcelas.length > 0
      const registro = {
        fornecedor: formData.entidade,
        valor: formData.valor,
        data_vencimento: isParcelado ? parcelas[0]?.vencimento : formData.vencimento,
        motivo: formData.motivo,
        numero_NF: formData.numero_NF,
        metodo: formData.metodo,
        anexo_nf: nf,
        anexo_boleto: bol,
        anexo_requisicao: reqs,
        is_requisicao: true,
        status: 'financeiro'
      }
      if (isParcelado) {
        registro.qtd_parcelas = parcelas.length
        registro.parcelas_vencimentos = parcelas.map(p => `${p.vencimento}|${p.valor}`).join(', ')
      }
      const { error } = await supabase.from('finan_pagar').insert([registro])
      if (error) throw error
      auditLog({ sistema: 'financeiro', acao: 'criar', entidade: 'finan_pagar', entidade_label: `Pagar - ${formData.entidade} - R$ ${formData.valor}`, detalhes: { fornecedor: formData.entidade, valor: formData.valor, metodo: formData.metodo, nf: formData.numero_NF } })
      notificarAdminsClient('financeiro', `${userProfile?.nome || 'Usuário'} criou registro financeiro`, `Fornecedor: ${formData.entidade} — R$ ${formData.valor}`, '/financeiro')
      alert("Processo criado com sucesso.");
      router.push('/financeiro')
    } catch (e) { alert(e.message) } finally { setLoading(false) }
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

          <h2 style={{ fontWeight: '500', fontSize: '24px', color: '#1e293b', marginBottom: '32px' }}>Novo Registro Financeiro</h2>

          <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* IMPORTAR POR NOTA FISCAL */}
            <div style={{ padding: '20px', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={16} style={{ color: '#d97706' }} />
                <label style={{ ...labelStyle, marginBottom: 0, color: '#92400e' }}>
                  Importar de Requisicao (opcional)
                </label>
              </div>
              <div style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.5' }}>
                Busque pelo numero da nota fiscal para puxar fornecedor, anexos e requisicoes automaticamente.
              </div>

              {!notaSelecionada ? (
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#d97706' }} />
                  <input
                    type="text"
                    placeholder="Digite o numero da nota fiscal..."
                    value={buscaNota}
                    onChange={e => setBuscaNota(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '38px', background: '#fff', border: '1px solid #fde68a', fontSize: '14px' }}
                  />
                  {reqsFinanceiro.length > 0 && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#d97706' }}>{reqsFinanceiro.length} requisicoes</span>}

                  {/* Lista de resultados */}
                  {notasEncontradas.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #fde68a', borderRadius: '0 0 10px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: '300px', overflowY: 'auto' }}>
                      {notasEncontradas.map((g, i) => (
                        <div
                          key={i}
                          onClick={() => selecionarNotaEncontrada(g)}
                          style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', transition: '0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>NF {g.nota}</span>
                              <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '10px' }}>{g.fornecedor}</span>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>R$ {g.valorTotal.toFixed(2).replace('.', ',')}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                            {g.reqs.length} requisicao(oes){g.temNF ? ' · Anexo NF disponivel' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {buscaNota.length >= 2 && notasEncontradas.length === 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#92400e', fontStyle: 'italic' }}>
                      Nenhuma nota encontrada nas requisicoes (fase financeiro).
                    </div>
                  )}
                </div>
              ) : (
                /* Nota selecionada — resumo */
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #fde68a', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', background: '#fef3c7' }}>
                    <CheckCircle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>NF {notaSelecionada.nota}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{notaSelecionada.fornecedor} · R$ {notaSelecionada.valorTotal.toFixed(2).replace('.', ',')}</div>
                    </div>
                    <button type="button" onClick={limparImportacao} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: '4px' }} title="Remover importacao">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Requisições vinculadas */}
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                      Requisicoes vinculadas ({notaSelecionada.reqs.length})
                    </div>
                    {notaSelecionada.reqs.map(r => (
                      <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>#{r.id}</span>
                          <span style={{ color: '#6b7280', marginLeft: '8px' }}>{r.titulo}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <a href={`/requisicoes/imprimir/${r.id}`} target="_blank" rel="noopener noreferrer" title="Ver PDF da Requisição" style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><FileText size={9} /> PDF</a>
                          {r.boleto_fornecedor && <a href={resolverUrlAnexo(r.boleto_fornecedor)} target="_blank" rel="noopener noreferrer" title="Ver Boleto" style={{ fontSize: '10px', background: '#f3e8ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', textDecoration: 'none' }}>BOL</a>}
                          {r.recibo_fornecedor && <a href={resolverUrlAnexo(r.recibo_fornecedor)} target="_blank" rel="noopener noreferrer" title="Ver Recibo" style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', textDecoration: 'none' }}>REC</a>}
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>R$ {r.valor_despeza || '0,00'}</span>
                        </div>
                      </div>
                    ))}
                    {nfAutoUrl && (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={14} /> Anexo da NF sera importado automaticamente
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* FORNECEDOR */}
            <Field label="Fornecedor" icon={<User size={18} />}>
              <div ref={fornecedorRef} style={{ position:'relative' }}>
                <input
                  type="text"
                  required
                  placeholder="Pesquisar fornecedor..."
                  style={inputIconStyle}
                  value={buscaFornecedor}
                  onChange={e => { setBuscaFornecedor(e.target.value); setShowFornecedorList(true); setFormData({...formData, entidade: ''}); }}
                  onFocus={() => setShowFornecedorList(true)}
                  onBlur={e => { if (!fornecedorRef.current?.contains(e.relatedTarget)) setTimeout(() => setShowFornecedorList(false), 150); }}
                />
                {notaSelecionada && <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>Preenchido pela nota (pode alterar)</div>}
                {showFornecedorList && !notaSelecionada && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, maxHeight:'220px', overflowY:'auto', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'0 0 8px 8px', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', zIndex:10 }}>
                    {fornecedores.filter(f => f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase())).map(f => (
                      <div key={f.id} tabIndex={0} onMouseDown={e => e.preventDefault()} onClick={() => { setBuscaFornecedor(f.nome); setFormData({...formData, entidade: f.nome}); setShowFornecedorList(false); }}
                        style={{ padding:'10px 14px', cursor:'pointer', fontSize:'14px', color:'#1e293b', borderBottom:'1px solid #f3f4f6', fontFamily:'Montserrat, sans-serif' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >{f.nome}</div>
                    ))}
                    {fornecedores.filter(f => f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase())).length === 0 && (
                      <div style={{ padding:'12px 14px', fontSize:'13px', color:'#9ca3af', textAlign:'center' }}>Nenhum fornecedor encontrado</div>
                    )}
                  </div>
                )}
              </div>
            </Field>

            {/* METODO */}
            <Field label="Metodo de Pagamento" icon={<CreditCard size={18} />}>
              <select required style={selectStyle} onChange={e => { setFormData({...formData, metodo: e.target.value}); if (e.target.value !== 'Boleto Parcelado') setParcelas([]); }}>
                <option value="">Selecione...</option>
                <option value="Boleto">Boleto</option>
                <option value="Boleto Parcelado">Boleto Parcelado</option>
                <option value="Pix">Pix</option>
                <option value="Cartão de Crédito">Cartao de Credito</option>
                <option value="Cartão de Débito">Cartao de Debito</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Transferência">Transferencia</option>
                <option value="Carnê ISS">Carnê ISS</option>
              </select>
            </Field>

            {/* NF — não exige para Carnê ISS */}
            {formData.metodo !== 'Carnê ISS' && (
            <Field label="Numero da Nota Fiscal" icon={<Hash size={18} />}>
              <input
                placeholder="000.000.000"
                required
                style={inputIconStyle}
                value={formData.numero_NF}
                onChange={e => setFormData({...formData, numero_NF: e.target.value})}
              />
              {notaSelecionada && <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>Preenchido pela nota (pode editar)</div>}
            </Field>
            )}

            {/* VALOR + VENCIMENTO */}
            <div style={{ display: 'grid', gridTemplateColumns: formData.metodo === 'Boleto Parcelado' ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <Field label="Valor Total" icon={<Hash size={18} />}>
                <input type="number" step="0.01" placeholder="0,00" required style={inputIconStyle} value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} />
              </Field>
              {formData.metodo !== 'Boleto Parcelado' && (
                <Field label="Data de Vencimento" icon={<Calendar size={18} />}>
                  <input type="date" required style={inputIconStyle} onChange={e => setFormData({...formData, vencimento: e.target.value})} />
                </Field>
              )}
            </div>

            {/* PARCELAS — só aparece quando Boleto Parcelado */}
            {formData.metodo === 'Boleto Parcelado' && (
              <div style={{ padding: '20px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={16} style={{ color: '#0284c7' }} />
                  <label style={{ ...labelStyle, marginBottom: 0, color: '#0c4a6e' }}>Parcelamento</label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '13px', color: '#0c4a6e', fontWeight: '500', whiteSpace: 'nowrap' }}>Quantidade de Parcelas</label>
                  <input
                    type="number" min="2" max="48" value={qtdParcelas}
                    onChange={e => {
                      const qtd = Math.max(2, Math.min(48, parseInt(e.target.value) || 2))
                      setQtdParcelas(qtd)
                      const valorTotal = parseFloat(formData.valor) || 0
                      const valorParcela = valorTotal > 0 ? (valorTotal / qtd).toFixed(2) : ''
                      const novas = Array.from({ length: qtd }, (_, i) => ({
                        valor: valorParcela,
                        vencimento: parcelas[i]?.vencimento || ''
                      }))
                      setParcelas(novas)
                    }}
                    style={{ ...inputStyle, width: '80px', textAlign: 'center', padding: '10px' }}
                  />
                  <button type="button" onClick={() => {
                    const qtd = qtdParcelas
                    const valorTotal = parseFloat(formData.valor) || 0
                    const valorParcela = valorTotal > 0 ? (valorTotal / qtd).toFixed(2) : ''
                    const novas = Array.from({ length: qtd }, (_, i) => ({
                      valor: valorParcela,
                      vencimento: parcelas[i]?.vencimento || ''
                    }))
                    setParcelas(novas)
                  }} style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Gerar Parcelas
                  </button>
                </div>

                {formData.valor && parcelas.length > 0 && (
                  <div style={{ fontSize: '13px', color: '#0c4a6e', background: '#e0f2fe', padding: '10px 14px', borderRadius: '8px' }}>
                    {parcelas.length}x de R$ {(parseFloat(formData.valor) / parcelas.length).toFixed(2).replace('.', ',')}
                  </div>
                )}

                {parcelas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {parcelas.map((p, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '10px', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e0f2fe' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0c4a6e' }}>Parcela {i + 1}</span>
                        <input
                          type="number" step="0.01" placeholder="Valor"
                          value={p.valor}
                          onChange={e => {
                            const novas = [...parcelas]
                            novas[i] = { ...novas[i], valor: e.target.value }
                            setParcelas(novas)
                          }}
                          style={{ ...inputStyle, padding: '8px 10px', fontSize: '13px' }}
                        />
                        <input
                          type="date" required
                          value={p.vencimento}
                          onChange={e => {
                            const novas = [...parcelas]
                            novas[i] = { ...novas[i], vencimento: e.target.value }
                            setParcelas(novas)
                          }}
                          style={{ ...inputStyle, padding: '8px 10px', fontSize: '13px' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DESCRICAO */}
            <div>
              <label style={labelStyle}>Descricao ou Motivo</label>
              <textarea
                rows={3}
                placeholder="Descreva os detalhes deste lancamento..."
                required
                style={{ ...inputStyle, resize: 'none', minHeight: '80px' }}
                value={formData.motivo}
                onChange={e => setFormData({...formData, motivo: e.target.value})}
              />
            </div>

            {/* DOCUMENTOS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              <label style={{ ...labelStyle, marginBottom: '0' }}>Documentacao</label>

              {/* NF auto importada */}
              {nfAutoUrl && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '10px',
                  fontSize: '14px', color: '#16a34a'
                }}>
                  <CheckCircle size={18} />
                  <span style={{ flex: 1 }}>Nota Fiscal importada da requisicao</span>
                  <a href={nfAutoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a', display: 'flex' }}><ExternalLink size={16} /></a>
                  <span onClick={() => { setNfAutoUrl(null) }} style={{ color: '#ef4444', cursor: 'pointer', display: 'flex' }}><X size={16} /></span>
                </div>
              )}

              {/* NF manual — só aparece se não tem auto */}
              {!nfAutoUrl && formData.metodo !== 'Carnê ISS' && (
                <FileUploadBtn file={fileNFServ} onSelect={setFileNFServ} label="Nota Fiscal Principal" required />
              )}

              {/* Anexos importados das requisições */}
              {/* Requisições vinculadas — PDF de cada requisição */}
              {notaSelecionada && notaSelecionada.reqs.length > 0 && (
                <div style={{ padding: '14px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={16} />
                    {notaSelecionada.reqs.length} requisicao(oes) vinculadas
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {notaSelecionada.reqs.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid #dbeafe' }}>
                        <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>REQ</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>#{r.id}</span>
                        <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>R$ {r.valor_despeza || '0,00'}</span>
                        <a href={`/requisicoes/imprimir/${r.id}`} target="_blank" rel="noopener noreferrer" title="Ver/Imprimir PDF da Requisição" style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: '4px', fontWeight: '700', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileText size={10} /> PDF
                        </a>
                        {r.boleto_fornecedor && <a href={resolverUrlAnexo(r.boleto_fornecedor)} target="_blank" rel="noopener noreferrer" title="Ver Boleto" style={{ fontSize: '10px', background: '#f3e8ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', textDecoration: 'none' }}>BOL</a>}
                        {r.recibo_fornecedor && <a href={resolverUrlAnexo(r.recibo_fornecedor)} target="_blank" rel="noopener noreferrer" title="Ver Recibo" style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', textDecoration: 'none' }}>REC</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FileUploadBtn file={null} onSelect={null} label="Anexar Requisicoes Manualmente" isMulti filesReq={filesReq} setFilesReq={setFilesReq} />

              {filesReq.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  {filesReq.map((f, i) => (
                    <div key={i} style={{ fontSize: '12px', background: '#ffffff', color: '#1e293b', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e5e7eb' }}>
                      {f.name.substring(0, 20)}
                      <X size={14} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => setFilesReq(filesReq.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                  <button type="button" onClick={() => setFilesReq([])} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Limpar Tudo</button>
                </div>
              )}

              <FileUploadBtn file={null} onSelect={null} label="Anexar Boletos (Opcional)" isMulti filesReq={filesBoleto} setFilesReq={setFilesBoleto} />

              {filesBoleto.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  {filesBoleto.map((f, i) => (
                    <div key={i} style={{ fontSize: '12px', background: '#ffffff', color: '#1e293b', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e5e7eb' }}>
                      {f.name.substring(0, 20)}
                      <X size={14} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => setFilesBoleto(filesBoleto.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                  <button type="button" onClick={() => setFilesBoleto([])} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Limpar Tudo</button>
                </div>
              )}
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
              {loading ? 'Processando...' : <><CheckCircle size={18} /> Finalizar e Criar Registro</>}
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

function FileUploadBtn({ file, onSelect, label, required, isMulti, filesReq, setFilesReq }) {
  if (isMulti) {
    return (
      <label style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px',
        background: filesReq && filesReq.length > 0 ? '#dbeafe' : '#f8fafc',
        border: `1px ${filesReq && filesReq.length > 0 ? 'solid' : 'dashed'} ${filesReq && filesReq.length > 0 ? '#93c5fd' : '#d1d5db'}`,
        borderRadius: '10px', cursor: 'pointer', transition: '0.2s',
        fontSize: '14px', color: filesReq && filesReq.length > 0 ? '#1d4ed8' : '#6b7280'
      }}>
        {filesReq && filesReq.length > 0 ? <CheckCircle size={18} /> : <Paperclip size={18} />}
        <span style={{ flex: 1 }}>{filesReq && filesReq.length > 0 ? `${filesReq.length} Requisicoes Adicionadas` : label}</span>
        <input type="file" multiple hidden onChange={e => {
          const novos = Array.from(e.target.files);
          setFilesReq(prev => [...prev, ...novos]);
        }} />
      </label>
    )
  }

  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px',
      background: file ? '#f0fdf4' : '#f8fafc',
      border: `1px ${file ? 'solid' : 'dashed'} ${file ? '#86efac' : '#d1d5db'}`,
      borderRadius: '10px', cursor: 'pointer', transition: '0.2s',
      fontSize: '14px', color: file ? '#16a34a' : '#6b7280'
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
