'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, Printer, ChevronDown, ChevronUp } from 'lucide-react'

const gray = '#737373'
const lightGray = '#a3a3a3'
const text = 'var(--portal-text)'
const bg2 = 'var(--portal-bg-secondary)'
const border = 'var(--portal-border)'
const card = 'var(--portal-bg-card)'

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function formatDate(d: string | null) {
  if (!d) return '-'
  if (d.includes('/')) return d
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('pt-BR')
}

export default function ProjetoPage() {
  const params = useSearchParams()
  const nome = params.get('nome') || ''
  const empresa = params.get('empresa') || 'Nova Tratores'

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedOS, setExpandedOS] = useState<string | null>(null)
  const [expandedPV, setExpandedPV] = useState<string | null>(null)

  useEffect(() => {
    if (!nome) return
    setLoading(true)
    fetch(`/api/clientes/projeto?nome=${encodeURIComponent(nome)}&empresa=${encodeURIComponent(empresa)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [nome, empresa])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: lightGray }}>Carregando projeto...</div>
  if (!data || data.error) return <div style={{ padding: '40px', textAlign: 'center', color: gray }}>{data?.error || 'Projeto nao encontrado'}</div>

  const { projeto, chassis, ultimo_cliente, resumo, ordens, pedidos_venda, notas_fiscais } = data
  const nfs: any[] = notas_fiscais || []

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', color: text, margin: '0 0 4px' }}>Projeto: {projeto}</h2>
        <p style={{ fontSize: '12px', color: gray }}>{empresa}</p>
        {ultimo_cliente && (
          <p style={{ fontSize: '12px', color: gray, marginTop: '4px' }}>
            Ultimo cliente: {ultimo_cliente.nome} - {ultimo_cliente.cnpj_cpf} - {ultimo_cliente.cidade}/{ultimo_cliente.estado}
          </p>
        )}
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '24px' }}>
        {[
          { label: 'Ordens de Servico', value: String(resumo.total_os) },
          { label: 'Ordens Faturadas', value: String(resumo.os_faturadas) },
          { label: 'Valor Total Servicos', value: formatCurrency(resumo.valor_total_os) },
          { label: 'Pedidos de Venda', value: String(resumo.total_pv) },
          { label: 'Valor Total Pecas', value: formatCurrency(resumo.valor_total_pv) },
        ].map((s, i) => (
          <div key={i} style={{ padding: '10px 14px', background: bg2, borderRadius: '6px' }}>
            <p style={{ fontSize: '10px', color: lightGray, marginBottom: '2px' }}>{s.label}</p>
            <p style={{ fontSize: '14px', color: text }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Notas Fiscais */}
      {nfs.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: gray, marginBottom: '8px' }}>Notas Fiscais ({nfs.length})</p>
          <div style={{ borderRadius: '6px', border: `1px solid ${border}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 1fr 100px 100px 80px', padding: '6px 12px', background: bg2, fontSize: '10px', color: lightGray }}>
              <span>Tipo</span>
              <span>Origem</span>
              <span>Numero</span>
              <span>Cliente</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
              <span>Data</span>
              <span></span>
            </div>
            {nfs.map((nf: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 1fr 100px 100px 80px', padding: '8px 12px', borderTop: `1px solid ${border}`, fontSize: '12px', color: text, alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: gray }}>{nf.tipo}</span>
                <span>{nf.origem}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{nf.numero || '-'}</span>
                <span style={{ fontSize: '11px', color: gray }}>{nf.cliente}</span>
                <span style={{ textAlign: 'right' }}>{formatCurrency(nf.valor || 0)}</span>
                <span style={{ fontSize: '11px', color: gray }}>{formatDate(nf.data)}</span>
                <span>
                  {nf.link && (
                    <a href={nf.link} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '4px', background: '#333', color: '#fff', fontSize: '10px', textDecoration: 'none' }}>
                      <Download size={10} /> Abrir
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chassis */}
      {chassis.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: gray, marginBottom: '8px' }}>Chassis vinculados ({chassis.length})</p>
          <div style={{ borderRadius: '6px', border: `1px solid ${border}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '6px 12px', background: bg2, fontSize: '10px', color: lightGray }}>
              <span>Chassis</span>
              <span>Modelo</span>
              <span>Cliente</span>
              <span>CNPJ/CPF</span>
            </div>
            {chassis.map((ch: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '8px 12px', borderTop: `1px solid ${border}`, fontSize: '12px', color: text }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{ch.chassis}</span>
                <span>{ch.modelo || '-'}</span>
                <span>{ch.cliente_nome || '-'}</span>
                <span style={{ color: gray }}>{ch.cnpj_cpf || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ordens de Servico */}
      {ordens.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: gray, marginBottom: '8px' }}>Ordens de Servico ({ordens.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {ordens.map((os: any) => {
              const isExp = expandedOS === os.num_os
              return (
                <div key={os.num_os} style={{ borderRadius: '6px', border: `1px solid ${border}`, background: card, overflow: 'hidden' }}>
                  <button onClick={() => setExpandedOS(isExp ? null : os.num_os)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px', border: 'none', cursor: 'pointer', background: isExp ? bg2 : 'transparent' }}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: text }}>Ordem de Servico {os.num_os}</span>
                        <span style={{ fontSize: '10px', color: gray, padding: '1px 6px', borderRadius: '3px', background: bg2 }}>{os.status}</span>
                        {os.num_nf && <span style={{ fontSize: '10px', color: gray }}>Nota Fiscal {os.num_nf}</span>}
                        <span style={{ fontSize: '10px', color: lightGray }}>{os.cliente_nome}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: lightGray, marginTop: '2px' }}>
                        {formatDate(os.data_previsao)} {os.cidade && `- ${os.cidade}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: text }}>{formatCurrency(os.valor_total || 0)}</span>
                    {isExp ? <ChevronUp size={12} color={lightGray} /> : <ChevronDown size={12} color={lightGray} />}
                  </button>
                  {isExp && (
                    <div style={{ borderTop: `1px solid ${border}`, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <a href={`/api/clientes/print?tipo=os&cod=${os.cod_os}&empresa=${encodeURIComponent(os.empresa)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '5px', background: '#555', color: '#fff', fontSize: '11px', textDecoration: 'none' }}>
                          <Printer size={11} /> Imprimir Ordem
                        </a>
                        {os.link_nf && (
                          <a href={os.link_nf} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '5px', background: '#333', color: '#fff', fontSize: '11px', textDecoration: 'none' }}>
                            <Download size={11} /> Nota Fiscal de Servico
                          </a>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {[
                          { l: 'Data de Inclusao', v: formatDate(os.data_inclusao) },
                          { l: 'Data de Faturamento', v: formatDate(os.data_faturamento) },
                          { l: 'Vendedor', v: os.vendedor || '-' },
                          { l: 'Cliente', v: os.cliente_nome },
                          { l: 'CNPJ/CPF', v: os.cnpj_cpf || '-' },
                          { l: 'Referencia/Pedido', v: os.num_pedido_cli || '-' },
                          { l: 'Valor', v: formatCurrency(os.valor_total || 0) },
                          { l: 'Status', v: os.status },
                        ].map((f, i) => (
                          <div key={i} style={{ padding: '6px 10px', background: bg2, borderRadius: '4px' }}>
                            <p style={{ fontSize: '9px', color: lightGray, marginBottom: '1px' }}>{f.l}</p>
                            <p style={{ fontSize: '11px', color: text }}>{f.v}</p>
                          </div>
                        ))}
                      </div>
                      {os.descricao && (
                        <div style={{ marginTop: '8px', padding: '8px 10px', background: bg2, borderRadius: '4px' }}>
                          <p style={{ fontSize: '9px', color: lightGray, marginBottom: '2px' }}>Descricao</p>
                          <p style={{ fontSize: '11px', color: text, whiteSpace: 'pre-wrap' }}>{os.descricao}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pedidos de Venda */}
      {pedidos_venda.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: gray, marginBottom: '8px' }}>Pedidos de Venda ({pedidos_venda.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {pedidos_venda.map((pv: any) => {
              const isExp = expandedPV === pv.num_pedido
              const itens = typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || [])
              return (
                <div key={pv.num_pedido} style={{ borderRadius: '6px', border: `1px solid ${border}`, background: card, overflow: 'hidden' }}>
                  <button onClick={() => setExpandedPV(isExp ? null : pv.num_pedido)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px', border: 'none', cursor: 'pointer', background: isExp ? bg2 : 'transparent' }}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: text }}>Pedido de Venda {pv.num_pedido}</span>
                        <span style={{ fontSize: '10px', color: gray, padding: '1px 6px', borderRadius: '3px', background: bg2 }}>{pv.etapa || (pv.faturado ? 'Faturado' : pv.cancelado ? 'Cancelado' : 'Em Aberto')}</span>
                        {pv.numero_nf && <span style={{ fontSize: '10px', color: gray }}>Nota Fiscal {pv.numero_nf}</span>}
                        {pv.cliente_nome && <span style={{ fontSize: '10px', color: lightGray }}>{pv.cliente_nome}</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: lightGray, marginTop: '2px' }}>
                        {formatDate(pv.data_previsao || pv.data_inclusao)}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: text }}>{formatCurrency(pv.valor_total || 0)}</span>
                    {isExp ? <ChevronUp size={12} color={lightGray} /> : <ChevronDown size={12} color={lightGray} />}
                  </button>
                  {isExp && (
                    <div style={{ borderTop: `1px solid ${border}`, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <a href={`/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa || empresa)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '5px', background: '#555', color: '#fff', fontSize: '11px', textDecoration: 'none' }}>
                          <Printer size={11} /> Imprimir Pedido
                        </a>
                        {pv.link_nf && (
                          <a href={pv.link_nf} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '5px', background: '#333', color: '#fff', fontSize: '11px', textDecoration: 'none' }}>
                            <Download size={11} /> Nota Fiscal do Pedido
                          </a>
                        )}
                      </div>
                      {itens.length > 0 && (
                        <div>
                          <p style={{ fontSize: '10px', color: lightGray, marginBottom: '6px' }}>Itens ({itens.length})</p>
                          <div style={{ borderRadius: '6px', border: `1px solid ${border}`, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px 90px 90px', padding: '5px 10px', background: bg2, fontSize: '10px', color: lightGray }}>
                              <span>Codigo</span><span>Descricao</span><span style={{ textAlign: 'center' }}>Quantidade</span><span style={{ textAlign: 'right' }}>Valor Unitario</span><span style={{ textAlign: 'right' }}>Valor Total</span>
                            </div>
                            {itens.map((item: any, idx: number) => (
                              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px 90px 90px', padding: '5px 10px', borderTop: `1px solid ${border}`, fontSize: '11px', color: text }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{item.codigo || '-'}</span>
                                <span>{item.descricao}</span>
                                <span style={{ textAlign: 'center' }}>{item.quantidade}</span>
                                <span style={{ textAlign: 'right', color: gray }}>{formatCurrency(item.valor_unitario || 0)}</span>
                                <span style={{ textAlign: 'right' }}>{formatCurrency(item.valor_total || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {ordens.length === 0 && pedidos_venda.length === 0 && (
        <p style={{ color: lightGray, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
          Nenhuma ordem de servico ou pedido de venda encontrado para este projeto
        </p>
      )}
    </div>
  )
}
