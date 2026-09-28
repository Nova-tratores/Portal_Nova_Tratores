'use client'
// Modal de abertura de Solicitação de Compras (tipo='compras'). O solicitante
// preenche os campos estruturados; a bola vai direto para a Diretoria.
// O motivo + complemento viram a origem do ticket, imutável depois de criada.
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ShoppingCart, Search, Users, Warehouse } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import {
  SC_CONFIANCA_INFO, SC_DESTINO_LABEL, motivosDoDestino, validarNovaSC, margemPrevista, rotuloModelo,
  type ModeloOpcao, type ProdutoLinha, type ScConfianca, type ScDestino,
} from '@/lib/tickets/compras'

interface Props {
  onFechar: () => void
  onCriado: (ticketId: string) => void
}

const campoStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
  color: 'var(--portal-text, #111)', outline: 'none',
}
const rotuloStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6,
  color: 'var(--portal-text-secondary, #555)', textTransform: 'uppercase', letterSpacing: .4,
}
const dicaStyle: React.CSSProperties = { fontSize: 11.5, color: 'var(--portal-text-muted, #888)', marginTop: 4 }
const grupoStyle: React.CSSProperties = {
  padding: '6px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
  color: 'var(--portal-text-muted, #999)', background: 'var(--portal-bg, #f9fafb)',
}
const opcaoStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none',
  background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--portal-text, #111)',
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FormSC({ onFechar, onCriado }: Props) {
  const [produto, setProduto] = useState('')
  const [produtoCodigo, setProdutoCodigo] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [custoAlvo, setCustoAlvo] = useState('')
  const [precoVenda, setPrecoVenda] = useState('')
  const [destino, setDestino] = useState<ScDestino>('cliente')
  const [clienteDestino, setClienteDestino] = useState('')
  const [pvNumero, setPvNumero] = useState('')
  const [confianca, setConfianca] = useState<ScConfianca | ''>('')
  const [motivo, setMotivo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Lista pronta de produtos (modelos agrupados + itens do cadastro)
  const [listaAberta, setListaAberta] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [modelos, setModelos] = useState<ModeloOpcao[]>([])
  const [itens, setItens] = useState<ProdutoLinha[]>([])
  const pedido = useRef(0)

  useEffect(() => {
    if (!listaAberta) return
    const n = ++pedido.current
    const timer = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/tickets/compras/produtos?q=${encodeURIComponent(produto.trim())}`, { headers: await authHeaders() })
        const json = await res.json()
        if (n !== pedido.current) return // resposta de uma busca antiga
        setModelos(res.ok ? json.modelos || [] : [])
        setItens(res.ok ? json.itens || [] : [])
      } catch {
        if (n === pedido.current) { setModelos([]); setItens([]) }
      } finally {
        if (n === pedido.current) setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [produto, listaAberta])

  const escolherModelo = (m: ModeloOpcao) => {
    setProduto(rotuloModelo(m)); setMarca(m.marca); setModelo(m.modelo); setProdutoCodigo('')
    setListaAberta(false)
  }
  const escolherItem = (p: ProdutoLinha) => {
    setProduto(String(p.descricao || '').slice(0, 160)); setMarca(String(p.marca || '')); setModelo(String(p.modelo || ''))
    setProdutoCodigo(String(p.codigo || ''))
    setListaAberta(false)
  }

  const motivos = useMemo(() => motivosDoDestino(destino), [destino])
  const trocarDestino = (d: ScDestino) => {
    setDestino(d)
    if (!motivosDoDestino(d).some((m) => m.id === motivo)) setMotivo('')
  }
  const trocarMotivo = (id: string) => {
    setMotivo(id)
    if (id === 'venda_fechada' && !confianca) setConfianca('quente')
  }

  const margem = margemPrevista(custoAlvo ? Number(custoAlvo) : null, precoVenda ? Number(precoVenda) : null)
  const totalCompra = custoAlvo && Number(quantidade) > 0 ? Number(custoAlvo) * Number(quantidade) : null

  const criar = async () => {
    setErro('')
    const corpo = {
      tipo: 'compras',
      produto, produto_codigo: produtoCodigo, marca, modelo,
      quantidade_solicitada: quantidade,
      preco_alvo: custoAlvo, preco_venda_previsto: precoVenda,
      destino, cliente_destino: clienteDestino, pv_numero: pvNumero, confianca,
      motivo, descricao,
    }
    const validado = validarNovaSC(corpo)
    if ('erro' in validado) { setErro(validado.erro); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(corpo),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao abrir a SC'); return }
      onCriado(json.ticket.id)
    } catch {
      setErro('Falha de conexão — tente novamente')
    } finally {
      setSalvando(false)
    }
  }

  const botaoDestino = (d: ScDestino, icone: React.ReactNode) => (
    <button type="button" onClick={() => trocarDestino(d)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px',
        borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
        border: destino === d ? '1.5px solid #dc2626' : '1px solid var(--portal-border, #e5e7eb)',
        background: destino === d ? 'rgba(220,38,38,.07)' : 'var(--portal-bg, #fff)',
        color: destino === d ? '#dc2626' : 'var(--portal-text-secondary, #555)',
      }}>
      {icone} {SC_DESTINO_LABEL[d]}
    </button>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--portal-surface, #fff)', borderRadius: 14, padding: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 800, color: 'var(--portal-text, #111)', margin: 0 }}>
            <ShoppingCart size={18} color="#dc2626" /> Nova Solicitação de Compras
          </h2>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted, #888)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Produto: lista pronta, ou digita o que não estiver nela */}
          <div style={{ position: 'relative' }}>
            <label style={rotuloStyle}>Produto *</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--portal-text-muted, #999)' }} />
              <input value={produto} maxLength={160} autoFocus
                onChange={(e) => { setProduto(e.target.value); setProdutoCodigo(''); setListaAberta(true) }}
                onFocus={() => setListaAberta(true)}
                onBlur={() => setTimeout(() => setListaAberta(false), 180)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setListaAberta(false) } }}
                placeholder="Busque por modelo, marca ou código — ou digite o produto"
                style={{ ...campoStyle, paddingLeft: 34 }} />
            </div>
            {listaAberta && (
              <div style={{
                position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 4, maxHeight: 280, overflowY: 'auto',
                background: 'var(--portal-surface, #fff)', border: '1px solid var(--portal-border, #e5e7eb)',
                borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.18)',
              }}>
                {modelos.length > 0 && <div style={grupoStyle}>Modelos</div>}
                {modelos.map((m) => (
                  <button key={`${m.marca}|${m.modelo}|${m.familia}`} type="button" style={opcaoStyle}
                    onMouseDown={(e) => { e.preventDefault(); escolherModelo(m) }}>
                    <strong>{m.modelo}</strong>{m.marca ? ` · ${m.marca}` : ''}
                    <span style={{ color: 'var(--portal-text-muted, #999)' }}>
                      {m.familia ? ` · ${m.familia}` : ''} · {m.em_estoque > 0 ? `${m.em_estoque} em estoque` : 'sem estoque'}
                    </span>
                  </button>
                ))}
                {itens.length > 0 && <div style={grupoStyle}>Itens do cadastro</div>}
                {itens.map((p) => (
                  <button key={String(p.codigo)} type="button" style={opcaoStyle}
                    onMouseDown={(e) => { e.preventDefault(); escolherItem(p) }}>
                    <strong>{p.codigo}</strong> · {p.descricao}
                  </button>
                ))}
                {modelos.length === 0 && itens.length === 0 && (
                  <div style={{ padding: '12px', fontSize: 12.5, color: 'var(--portal-text-muted, #888)' }}>
                    {buscando ? 'Buscando...' : produto.trim()
                      ? 'Nada no cadastro com esse texto. Pode seguir: o produto fica como você digitou.'
                      : 'Digite para buscar.'}
                  </div>
                )}
              </div>
            )}
            <div style={dicaStyle}>
              {produtoCodigo ? `Item do cadastro: ${produtoCodigo}` : 'Se não estiver na lista, escreva o produto e preencha marca e modelo abaixo.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Marca</label>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={80}
                placeholder="Ex: Mahindra" style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Modelo</label>
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={80}
                placeholder="Ex: 6075" style={campoStyle} />
            </div>
            <div>
              <label style={rotuloStyle}>Qtd *</label>
              <input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} style={campoStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={rotuloStyle}>Custo-alvo de compra (unit.)</label>
              <input type="number" min={0} step="0.01" value={custoAlvo} onChange={(e) => setCustoAlvo(e.target.value)}
                placeholder="R$ — quanto pagar" style={campoStyle} />
              {totalCompra != null && <div style={dicaStyle}>Total da compra: {moeda(totalCompra)}</div>}
            </div>
            <div>
              <label style={rotuloStyle}>Preço de venda previsto (unit.)</label>
              <input type="number" min={0} step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="R$ — por quanto vender" style={campoStyle} />
              {margem && (
                <div style={{ ...dicaStyle, color: margem.valor < 0 ? '#dc2626' : undefined, fontWeight: margem.valor < 0 ? 700 : undefined }}>
                  Margem prevista: {moeda(margem.valor)}{margem.pct != null ? ` (${margem.pct.toFixed(1).replace('.', ',')}%)` : ''}
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Destino da compra *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {botaoDestino('cliente', <Users size={15} />)}
              {botaoDestino('estoque', <Warehouse size={15} />)}
            </div>
          </div>

          {destino === 'cliente' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px', gap: 12 }}>
                <div>
                  <label style={rotuloStyle}>Cliente destino *</label>
                  <input value={clienteDestino} onChange={(e) => setClienteDestino(e.target.value)} maxLength={160}
                    placeholder="Cliente vinculado à compra" style={campoStyle} />
                </div>
                <div>
                  <label style={rotuloStyle}>Nº do pedido de venda{motivo === 'venda_fechada' ? ' *' : ''}</label>
                  <input value={pvNumero} onChange={(e) => setPvNumero(e.target.value)} maxLength={40}
                    placeholder={motivo === 'venda_fechada' ? 'Obrigatório' : 'Se já houver'} style={campoStyle} />
                </div>
              </div>

              <div>
                <label style={rotuloStyle}>Grau de confiança na venda *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(Object.keys(SC_CONFIANCA_INFO) as ScConfianca[]).map((c) => {
                    const info = SC_CONFIANCA_INFO[c]
                    const ativo = confianca === c
                    return (
                      <button key={c} type="button" onClick={() => setConfianca(c)} title={info.dica}
                        style={{
                          flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
                          border: ativo ? `1.5px solid ${info.cor}` : '1px solid var(--portal-border, #e5e7eb)',
                          background: ativo ? info.fundo : 'var(--portal-bg, #fff)',
                          color: ativo ? info.cor : 'var(--portal-text-secondary, #555)',
                        }}>
                        {info.label}
                      </button>
                    )
                  })}
                </div>
                {confianca && <div style={dicaStyle}>{SC_CONFIANCA_INFO[confianca].dica}</div>}
              </div>
            </>
          )}

          <div>
            <label style={rotuloStyle}>Motivo *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {motivos.map((m) => (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5,
                  border: motivo === m.id ? '1.5px solid #dc2626' : '1px solid var(--portal-border, #e5e7eb)',
                  background: motivo === m.id ? 'rgba(220,38,38,.06)' : 'transparent',
                  color: 'var(--portal-text, #111)',
                }}>
                  <input type="radio" name="sc-motivo" checked={motivo === m.id} onChange={() => trocarMotivo(m.id)}
                    style={{ accentColor: '#dc2626' }} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Complemento{motivo === 'outro' ? ' *' : ''}</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={2000}
              placeholder="Detalhes que ajudam a decidir: prazo que o cliente precisa, condição negociada, urgência..."
              style={{ ...campoStyle, resize: 'vertical' }} />
            <div style={dicaStyle}>O motivo e o complemento ficam registrados como origem e não podem ser alterados depois.</div>
          </div>

          {erro && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onFechar} disabled={salvando}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--portal-text-secondary, #555)' }}>
              Cancelar
            </button>
            <button onClick={criar} disabled={salvando}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: salvando ? .6 : 1 }}>
              {salvando ? 'Abrindo...' : 'Abrir solicitação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
