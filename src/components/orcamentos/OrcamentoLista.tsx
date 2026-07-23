'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, FileText, Trash2, Plus, FilterX, Package, Wrench, Send, Printer } from 'lucide-react'
import { gateBtn, estiloSemPermissao, MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui'

interface Orcamento {
  id: number
  numero: string
  tipo: string
  cliente_nome: string
  cliente_cidade: string
  total: number
  status: string
  criado_por: string
  created_at: string
}

interface Props {
  onNovo: () => void
  onEditar: (id: number) => void
  podeCriar?: boolean
  podeEditar?: boolean
  podeExcluir?: boolean
  podeStatus?: boolean
  podeGerar?: boolean
}

export default function OrcamentoLista({ onNovo, onEditar, podeCriar = true, podeEditar = true, podeExcluir = true, podeStatus = true, podeGerar = true }: Props) {
  const [lista, setLista] = useState<Orcamento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [gerarModal, setGerarModal] = useState<{ id: number; tipoOrc: string } | null>(null)
  const [tecnicoGerar, setTecnicoGerar] = useState('')
  const [tecnicos, setTecnicos] = useState<string[]>([])
  const [gerando, setGerando] = useState(false)

  useEffect(() => { carregar() }, [])

  // Lista de técnicos — mesma fonte do POS/PPV
  useEffect(() => {
    fetch('/api/pos/tecnicos')
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setTecnicos(d) })
      .catch(() => {})
  }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select('id, numero, tipo, cliente_nome, cliente_cidade, total, status, criado_por, created_at')
      .order('id', { ascending: false })
    setLista(data || [])
    setLoading(false)
  }

  async function excluir(id: number) {
    if (!confirm('Tem certeza que deseja excluir este orçamento?')) return
    await supabase.from('orcamentos').delete().eq('id', id)
    carregar()
  }

  async function alterarStatus(id: number, novoStatus: string) {
    await supabase.from('orcamentos').update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', id)
    setLista(prev => prev.map(o => o.id === id ? { ...o, status: novoStatus } : o))
  }

  async function confirmarGerar() {
    if (!gerarModal || !tecnicoGerar.trim()) return
    setGerando(true)
    try {
      const { data: orc } = await supabase.from('orcamentos').select('*').eq('id', gerarModal.id).single()
      if (!orc) throw new Error('Orçamento não encontrado')

      // Roteamento pelo tipo do orçamento:
      //  - peças       → só PPV
      //  - mão de obra → só OS (POS)
      //  - completo    → OS (POS) + PPV vinculado (o gerarPPV abaixo cuida disso quando há peças)
      const gerarOS = gerarModal.tipoOrc !== 'pecas'

      if (gerarOS) {
        const horas = orc.mao_obra?.horas || 0
        const km = orc.deslocamento?.km || 0
        const itensDesc = (orc.itens || []).map((i: any) => `${i.quantidade}x ${i.descricao}`).join(', ')
        // Descrição da OS: mantém o template padrão do POS e coloca as Observações
        // do orçamento DEPOIS de "Serviço Realizado:", sem apagar o resto do bloco.
        // (Antes a descrição virava só "Ref. Orçamento …", perdendo o template.)
        const TEMPLATE = "Modelo: \nChassis: \nHorimetro: \n\nSolicitação do cliente: \nServiço Realizado: "
        const marca = "Serviço Realizado:"
        const obsOrc = String(orc.observacao || "").trim()
        const rodape = `Ref. Orçamento ${orc.numero}${itensDesc ? ' — ' + itensDesc : ''}`
        const trecho = [obsOrc, rodape].filter(Boolean).join("\n")
        const idx = TEMPLATE.indexOf(marca)
        const descricaoOS = idx >= 0
          ? TEMPLATE.slice(0, idx + marca.length) + " " + trecho + TEMPLATE.slice(idx + marca.length)
          : `${TEMPLATE}\n${trecho}`
        const res = await fetch('/api/pos/ordens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nomeCliente: orc.cliente_nome,
            cpfCliente: orc.cliente_documento || '',
            enderecoCliente: orc.cliente_endereco || '',
            cidadeCliente: orc.cliente_cidade || '',
            tecnicoResponsavel: tecnicoGerar,
            tipoServico: 'Manutenção',
            revisao: '',
            projeto: '',
            servicoSolicitado: descricaoOS,
            qtdHoras: horas,
            qtdKm: km,
            descontoValor: 0,
            gerarPPV: (orc.itens || []).length > 0,
            userName: orc.criado_por || 'Sistema',
          }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.erro || result.error || 'Erro ao criar OS')

        // Se gerou PPV, adicionar as movimentações (itens)
        if (result.ppvGerado && (orc.itens || []).length > 0) {
          for (const item of orc.itens) {
            if (!item.descricao) continue
            await fetch('/api/ppv/movimentacoes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: result.ppvGerado,
                codigo: item.codigo || '',
                descricao: item.descricao,
                quantidade: item.quantidade || 1,
                preco: item.preco || 0,
                tipoMovimento: 'Saída',
                tecnico: tecnicoGerar,
                userName: orc.criado_por || 'Sistema',
              }),
            })
          }
        }

        alert(`OS ${result.novaOsId} criada com sucesso!${result.ppvGerado ? ` PPV ${result.ppvGerado} gerado.` : ''}`)
      } else {
        // Gerar PPV avulso — se o cliente do orçamento NÃO estiver cadastrado no banco, usa NOVA TRATORES
        const docOrc = String(orc.cliente_documento || '').replace(/\D/g, '')
        const nomeOrc = (orc.cliente_nome || '').trim()
        let clientePPV = nomeOrc || 'NOVA TRATORES'
        try {
          // busca pelo NOME (o banco guarda o CNPJ formatado, então buscar por dígitos falharia)
          const rc = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(nomeOrc || orc.cliente_documento || '')}`)
          const cls = rc.ok ? await rc.json() : []
          const bate = Array.isArray(cls) ? cls.find((c: any) => {
            const cd = String(c.documento || '').replace(/\D/g, '')
            if (docOrc && cd) return cd === docOrc
            const cn = (c.nome || '').toLowerCase().trim()
            const no = nomeOrc.toLowerCase()
            return !!cn && (cn.includes(no) || no.includes(cn))
          }) : null
          clientePPV = bate ? (bate.nome || nomeOrc) : 'NOVA TRATORES'
        } catch { clientePPV = nomeOrc || 'NOVA TRATORES' }
        const usouFallback = clientePPV === 'NOVA TRATORES' && !!nomeOrc && nomeOrc.toUpperCase() !== 'NOVA TRATORES'
        const obsPPV = `Ref. Orçamento ${orc.numero}` + (usouFallback ? ` (cliente "${nomeOrc}" não cadastrado — emitido em Nova Tratores)` : '')

        const res = await fetch('/api/ppv/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipoPedido: 'Pedido',
            motivoSaida: 'Venda Balcão',
            tecnico: tecnicoGerar,
            cliente: clientePPV,
            observacao: obsPPV,
            valorTotal: orc.total || 0,
            userName: orc.criado_por || 'Sistema',
            produtosSelecionados: (orc.itens || []).filter((i: any) => i.descricao).map((i: any) => ({
              codigo: i.codigo || '',
              descricao: i.descricao,
              quantidade: i.quantidade || 1,
              preco: i.preco || 0,
            })),
          }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.erro || result.error || 'Erro ao criar PPV')
        alert(`Pedido ${result.id} criado com sucesso!` + (usouFallback ? `\nCliente "${nomeOrc}" não estava cadastrado — emitido em Nova Tratores.` : ''))
      }
      setGerarModal(null)
      setTecnicoGerar('')
    } catch (e) {
      alert('Erro: ' + (e instanceof Error ? e.message : String(e)))
    }
    setGerando(false)
  }

  async function verPDF(id: number) {
    const { data } = await supabase.from('orcamentos').select('*').eq('id', id).single()
    if (!data) return

    const res = await fetch('/api/orcamentos/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero: data.numero,
        cliente: data.cliente_nome,
        documento: data.cliente_documento,
        endereco: data.cliente_endereco,
        cidade: data.cliente_cidade,
        observacao: data.observacao,
        validade: data.validade,
        itens: data.itens || [],
        maoObra: data.mao_obra,
        deslocamento: data.deslocamento,
        userName: data.criado_por,
        dataEmissao: data.created_at,
      }),
    })
    const result = await res.json()
    if (result.html) {
      const win = window.open('', '_blank')
      if (win) { win.document.write(result.html); win.document.close() }
    }
  }

  const listaFiltrada = lista.filter(item => {
    const matchBusca = !busca ||
      item.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      item.numero?.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = !filtroTipo || item.tipo === filtroTipo
    const matchStatus = !filtroStatus || item.status === filtroStatus
    return matchBusca && matchTipo && matchStatus
  })

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const tipoLabel: Record<string, string> = { pecas: 'Peças', 'mao-de-obra': 'Mão de Obra', completo: 'Completo' }
  const tipoIcon = (t: string) => t === 'pecas' ? <Package size={14} /> : t === 'mao-de-obra' ? <Wrench size={14} /> : <><Package size={12} /><Wrench size={12} /></>
  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    rascunho: { bg: '#f5f5f5', color: '#737373', border: '#e5e5e5' },
    ativo: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    aprovado: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    rejeitado: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    expirado: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  }

  if (loading) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: "'Poppins', sans-serif" }}>
        <p style={{ color: '#a3a3a3', fontSize: 15, letterSpacing: 2 }}>Carregando orçamentos...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', width: '100%', fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>Orçamentos</h1>
          <p style={{ fontSize: 13, color: '#737373', marginTop: 4 }}>{lista.length} orçamento{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onNovo} {...gateBtn(podeCriar)} style={{
          padding: '10px 24px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(220,38,38,0.2)',
          ...estiloSemPermissao(podeCriar),
        }}>
          <Plus size={16} /> Novo Orçamento
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
            <input
              type="text"
              placeholder="Buscar por cliente ou número..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10,
                border: '1px solid #e5e5e5', fontSize: 13, outline: 'none',
                fontFamily: "'Poppins', sans-serif",
              }}
            />
          </div>
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
            fontSize: 13, outline: 'none', fontFamily: "'Poppins', sans-serif",
            cursor: 'pointer', color: filtroTipo ? '#1a1a1a' : '#a3a3a3',
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="pecas">Peças</option>
          <option value="mao-de-obra">Mão de Obra</option>
          <option value="completo">Completo</option>
        </select>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
            fontSize: 13, outline: 'none', fontFamily: "'Poppins', sans-serif",
            cursor: 'pointer', color: filtroStatus ? '#1a1a1a' : '#a3a3a3',
          }}
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="aprovado">Aprovado</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="expirado">Expirado</option>
        </select>
        {(busca || filtroTipo || filtroStatus) && (
          <button
            onClick={() => { setBusca(''); setFiltroTipo(''); setFiltroStatus('') }}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: '#f5f5f5', color: '#737373', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <FilterX size={14} /> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
        overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={thStyle}>NÚMERO</th>
              <th style={thStyle}>TIPO</th>
              <th style={thStyle}>CLIENTE</th>
              <th style={thStyle}>CIDADE</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>VALOR</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>STATUS</th>
              <th style={thStyle}>DATA</th>
              <th style={thStyle}>CRIADO POR</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.map(item => {
              const sc = statusColors[item.status] || statusColors.ativo
              return (
                <tr key={item.id} onClick={() => onEditar(item.id)} title="Clique para editar" style={{ borderBottom: '1px solid #f5f5f5', transition: '0.15s', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#dc2626' }}>{item.numero}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
                      background: '#f5f5f5', padding: '3px 10px', borderRadius: 6, fontWeight: 600, color: '#525252',
                    }}>
                      {tipoIcon(item.tipo)} {tipoLabel[item.tipo] || item.tipo}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{item.cliente_nome}</td>
                  <td style={{ ...tdStyle, color: '#737373' }}>{item.cliente_cidade || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>R$ {fmt(item.total)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <select
                      value={item.status}
                      onChange={e => alterarStatus(item.id, e.target.value)}
                      disabled={!podeStatus}
                      title={!podeStatus ? MSG_SEM_PERMISSAO : undefined}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                        cursor: podeStatus ? 'pointer' : 'default', outline: 'none', fontFamily: "'Poppins', sans-serif",
                        appearance: 'auto', opacity: podeStatus ? 1 : 0.7,
                      }}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="aprovado">Aprovado</option>
                      <option value="rejeitado">Rejeitado</option>
                      <option value="expirado">Expirado</option>
                    </select>
                  </td>
                  <td style={{ ...tdStyle, color: '#737373', fontSize: 12 }}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ ...tdStyle, color: '#737373', fontSize: 12 }}>{item.criado_por || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        onClick={() => { setTecnicoGerar(''); setGerarModal({ id: item.id, tipoOrc: item.tipo }) }}
                        disabled={!podeGerar}
                        title={!podeGerar ? MSG_SEM_PERMISSAO : (item.tipo === 'pecas' ? 'Gerar Pedido (PPV)' : item.tipo === 'mao-de-obra' ? 'Enviar p/ POS (gera OS)' : 'Enviar p/ POS (gera OS + PPV)')}
                        style={{ ...actionBtn, ...estiloSemPermissao(podeGerar) }}
                      >
                        <Send size={15} color="#1d4ed8" />
                      </button>
                      <button onClick={() => verPDF(item.id)} title="Imprimir" style={actionBtn}>
                        <Printer size={15} color="#737373" />
                      </button>
                      <button onClick={() => excluir(item.id)} {...gateBtn(podeExcluir)} title={!podeExcluir ? MSG_SEM_PERMISSAO : 'Excluir'} style={{ ...actionBtn, ...estiloSemPermissao(podeExcluir) }}>
                        <Trash2 size={15} color="#ef4444" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {listaFiltrada.length === 0 && (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <FileText size={40} color="#e5e5e5" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: '#a3a3a3', fontWeight: 500 }}>
              {lista.length === 0 ? 'Nenhum orçamento criado ainda.' : 'Nenhum resultado para os filtros aplicados.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal gerar OS/PPV */}
      {gerarModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          }}
          onClick={e => { if (e.target === e.currentTarget && !gerando) setGerarModal(null) }}
        >
          <div style={{
            width: 420, borderRadius: 16, background: '#fff', padding: 32,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', margin: '0 0 6px' }}>
              {gerarModal.tipoOrc === 'pecas' ? 'Gerar Pedido de Venda' : gerarModal.tipoOrc === 'mao-de-obra' ? 'Gerar Ordem de Serviço' : 'Enviar para o POS'}
            </h3>
            <p style={{ fontSize: 13, color: '#737373', margin: '0 0 20px' }}>
              {gerarModal.tipoOrc === 'pecas'
                ? 'Um pedido será criado no PPV com os itens deste orçamento.'
                : gerarModal.tipoOrc === 'mao-de-obra'
                ? 'Uma OS será criada no POS com os dados deste orçamento.'
                : 'Uma OS será criada no POS e um PPV vinculado será gerado com as peças deste orçamento.'}
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Técnico Responsável <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={tecnicoGerar}
                onChange={e => setTecnicoGerar(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e5e5e5', fontSize: 14, outline: 'none',
                  fontFamily: "'Poppins', sans-serif", cursor: 'pointer',
                  background: '#fff', color: tecnicoGerar ? '#1a1a1a' : '#a3a3a3',
                }}
              >
                <option value="">Selecione o técnico...</option>
                {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setGerarModal(null)}
                disabled={gerando}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e5e5',
                  background: '#fff', color: '#737373', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarGerar}
                disabled={gerando || !tecnicoGerar.trim()}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: gerarModal.tipoOrc === 'pecas'
                    ? 'linear-gradient(135deg, #16a34a, #15803d)'
                    : 'linear-gradient(135deg, #1d4ed8, #1e40af)',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: gerando || !tecnicoGerar.trim() ? 0.5 : 1,
                }}
              >
                {gerando ? 'Gerando...' : gerarModal.tipoOrc === 'pecas' ? 'Gerar PPV' : gerarModal.tipoOrc === 'mao-de-obra' ? 'Gerar OS' : 'Enviar p/ POS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', fontSize: 10, fontWeight: 800,
  color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '2px solid #f0f0f0', textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#1a1a1a',
}

const actionBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #f0f0f0', borderRadius: 8,
  padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: '0.15s',
}
