'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Search, Printer, ToggleLeft, ToggleRight, Package, Wrench, ArrowLeft, Users, Save, List } from 'lucide-react'
import ModalBuscaProdutoOrc from './ModalBuscaProduto'
import ModalBuscaClienteOrc from './ModalBuscaCliente'

type TipoOrcamento = 'pecas' | 'mao-de-obra' | 'completo'

interface LinhaItem {
  codigo: string
  descricao: string
  quantidade: number
  preco: number
}

interface DadosCliente {
  nome: string
  documento: string
  endereco: string
  cidade: string
}

interface Props {
  userName: string
  editarId?: number | null
  onVoltar?: () => void
}

export default function OrcamentoEditor({ userName, editarId, onVoltar }: Props) {
  // Etapa: escolha ou editor
  const [tipo, setTipo] = useState<TipoOrcamento | null>(null)

  // Cliente
  const [cliente, setCliente] = useState<DadosCliente>({ nome: '', documento: '', endereco: '', cidade: '' })
  const [clienteManual, setClienteManual] = useState(false)
  const [modalClienteOpen, setModalClienteOpen] = useState(false)

  // Dados do orçamento
  const [observacao, setObservacao] = useState('')
  const [validade, setValidade] = useState('15')

  // Itens (planilha)
  const [itens, setItens] = useState<LinhaItem[]>([
    { codigo: '', descricao: '', quantidade: 1, preco: 0 },
  ])

  // Mão de obra
  const [incluirMaoObra, setIncluirMaoObra] = useState(true)
  const [valorHora, setValorHora] = useState(193)
  const [quantidadeHoras, setQuantidadeHoras] = useState(1)

  // Deslocamento
  const [incluirDeslocamento, setIncluirDeslocamento] = useState(true)
  const [valorKm, setValorKm] = useState(2.8)
  const [quantidadeKm, setQuantidadeKm] = useState(0)

  // Modal busca produto
  const [modalOpen, setModalOpen] = useState(false)
  const [linhaAlvo, setLinhaAlvo] = useState<number | null>(null)

  // Gerando PDF / Salvando
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // ID e número do orçamento carregado
  const [orcamentoId, setOrcamentoId] = useState<number | null>(editarId || null)
  const [orcamentoNumero, setOrcamentoNumero] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(!!editarId)

  // Status
  const [status, setStatus] = useState('ativo')

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string, type = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // Carregar orçamento existente
  useEffect(() => {
    if (!editarId) return
    setCarregando(true)
    supabase.from('orcamentos').select('*').eq('id', editarId).single().then(({ data }) => {
      if (!data) { setCarregando(false); return }
      setTipo(data.tipo as TipoOrcamento)
      setCliente({
        nome: data.cliente_nome || '',
        documento: data.cliente_documento || '',
        endereco: data.cliente_endereco || '',
        cidade: data.cliente_cidade || '',
      })
      setObservacao(data.observacao || '')
      setValidade(String(data.validade || 15))
      setItens(data.itens?.length ? data.itens : [{ codigo: '', descricao: '', quantidade: 1, preco: 0 }])
      if (data.mao_obra) {
        setIncluirMaoObra(true)
        setValorHora(data.mao_obra.valorHora || 193)
        setQuantidadeHoras(data.mao_obra.horas || 1)
      } else {
        setIncluirMaoObra(false)
      }
      if (data.deslocamento) {
        setIncluirDeslocamento(true)
        setValorKm(data.deslocamento.valorKm || 2.8)
        setQuantidadeKm(data.deslocamento.km || 0)
      } else {
        setIncluirDeslocamento(false)
      }
      setOrcamentoId(data.id)
      setOrcamentoNumero(data.numero)
      setStatus(data.status || 'ativo')
      setCarregando(false)
    })
  }, [editarId])

  // Flags baseadas no tipo
  const mostrarPecas = tipo === 'pecas' || tipo === 'completo'
  const mostrarMaoObra = tipo === 'mao-de-obra' || tipo === 'completo'
  const mostrarDeslocamento = tipo === 'mao-de-obra' || tipo === 'completo'

  // Calculos
  const totalPecas = mostrarPecas ? itens.reduce((s, i) => s + i.quantidade * i.preco, 0) : 0
  const totalMaoObra = mostrarMaoObra && incluirMaoObra ? valorHora * quantidadeHoras : 0
  const totalDeslocamento = mostrarDeslocamento && incluirDeslocamento ? valorKm * quantidadeKm : 0
  const totalGeral = totalPecas + totalMaoObra + totalDeslocamento

  // Funções da planilha
  function atualizarItem(idx: number, campo: keyof LinhaItem, valor: string | number) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [campo]: valor } : item))
  }

  function adicionarLinha() {
    setItens(prev => [...prev, { codigo: '', descricao: '', quantidade: 1, preco: 0 }])
  }

  function removerLinha(idx: number) {
    if (itens.length <= 1) return
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  function abrirBusca(idx: number) {
    setLinhaAlvo(idx)
    setModalOpen(true)
  }

  function selecionarProduto(codigo: string, descricao: string, preco: number) {
    if (linhaAlvo === null) return
    setItens(prev => prev.map((item, i) =>
      i === linhaAlvo ? { ...item, codigo, descricao, preco } : item
    ))
  }

  function selecionarCliente(nome: string, documento: string, endereco: string, cidade: string) {
    setCliente({ nome, documento, endereco, cidade })
    setClienteManual(false)
  }

  function handleTabUltimaColuna(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'Tab' && !e.shiftKey && idx === itens.length - 1) {
      e.preventDefault()
      adicionarLinha()
      setTimeout(() => {
        const input = document.querySelector(`[data-row="${idx + 1}"][data-col="codigo"]`) as HTMLInputElement
        input?.focus()
      }, 50)
    }
  }

  // Montar payload para salvar
  function montarPayload() {
    const itensValidos = mostrarPecas ? itens.filter(i => i.descricao.trim()) : []
    return {
      tipo: tipo!,
      cliente_nome: cliente.nome,
      cliente_documento: cliente.documento || null,
      cliente_endereco: cliente.endereco || null,
      cliente_cidade: cliente.cidade || null,
      observacao: observacao || null,
      validade: parseInt(validade) || 15,
      itens: itensValidos,
      mao_obra: mostrarMaoObra && incluirMaoObra ? { valorHora, horas: quantidadeHoras } : null,
      deslocamento: mostrarDeslocamento && incluirDeslocamento ? { valorKm, km: quantidadeKm } : null,
      total: totalGeral,
      criado_por: userName,
      status,
    }
  }

  // Gerar número sequencial
  async function gerarNumero(): Promise<string> {
    const { data } = await supabase
      .from('orcamentos')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    const prox = (data?.[0]?.id || 0) + 1
    return `ORC-${String(prox).padStart(4, '0')}`
  }

  // Salvar (sem gerar PDF)
  async function salvar() {
    if (!cliente.nome.trim()) { showToast('Informe o cliente.', 'error'); return }
    setSalvando(true)
    try {
      const payload = montarPayload()
      if (orcamentoId) {
        // Update
        const { error } = await supabase.from('orcamentos').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', orcamentoId)
        if (error) throw error
        showToast('Orçamento atualizado!')
      } else {
        // Insert
        const numero = await gerarNumero()
        const { data, error } = await supabase.from('orcamentos').insert([{ ...payload, numero }]).select('id, numero').single()
        if (error) throw error
        setOrcamentoId(data.id)
        setOrcamentoNumero(data.numero)
        showToast(`Orçamento ${data.numero} salvo!`)
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'error')
    }
    setSalvando(false)
  }

  // Gerar PDF (salva primeiro)
  const gerarPDF = useCallback(async () => {
    if (!cliente.nome.trim()) { showToast('Informe o cliente.', 'error'); return }
    const itensValidos = mostrarPecas ? itens.filter(i => i.descricao.trim()) : []
    if (itensValidos.length === 0 && !mostrarMaoObra && !mostrarDeslocamento) {
      showToast('Adicione ao menos um item ou serviço.', 'error')
      return
    }

    setGerando(true)
    try {
      // Salvar primeiro
      const payload = montarPayload()
      let numero = orcamentoNumero
      if (orcamentoId) {
        await supabase.from('orcamentos').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', orcamentoId)
      } else {
        numero = await gerarNumero()
        const { data, error } = await supabase.from('orcamentos').insert([{ ...payload, numero }]).select('id, numero').single()
        if (error) throw error
        setOrcamentoId(data.id)
        setOrcamentoNumero(data.numero)
        numero = data.numero
      }

      // Gerar PDF
      const res = await fetch('/api/orcamentos/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero,
          cliente: cliente.nome,
          documento: cliente.documento,
          endereco: cliente.endereco,
          cidade: cliente.cidade,
          observacao,
          validade: parseInt(validade) || 15,
          itens: itensValidos.map(i => ({
            codigo: i.codigo,
            descricao: i.descricao,
            quantidade: i.quantidade,
            preco: i.preco,
          })),
          maoObra: mostrarMaoObra && incluirMaoObra ? { valorHora, horas: quantidadeHoras } : null,
          deslocamento: mostrarDeslocamento && incluirDeslocamento ? { valorKm, km: quantidadeKm } : null,
          userName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar PDF')

      const win = window.open('', '_blank')
      if (win) {
        win.document.write(data.html)
        win.document.close()
      }
      showToast(`Orçamento ${numero} gerado!`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao gerar', 'error')
    }
    setGerando(false)
  }, [cliente, observacao, validade, itens, mostrarPecas, mostrarMaoObra, incluirMaoObra, valorHora, quantidadeHoras, incluirDeslocamento, valorKm, quantidadeKm, userName, orcamentoId, orcamentoNumero])

  function limparTudo() {
    setCliente({ nome: '', documento: '', endereco: '', cidade: '' })
    setClienteManual(false)
    setObservacao('')
    setValidade('15')
    setItens([{ codigo: '', descricao: '', quantidade: 1, preco: 0 }])
    setIncluirMaoObra(true)
    setValorHora(193)
    setQuantidadeHoras(1)
    setIncluirDeslocamento(true)
    setValorKm(2.8)
    setQuantidadeKm(0)
    setOrcamentoId(null)
    setOrcamentoNumero(null)
    setStatus('ativo')
  }

  function voltar() {
    if (onVoltar) { onVoltar(); return }
    limparTudo()
    setTipo(null)
  }

  function escolherTipo(t: TipoOrcamento) {
    setTipo(t)
    if (t === 'pecas') {
      setIncluirMaoObra(false)
    } else if (t === 'mao-de-obra') {
      setIncluirMaoObra(true)
    } else {
      setIncluirMaoObra(true)
    }
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (carregando) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: "'Poppins', sans-serif" }}>
        <p style={{ color: '#a3a3a3', fontSize: 15, letterSpacing: 2 }}>Carregando orçamento...</p>
      </div>
    )
  }

  // ============================
  // TELA DE ESCOLHA
  // ============================
  if (!tipo) {
    return (
      <div style={{ padding: '60px 40px', maxWidth: 900, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
        {/* Botão voltar para lista */}
        {onVoltar && (
          <button onClick={onVoltar} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            borderRadius: 10, border: '1px solid #e5e5e5', background: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#737373', marginBottom: 24,
          }}>
            <List size={16} /> Voltar para Lista
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>
            Novo Orçamento
          </h1>
          <p style={{ fontSize: 15, color: '#737373', marginTop: 8 }}>
            Qual tipo de orçamento você quer montar?
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {/* Peças */}
          <button
            onClick={() => escolherTipo('pecas')}
            style={{
              padding: '36px 24px', borderRadius: 20, border: '2px solid #f0f0f0',
              background: '#fff', cursor: 'pointer', textAlign: 'center',
              transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(220,38,38,0.2)',
            }}>
              <Package size={28} color="#fff" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Peças</div>
            <div style={{ fontSize: 13, color: '#737373', lineHeight: 1.5 }}>
              Orçamento com produtos e peças do catálogo ou manuais
            </div>
          </button>

          {/* Mão de Obra */}
          <button
            onClick={() => escolherTipo('mao-de-obra')}
            style={{
              padding: '36px 24px', borderRadius: 20, border: '2px solid #f0f0f0',
              background: '#fff', cursor: 'pointer', textAlign: 'center',
              transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(220,38,38,0.2)',
            }}>
              <Wrench size={28} color="#fff" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Mão de Obra</div>
            <div style={{ fontSize: 13, color: '#737373', lineHeight: 1.5 }}>
              Orçamento de serviço com horas de trabalho e deslocamento
            </div>
          </button>

          {/* Completo */}
          <button
            onClick={() => escolherTipo('completo')}
            style={{
              padding: '36px 24px', borderRadius: 20, border: '2px solid #f0f0f0',
              background: '#fff', cursor: 'pointer', textAlign: 'center',
              transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(220,38,38,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #b91c1c, #991b1b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(220,38,38,0.2)',
            }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <Package size={20} color="#fff" />
                <Wrench size={20} color="#fff" />
              </div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Completo</div>
            <div style={{ fontSize: 13, color: '#737373', lineHeight: 1.5 }}>
              Peças + mão de obra + deslocamento em um só orçamento
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ============================
  // TELA DO EDITOR
  // ============================
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 24px', borderRadius: 10,
          background: toast.type === 'error' ? '#fef2f2' : '#ecfdf5',
          color: toast.type === 'error' ? '#b91c1c' : '#047857',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={voltar} style={{
            padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e5e5',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <ArrowLeft size={18} color="#737373" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>
                {orcamentoNumero ? orcamentoNumero : 'Novo Orçamento'}
              </h1>
              {orcamentoNumero && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                }}>
                  {tipo === 'pecas' ? 'Peças' : tipo === 'mao-de-obra' ? 'Mão de Obra' : 'Completo'}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
              {orcamentoNumero ? 'Editando orçamento salvo' : 'Monte como uma planilha — simples e direto.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Status selector */}
          {orcamentoId && (
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{
                padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
                fontSize: 12, fontWeight: 600, outline: 'none', fontFamily: "'Poppins', sans-serif",
                cursor: 'pointer',
              }}
            >
              <option value="ativo">Ativo</option>
              <option value="aprovado">Aprovado</option>
              <option value="rejeitado">Rejeitado</option>
              <option value="expirado">Expirado</option>
            </select>
          )}
          <button onClick={limparTudo} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e5e5',
            background: '#fff', color: '#737373', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Limpar
          </button>
          <button onClick={salvar} disabled={salvando} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e5e5',
            background: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, opacity: salvando ? 0.6 : 1,
          }}>
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={gerarPDF} disabled={gerando} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: gerando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Printer size={16} />
            {gerando ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </div>
      </div>

      {/* Cliente + Info */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
        padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Linha cliente */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cliente <span style={{ color: '#dc2626' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={cliente.nome}
                onChange={e => { setCliente(prev => ({ ...prev, nome: e.target.value })); setClienteManual(true) }}
                placeholder="Nome do cliente..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => setModalClienteOpen(true)}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid #e5e5e5',
                  background: '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: '#737373', whiteSpace: 'nowrap',
                }}
              >
                <Users size={14} /> Buscar no Banco
              </button>
            </div>
          </div>
        </div>

        {/* Dados complementares do cliente (opcionais) */}
        <div style={{
          padding: '14px 16px', borderRadius: 10, background: '#fafafa',
          border: '1px dashed #e5e5e5', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: '#a3a3a3', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Dados complementares</span>
            <span style={{
              background: '#fff', padding: '2px 8px', borderRadius: 12,
              fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'none' as const, letterSpacing: 0,
            }}>
              Opcional — preencha só se tiver em mãos
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
            <div>
              <label style={{ ...labelStyle, fontSize: 10 }}>CPF / CNPJ</label>
              <input
                value={cliente.documento}
                onChange={e => setCliente(prev => ({ ...prev, documento: e.target.value }))}
                placeholder="Opcional"
                style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Endereço</label>
              <input
                value={cliente.endereco}
                onChange={e => setCliente(prev => ({ ...prev, endereco: e.target.value }))}
                placeholder="Opcional"
                style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Cidade</label>
              <input
                value={cliente.cidade}
                onChange={e => setCliente(prev => ({ ...prev, cidade: e.target.value }))}
                placeholder="Opcional"
                style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }}
              />
            </div>
          </div>
        </div>

        {/* Obs e validade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
          <div>
            <label style={labelStyle}>Observação</label>
            <input
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Obs. do orçamento..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Validade (dias)</label>
            <input
              type="number"
              value={validade}
              onChange={e => setValidade(e.target.value)}
              style={{ ...inputStyle, width: 100, textAlign: 'center' as const }}
            />
          </div>
        </div>
      </div>

      {/* Planilha de Peças */}
      {mostrarPecas && (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
          overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            padding: '16px 28px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Peças / Produtos</span>
            <button onClick={adicionarLinha} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2',
              color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <Plus size={14} /> Linha
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, width: '15%' }}>CÓDIGO</th>
                  <th style={{ ...thStyle, width: '40%' }}>DESCRIÇÃO</th>
                  <th style={{ ...thStyle, width: '12%', textAlign: 'center' }}>QTD</th>
                  <th style={{ ...thStyle, width: '15%', textAlign: 'right' }}>UNIT. (R$)</th>
                  <th style={{ ...thStyle, width: '13%', textAlign: 'right' }}>SUBTOTAL</th>
                  <th style={{ ...thStyle, width: 40, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ ...tdStyle, color: '#a3a3a3', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                      {idx + 1}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          data-row={idx}
                          data-col="codigo"
                          value={item.codigo}
                          onChange={e => atualizarItem(idx, 'codigo', e.target.value)}
                          placeholder="Código"
                          style={cellInputStyle}
                        />
                        <button
                          onClick={() => abrirBusca(idx)}
                          style={{
                            padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e5e5',
                            background: '#fafafa', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', flexShrink: 0,
                          }}
                          title="Buscar produto cadastrado"
                        >
                          <Search size={13} color="#737373" />
                        </button>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={item.descricao}
                        onChange={e => atualizarItem(idx, 'descricao', e.target.value)}
                        placeholder="Descrição do item..."
                        style={cellInputStyle}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={item.quantidade}
                        onChange={e => atualizarItem(idx, 'quantidade', parseFloat(e.target.value) || 0)}
                        style={{ ...cellInputStyle, textAlign: 'center' as const }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.preco}
                        onChange={e => atualizarItem(idx, 'preco', parseFloat(e.target.value) || 0)}
                        onKeyDown={e => handleTabUltimaColuna(e, idx)}
                        style={{ ...cellInputStyle, textAlign: 'right' as const }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#1a1a1a', fontSize: 13 }}>
                      R$ {fmt(item.quantidade * item.preco)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {itens.length > 1 && (
                        <button
                          onClick={() => removerLinha(idx)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#d4d4d4', padding: 4,
                          }}
                          title="Remover linha"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {itens.some(i => i.descricao.trim()) && (
            <div style={{
              padding: '12px 28px', borderTop: '1px solid #f0f0f0',
              textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1a1a1a',
            }}>
              Subtotal Peças: <span style={{ color: '#dc2626' }}>R$ {fmt(totalPecas)}</span>
            </div>
          )}
        </div>
      )}

      {/* Mão de obra e Deslocamento */}
      {(mostrarMaoObra || mostrarDeslocamento) && (
      <div style={{ display: 'grid', gridTemplateColumns: mostrarMaoObra && mostrarDeslocamento ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        {/* Mão de Obra */}
        {mostrarMaoObra && (
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
            padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Mão de Obra</span>
              <button
                onClick={() => setIncluirMaoObra(!incluirMaoObra)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: incluirMaoObra ? '#047857' : '#a3a3a3' }}
              >
                {incluirMaoObra ? <ToggleRight size={22} color="#047857" /> : <ToggleLeft size={22} color="#d4d4d4" />}
                {incluirMaoObra ? 'Incluído' : 'Desativado'}
              </button>
            </div>
            {incluirMaoObra && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Valor/Hora (R$)</label>
                  <input
                    type="number" min={0} step={1}
                    value={valorHora}
                    onChange={e => setValorHora(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Horas</label>
                  <input
                    type="number" min={0} step={0.5}
                    value={quantidadeHoras}
                    onChange={e => setQuantidadeHoras(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ gridColumn: '1/-1', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                  Total: <span style={{ color: '#dc2626' }}>R$ {fmt(totalMaoObra)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deslocamento */}
        {mostrarDeslocamento && (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
          padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Deslocamento</span>
            <button
              onClick={() => setIncluirDeslocamento(!incluirDeslocamento)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: incluirDeslocamento ? '#047857' : '#a3a3a3' }}
            >
              {incluirDeslocamento ? <ToggleRight size={22} color="#047857" /> : <ToggleLeft size={22} color="#d4d4d4" />}
              {incluirDeslocamento ? 'Incluído' : 'Desativado'}
            </button>
          </div>
          {incluirDeslocamento && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Valor/Km (R$)</label>
                <input
                  type="number" min={0} step={0.1}
                  value={valorKm}
                  onChange={e => setValorKm(parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Km</label>
                <input
                  type="number" min={0} step={1}
                  value={quantidadeKm}
                  onChange={e => setQuantidadeKm(parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: '1/-1', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                Total: <span style={{ color: '#dc2626' }}>R$ {fmt(totalDeslocamento)}</span>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {/* Total Geral */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a, #262626)', borderRadius: 16,
        padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#a3a3a3', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const }}>
            Total do Orçamento
          </div>
          <div style={{ fontSize: 11, color: '#737373', marginTop: 4 }}>
            {mostrarPecas && `${itens.filter(i => i.descricao.trim()).length} ite${itens.filter(i => i.descricao.trim()).length !== 1 ? 'ns' : 'm'}`}
            {mostrarMaoObra && incluirMaoObra && `${mostrarPecas ? ' + ' : ''}${quantidadeHoras}h mão de obra`}
            {mostrarDeslocamento && incluirDeslocamento && quantidadeKm > 0 && ` + ${quantidadeKm}km`}
          </div>
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>
          R$ {fmt(totalGeral)}
        </div>
      </div>

      {/* Modais */}
      <ModalBuscaProdutoOrc
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={selecionarProduto}
      />
      <ModalBuscaClienteOrc
        open={modalClienteOpen}
        onClose={() => setModalClienteOpen(false)}
        onSelect={selecionarCliente}
      />
    </div>
  )
}

// Estilos
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#737373',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid #e5e5e5', fontSize: 14, outline: 'none',
  fontFamily: "'Poppins', sans-serif",
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: 10, fontWeight: 800,
  color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '2px solid #f0f0f0', textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 13,
}

const cellInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid transparent', fontSize: 13,
  outline: 'none', fontFamily: "'Poppins', sans-serif",
  background: 'transparent', transition: 'border-color 0.15s',
}
