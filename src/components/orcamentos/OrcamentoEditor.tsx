'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Search, Printer, ToggleLeft, ToggleRight, Package, Wrench, ArrowLeft, Users, Save, List, Eye, EyeOff } from 'lucide-react'
import {
  linhaPreenchida, linhasDoOrcamento, novaLinha, subtotalLinha, totaisServicos,
  agregadosLegados, type LinhaServico,
} from '@/lib/orcamentos/servicos'
import ModalBuscaProdutoOrc from './ModalBuscaProduto'
import ModalBuscaClienteOrc from './ModalBuscaCliente'
import ModalImportarKit from './ModalImportarKit'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import { useIsMobile } from '@/hooks/useIsMobile'

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
  podeEditar?: boolean
}

export default function OrcamentoEditor({ userName, editarId, onVoltar, podeEditar = true }: Props) {
  const isMobile = useIsMobile()
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

  // Serviços: cada linha é um serviço nomeado com a própria mão de obra e o
  // próprio deslocamento (liga/desliga por parte; desligada pode ainda
  // aparecer no PDF como "não cobrado")
  const [servicos, setServicos] = useState<LinhaServico[]>([novaLinha()])

  // Modal busca produto
  const [modalOpen, setModalOpen] = useState(false)
  const [linhaAlvo, setLinhaAlvo] = useState<number | null>(null)

  // Modal importar kit
  const [modalKitOpen, setModalKitOpen] = useState(false)

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
      const linhas = linhasDoOrcamento({ servicos: data.servicos, mao_obra: data.mao_obra, deslocamento: data.deslocamento })
      setServicos(linhas.length ? linhas : [novaLinha()])
      setOrcamentoId(data.id)
      setOrcamentoNumero(data.numero)
      setStatus(data.status || 'ativo')
      setCarregando(false)
    })
  }, [editarId])

  // Flags baseadas no tipo
  const mostrarPecas = tipo === 'pecas' || tipo === 'completo'
  const mostrarServicos = tipo === 'mao-de-obra' || tipo === 'completo'

  // Calculos (só as partes LIGADAS entram na soma)
  const totalPecas = mostrarPecas ? itens.reduce((s, i) => s + i.quantidade * i.preco, 0) : 0
  const totServ = totaisServicos(mostrarServicos ? servicos : [])
  const totalGeral = totalPecas + totServ.total

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

  function importarKit(produtos: { codigo: string; descricao: string; quantidade: number; preco: number }[], horas: number) {
    setItens(produtos.map(p => ({ codigo: p.codigo, descricao: p.descricao, quantidade: p.quantidade, preco: p.preco })))
    if (horas > 0 && (tipo === 'completo' || tipo === 'mao-de-obra')) {
      // horas do kit entram na 1ª linha de serviço
      setServicos(prev => {
        const base = prev.length ? prev : [novaLinha()]
        return base.map((l, i) => (i === 0 ? { ...l, maoObra: true, horas } : l))
      })
    }
  }

  // Funções dos serviços
  function atualizarServico(idx: number, patch: Partial<LinhaServico>) {
    setServicos(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function adicionarServico() {
    setServicos(prev => [...prev, novaLinha()])
  }

  function removerServico(idx: number) {
    setServicos(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
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

  // Montar payload para salvar: `servicos` (formato novo) + agregados legados
  // em mao_obra/deslocamento (gerar OS, importar e chips seguem funcionando)
  function montarPayload() {
    const itensValidos = mostrarPecas ? itens.filter(i => i.descricao.trim()) : []
    const linhasValidas = mostrarServicos ? servicos.filter(linhaPreenchida) : []
    const agg = agregadosLegados(linhasValidas)
    return {
      tipo: tipo!,
      cliente_nome: cliente.nome,
      cliente_documento: cliente.documento || null,
      cliente_endereco: cliente.endereco || null,
      cliente_cidade: cliente.cidade || null,
      observacao: observacao || null,
      validade: parseInt(validade) || 15,
      itens: itensValidos,
      servicos: linhasValidas.length ? linhasValidas : null,
      mao_obra: agg.mao_obra,
      deslocamento: agg.deslocamento,
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
    if (!podeEditar) { showToast('Você não tem permissão para salvar orçamentos.', 'error'); return }
    if (!cliente.nome.trim()) { showToast('Informe o cliente.', 'error'); return }
    setSalvando(true)
    try {
      const payload = montarPayload()
      if (orcamentoId) {
        // Update
        const { error } = await gravarOrcamento(payload, orcamentoId)
        if (error) throw error
        showToast('Orçamento atualizado!')
      } else {
        // Insert
        const numero = await gerarNumero()
        const { data, error } = await gravarOrcamento({ ...payload, numero }, null)
        if (error) throw error
        setOrcamentoId(data!.id)
        setOrcamentoNumero(data!.numero)
        showToast(`Orçamento ${data!.numero} salvo!`)
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
    const linhasValidas = mostrarServicos ? servicos.filter(linhaPreenchida) : []
    if (itensValidos.length === 0 && linhasValidas.length === 0) {
      showToast('Adicione ao menos um item ou serviço.', 'error')
      return
    }

    setGerando(true)
    try {
      // Salvar primeiro
      const payload = montarPayload()
      const agg = agregadosLegados(linhasValidas)
      let numero = orcamentoNumero
      if (orcamentoId) {
        await gravarOrcamento(payload, orcamentoId)
      } else {
        numero = await gerarNumero()
        const { data, error } = await gravarOrcamento({ ...payload, numero }, null)
        if (error) throw error
        setOrcamentoId(data!.id)
        setOrcamentoNumero(data!.numero)
        numero = data!.numero
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
          servicos: linhasValidas,
          maoObra: agg.mao_obra,
          deslocamento: agg.deslocamento,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, observacao, validade, itens, mostrarPecas, mostrarServicos, servicos, userName, orcamentoId, orcamentoNumero, status])

  function limparTudo() {
    setCliente({ nome: '', documento: '', endereco: '', cidade: '' })
    setClienteManual(false)
    setObservacao('')
    setValidade('15')
    setItens([{ codigo: '', descricao: '', quantidade: 1, preco: 0 }])
    setServicos([novaLinha()])
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
    setServicos([novaLinha()])
  }

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
      <div style={{ padding: 'clamp(24px, 6vw, 60px) clamp(14px, 4vw, 40px)', maxWidth: 900, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
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
              background: 'linear-gradient(135deg, #EA580C, #C2410C)',
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
              background: 'linear-gradient(135deg, #F97316, #EA580C)',
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
              background: 'linear-gradient(135deg, #C2410C, #991b1b)',
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
    <div style={{ padding: isMobile ? '16px 12px' : '32px 40px', width: '100%', fontFamily: "'Poppins', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 24px', borderRadius: 10,
          background: toast.type === 'error' ? '#fef2f2' : '#ecfdf5',
          color: toast.type === 'error' ? '#C2410C' : '#047857',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: isMobile ? 20 : 32 }}>
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
                  background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA',
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <button onClick={salvar} {...gateBtn(podeEditar, salvando)} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e5e5',
            background: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, opacity: salvando ? 0.6 : 1,
            ...estiloSemPermissao(podeEditar),
          }}>
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={gerarPDF} disabled={gerando} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #EA580C, #C2410C)',
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
        padding: isMobile ? 16 : 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Linha cliente */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cliente <span style={{ color: '#EA580C' }}>*</span></label>
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr', gap: 10 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 16 }}>
          <div>
            <label style={labelStyle}>Observação <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>( **texto** = negrito )</span></label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Obs. do orçamento... Use **texto** para grifo/negrito"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 42, fontFamily: 'inherit' }}
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
            padding: isMobile ? '14px 16px' : '16px 28px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Peças / Produtos</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalKitOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 8, border: '1px solid #FED7AA', background: '#FFF7ED',
                color: '#EA580C', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                <Package size={14} /> Importar Kit
              </button>
              <button onClick={adicionarLinha} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2',
                color: '#EA580C', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                <Plus size={14} /> Linha
              </button>
            </div>
          </div>
          {isMobile ? (
            /* CELULAR: cada peça vira um cartão (sem rolagem horizontal) */
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {itens.map((item, idx) => (
                <div key={idx} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a3a3a3' }}>Item {idx + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>R$ {fmt(item.quantidade * item.preco)}</span>
                      {itens.length > 1 && (
                        <button onClick={() => removerLinha(idx)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbcbcb', padding: 2 }}><Trash2 size={16} /></button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={item.codigo} onChange={e => atualizarItem(idx, 'codigo', e.target.value)} placeholder="Código" style={{ ...inputStyle, flex: 1, fontSize: 13, padding: '9px 12px' }} />
                    <button onClick={() => abrirBusca(idx)} title="Buscar produto" style={{ padding: '0 14px', borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}><Search size={15} color="#737373" /></button>
                  </div>
                  <input value={item.descricao} onChange={e => atualizarItem(idx, 'descricao', e.target.value)} placeholder="Descrição do item..." style={{ ...inputStyle, fontSize: 13, padding: '9px 12px', marginBottom: 8 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 10 }}>Qtd</label>
                      <input type="number" min={0.5} step={0.5} value={item.quantidade} onChange={e => atualizarItem(idx, 'quantidade', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, fontSize: 13, padding: '9px 12px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 10 }}>Unit. (R$)</label>
                      <input type="number" min={0} step={0.01} value={item.preco} onChange={e => atualizarItem(idx, 'preco', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, fontSize: 13, padding: '9px 12px' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: undefined, borderCollapse: 'collapse' }}>
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
          )}
          {itens.some(i => i.descricao.trim()) && (
            <div style={{
              padding: '12px 28px', borderTop: '1px solid #f0f0f0',
              textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1a1a1a',
            }}>
              Subtotal Peças: <span style={{ color: '#EA580C' }}>R$ {fmt(totalPecas)}</span>
            </div>
          )}
        </div>
      )}

      {/* Serviços (mão de obra + deslocamento por serviço) */}
      {mostrarServicos && (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
          overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            padding: isMobile ? '14px 16px' : '16px 28px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Serviços</span>
              {!isMobile && (
                <span style={{ fontSize: 11, color: '#a3a3a3', marginLeft: 10 }}>
                  mão de obra e deslocamento separados por serviço
                </span>
              )}
            </div>
            <button onClick={adicionarServico} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2',
              color: '#EA580C', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <Plus size={14} /> Serviço
            </button>
          </div>

          <div style={{ padding: isMobile ? 12 : 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {servicos.map((s, idx) => (
              <div key={idx} style={{ border: '1px solid #eee', borderRadius: 12, background: '#fafafa', overflow: 'hidden' }}>
                {/* Cabeçalho do serviço */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: isMobile ? '10px 12px' : '12px 16px',
                  borderBottom: '1px solid #f0f0f0', background: '#fff',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, background: '#FFF7ED', color: '#EA580C',
                    border: '1px solid #FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  <input
                    value={s.descricao}
                    onChange={e => atualizarServico(idx, { descricao: e.target.value })}
                    placeholder="Nome do serviço (ex.: Troca de embreagem)"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, padding: '8px 12px' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
                    R$ {fmt(subtotalLinha(s))}
                  </span>
                  {servicos.length > 1 && (
                    <button onClick={() => removerServico(idx)} title="Remover serviço" style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#cbcbcb', padding: 2, flexShrink: 0,
                    }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Mão de obra + Deslocamento do serviço */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 14, padding: isMobile ? 12 : 16 }}>
                  <ParteServico
                    titulo="Mão de obra"
                    ligado={s.maoObra}
                    mostrar={s.mostrarMO}
                    valorBruto={s.horas * s.valorHora}
                    onToggle={() => atualizarServico(idx, { maoObra: !s.maoObra })}
                    onMostrar={() => atualizarServico(idx, { mostrarMO: !s.mostrarMO })}
                    campos={[
                      { label: 'Valor/Hora (R$)', value: s.valorHora, step: 1, onChange: v => atualizarServico(idx, { valorHora: v }) },
                      { label: 'Horas', value: s.horas, step: 0.5, onChange: v => atualizarServico(idx, { horas: v }) },
                    ]}
                  />
                  <ParteServico
                    titulo="Deslocamento"
                    ligado={s.desloc}
                    mostrar={s.mostrarDesloc}
                    valorBruto={s.km * s.valorKm}
                    onToggle={() => atualizarServico(idx, { desloc: !s.desloc })}
                    onMostrar={() => atualizarServico(idx, { mostrarDesloc: !s.mostrarDesloc })}
                    campos={[
                      { label: 'Valor/Km (R$)', value: s.valorKm, step: 0.1, onChange: v => atualizarServico(idx, { valorKm: v }) },
                      { label: 'Km', value: s.km, step: 1, onChange: v => atualizarServico(idx, { km: v }) },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>

          {totServ.total > 0 && (
            <div style={{
              padding: '12px 28px', borderTop: '1px solid #f0f0f0',
              textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1a1a1a',
            }}>
              Subtotal Serviços: <span style={{ color: '#EA580C' }}>R$ {fmt(totServ.total)}</span>
            </div>
          )}
        </div>
      )}

      {/* Total Geral */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a, #262626)', borderRadius: 16,
        padding: isMobile ? '18px 18px' : '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#a3a3a3', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const }}>
            Total do Orçamento
          </div>
          <div style={{ fontSize: 11, color: '#737373', marginTop: 4 }}>
            {mostrarPecas && `${itens.filter(i => i.descricao.trim()).length} ite${itens.filter(i => i.descricao.trim()).length !== 1 ? 'ns' : 'm'}`}
            {mostrarServicos && totServ.horas > 0 && `${mostrarPecas ? ' + ' : ''}${totServ.horas}h mão de obra`}
            {mostrarServicos && totServ.km > 0 && ` + ${totServ.km}km`}
            {mostrarServicos && servicos.filter(linhaPreenchida).length > 1 && ` · ${servicos.filter(linhaPreenchida).length} serviços`}
          </div>
        </div>
        <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 900, color: '#fff' }}>
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
      <ModalImportarKit
        open={modalKitOpen}
        onClose={() => setModalKitOpen(false)}
        onImportar={importarKit}
      />
    </div>
  )
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Grava o orçamento com RETRY sem a coluna `servicos`: enquanto a migration
// sql/orcamentos-servicos.sql não for aplicada, o save cai no formato antigo
// (só os agregados) em vez de quebrar.
async function gravarOrcamento(payload: Record<string, unknown>, id: number | null) {
  const tentar = (p: Record<string, unknown>) =>
    id
      ? supabase.from('orcamentos').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select('id, numero').single()
      : supabase.from('orcamentos').insert([p]).select('id, numero').single()
  let r = await tentar(payload)
  if (r.error && 'servicos' in payload && /servicos/i.test(r.error.message || '')) {
    const { servicos: _semColuna, ...resto } = payload
    r = await tentar(resto)
  }
  return r
}

// Um dos dois blocos de um serviço (Mão de obra / Deslocamento): toggle
// Incluído/Desativado e, quando desativado, a escolha de ainda MOSTRAR no PDF
// como "não cobrado" (cortesia visível) ou esconder de vez.
function ParteServico({ titulo, ligado, mostrar, valorBruto, onToggle, onMostrar, campos }: {
  titulo: string
  ligado: boolean
  mostrar: boolean
  valorBruto: number
  onToggle: () => void
  onMostrar: () => void
  campos: { label: string; value: number; step: number; onChange: (v: number) => void }[]
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: ligado ? '#1a1a1a' : '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
          {titulo}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!ligado && (
            <button
              onClick={onMostrar}
              title={mostrar ? 'Vai aparecer no PDF como cortesia, sem somar no total' : 'Não aparece no PDF'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8,
                border: mostrar ? '1px solid #FDE68A' : '1px solid #e5e5e5',
                background: mostrar ? '#FFFBEB' : 'transparent', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, color: mostrar ? '#B45309' : '#a3a3a3',
              }}
            >
              {mostrar ? <Eye size={13} /> : <EyeOff size={13} />}
              {mostrar ? 'Mostra no PDF (não cobrado)' : 'Oculto no PDF'}
            </button>
          )}
          <button
            onClick={onToggle}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: ligado ? '#047857' : '#a3a3a3' }}
          >
            {ligado ? <ToggleRight size={22} color="#047857" /> : <ToggleLeft size={22} color="#d4d4d4" />}
            {ligado ? 'Incluído' : 'Desativado'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: ligado ? 1 : mostrar ? 0.75 : 0.45 }}>
        {campos.map(c => (
          <div key={c.label}>
            <label style={{ ...labelStyle, fontSize: 10 }}>{c.label}</label>
            <input
              type="number" min={0} step={c.step}
              value={c.value}
              onChange={e => c.onChange(parseFloat(e.target.value) || 0)}
              style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }}
            />
          </div>
        ))}
        <div style={{ gridColumn: '1/-1', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
          {ligado ? (
            <span style={{ color: '#1a1a1a' }}>Total: <span style={{ color: '#EA580C' }}>R$ {fmt(valorBruto)}</span></span>
          ) : mostrar ? (
            <span style={{ color: '#B45309' }}><s>R$ {fmt(valorBruto)}</s> · não cobrado — sai no PDF</span>
          ) : (
            <span style={{ color: '#a3a3a3' }}>não entra no orçamento</span>
          )}
        </div>
      </div>
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
