'use client'
// Peças do Orçamento em MODO PLANILHA (só computador): grade com cara e teclado de Excel.
// Pedido de 27/10/2026 — o Zezo (Peças) monta orçamento numa planilha virgem do Excel;
// aqui ele cola o bloco da planilha (Ctrl+V, colunas descobertas sozinhas), digita o
// código e o Enter puxa descrição e preço do cadastro, anda com setas/Enter/Tab e vê,
// em colunas que NÃO saem no PDF, o preço do cadastro e a margem sobre o custo.
// Regras puras em lib/orcamentos/planilha.ts.
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Search, Copy, Undo2, Trash2, CopyPlus, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { precoDifere, type ItemConferido } from '@/lib/ppv/conferencia-precos'
import {
  ROTULO_CAMPO, detectarColunas, ehBloco, formatarMoedaBR, formatarQtdBR, lerColagem, linhaVazia,
  linhasDaColagem, margem, paraExcel, parseNumeroBR, type CampoPlanilha, type DeteccaoColunas, type LinhaPlanilha,
} from '@/lib/orcamentos/planilha'

type Col = 'codigo' | 'descricao' | 'quantidade' | 'preco'
const COLS: Col[] = ['codigo', 'descricao', 'quantidade', 'preco']
const NUMERICA = (c: Col) => c === 'quantidade' || c === 'preco'
const VAZIA: LinhaPlanilha = { codigo: '', descricao: '', quantidade: 1, preco: 0 }
const MAX_HISTORICO = 60

interface Colagem { grade: string[][]; det: DeteccaoColunas; inicio: number; antes: LinhaPlanilha[]; tirouVazia: boolean }

export default function PlanilhaPecas({ itens, setItens, doItem, onBuscar }: {
  itens: LinhaPlanilha[]
  setItens: Dispatch<SetStateAction<LinhaPlanilha[]>>
  doItem: (codigo: string) => ItemConferido | null
  onBuscar: (idx: number) => void
}) {
  // célula numérica em edição: o texto cru fica aqui até sair da célula
  const [rascunho, setRascunho] = useState<{ r: number; c: Col; texto: string } | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const ancora = useRef<number | null>(null)
  const historico = useRef<LinhaPlanilha[][]>([])
  const aoFocar = useRef<LinhaPlanilha[] | null>(null)
  const textoAoFocar = useRef('')
  const [colagem, setColagem] = useState<Colagem | null>(null)
  const [aviso, setAviso] = useState('')

  // ── histórico (Ctrl+Z) ──
  const guardar = (estado: LinhaPlanilha[]) => {
    historico.current.push(estado)
    if (historico.current.length > MAX_HISTORICO) historico.current.shift()
  }
  const desfazer = () => {
    // primeiro desfaz o que foi digitado na célula atual; depois, passo a passo
    if (rascunho && rascunho.texto !== textoAoFocar.current) { setRascunho({ ...rascunho, texto: textoAoFocar.current }); return }
    if (aoFocar.current && aoFocar.current !== itens) { setItens(aoFocar.current); setRascunho(null); return }
    const anterior = historico.current.pop()
    if (anterior) { setItens(anterior); aoFocar.current = anterior; setRascunho(null); setColagem(null) }
  }
  const mudar = (fn: (prev: LinhaPlanilha[]) => LinhaPlanilha[]) => { guardar(itens); setItens(fn) }

  // ── foco e navegação ──
  const foco = (r: number, c: Col) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-pr="${r}"][data-pc="${c}"]`)
      if (el) { el.focus(); el.select() }
    }, 0)
  }
  const irPara = (r: number, c: Col, criar = false) => {
    if (r < 0) return
    if (r >= itens.length) {
      if (!criar) return
      setItens((prev) => [...prev, { ...VAZIA }])
    }
    foco(r, c)
  }

  // ── cadastro: código → descrição e preço ──
  // forcarLinha: o código daquela linha foi trocado → descrição e preço passam a ser os do cadastro
  const resolver = async (codigos: string[], forcarLinha?: number) => {
    const lista = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))]
    if (lista.length === 0) return
    try {
      const r = await fetch('/api/ppv/conferir-precos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ itens: lista.map((codigo) => ({ codigo, preco: 0, quantidade: 1 })) }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.itens) return
      const mapa = new Map<string, ItemConferido>((j.itens as ItemConferido[]).map((i) => [i.codigo.trim().toUpperCase(), i]))
      const faltando = lista.filter((c) => mapa.get(c.toUpperCase())?.descricaoCadastro == null)
      if (faltando.length) setAviso(`${faltando.length === 1 ? 'Código não cadastrado' : `${faltando.length} códigos não cadastrados`}: ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? '…' : ''} — a linha fica, confira com Peças.`)
      setItens((prev) => prev.map((it, i) => {
        const cad = mapa.get(it.codigo.trim().toUpperCase())
        if (!cad || cad.descricaoCadastro == null) return it
        if (i === forcarLinha) return { ...it, descricao: cad.descricaoCadastro || it.descricao, preco: cad.precoCadastro ?? it.preco }
        return {
          ...it,
          descricao: it.descricao.trim() ? it.descricao : cad.descricaoCadastro,
          preco: it.preco > 0 || cad.precoCadastro === null ? it.preco : cad.precoCadastro,
        }
      }))
    } catch { /* sem cadastro: segue com o que foi digitado */ }
  }

  // ── edição ──
  const valor = (r: number, c: Col) => {
    if (rascunho && rascunho.r === r && rascunho.c === c) return rascunho.texto
    const it = itens[r]
    if (!it) return ''
    if (c === 'quantidade') return linhaVazia(it) && it.quantidade === 1 ? '' : formatarQtdBR(it.quantidade)
    if (c === 'preco') return it.preco ? formatarMoedaBR(it.preco) : ''
    return it[c]
  }
  const confirmarRascunho = () => {
    if (!rascunho) return
    const { r, c, texto } = rascunho
    setRascunho(null)
    const n = parseNumeroBR(texto)
    if (texto.trim() === '' && c === 'preco') { setItens((prev) => prev.map((it, i) => (i === r ? { ...it, preco: 0 } : it))); return }
    if (n === null || n < 0) return // inválido: volta ao valor anterior
    setItens((prev) => prev.map((it, i) => (i === r ? { ...it, [c]: c === 'quantidade' && n === 0 ? 1 : n } : it)))
  }
  const aoMudar = (r: number, c: Col, texto: string) => {
    if (NUMERICA(c)) { setRascunho({ r, c, texto }); return }
    setItens((prev) => prev.map((it, i) => (i === r ? { ...it, [c]: texto } : it)))
  }
  const aoEntrar = (r: number, c: Col) => {
    aoFocar.current = itens
    textoAoFocar.current = valor(r, c)
    if (NUMERICA(c)) setRascunho({ r, c, texto: textoAoFocar.current })
  }
  // saiu da célula (Enter, setas, Tab, clique fora): grava no histórico e, se o código
  // mudou, busca no cadastro. Roda uma vez por célula (o blur depois do Enter não repete).
  const fecharCelula = (r: number, c: Col) => {
    const antes = aoFocar.current
    if (!antes) return
    const mudouRascunho = !!rascunho && rascunho.r === r && rascunho.c === c && rascunho.texto !== textoAoFocar.current
    confirmarRascunho()
    if (antes !== itens || mudouRascunho) guardar(antes)
    aoFocar.current = null
    const cod = itens[r]?.codigo.trim()
    if (c === 'codigo' && cod && cod !== antes[r]?.codigo.trim()) resolver([cod], antes[r]?.codigo.trim() ? r : undefined)
  }

  const teclado = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: Col) => {
    const k = e.key
    const ci = COLS.indexOf(c)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); desfazer(); return }
    if (k === 'Enter') {
      e.preventDefault()
      fecharCelula(r, c)
      irPara(e.shiftKey ? r - 1 : r + 1, c, !e.shiftKey)
      return
    }
    if (k === 'Escape') { setRascunho(null); if (aoFocar.current) setItens(aoFocar.current); return }
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); fecharCelula(r, c); irPara(k === 'ArrowDown' ? r + 1 : r - 1, c); return }
    const el = e.currentTarget
    const inicio = el.selectionStart === 0 && el.selectionEnd === 0
    const fim = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
    if (k === 'ArrowLeft' && inicio && ci > 0) { e.preventDefault(); fecharCelula(r, c); foco(r, COLS[ci - 1]); return }
    if (k === 'ArrowRight' && fim && ci < COLS.length - 1) { e.preventDefault(); fecharCelula(r, c); foco(r, COLS[ci + 1]); return }
    if (k === 'Tab' && !e.shiftKey && ci === COLS.length - 1) {
      e.preventDefault(); fecharCelula(r, c); irPara(r + 1, 'codigo', true)
    }
  }

  // ── colar do Excel ──
  const aplicarColagem = (base: LinhaPlanilha[], grade: string[][], det: DeteccaoColunas, inicio: number) => {
    const novas = linhasDaColagem(grade, det)
    const tirouVazia = !!base[inicio] && linhaVazia(base[inicio])
    const resto = base.slice(inicio + (tirouVazia ? 1 : 0))
    const proximo = [...base.slice(0, inicio), ...novas, ...resto]
    if (!proximo.length || !linhaVazia(proximo[proximo.length - 1])) proximo.push({ ...VAZIA })
    return { proximo, novas, tirouVazia }
  }
  const colar = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: Col) => {
    const texto = e.clipboardData.getData('text/plain')
    if (!ehBloco(texto)) return // uma célula só: colar normal do campo
    e.preventDefault()
    setRascunho(null)
    const grade = lerColagem(texto)
    if (grade.length === 0) return
    guardar(itens)
    aoFocar.current = null
    if (grade.every((l) => l.length === 1)) {
      // uma coluna só: preenche a coluna onde está o cursor, para baixo (como no Excel)
      const valores = grade.map((l) => l[0])
      setItens((prev) => {
        const out = [...prev]
        valores.forEach((v, k) => {
          const i = r + k
          if (!out[i]) out[i] = { ...VAZIA }
          const n = parseNumeroBR(v)
          out[i] = { ...out[i], [c]: NUMERICA(c) ? (n !== null && n >= 0 ? n : out[i][c]) : v }
        })
        if (!linhaVazia(out[out.length - 1])) out.push({ ...VAZIA })
        return out
      })
      if (c === 'codigo') resolver(valores)
      setColagem(null)
      return
    }
    const det = detectarColunas(grade)
    const { proximo, novas, tirouVazia } = aplicarColagem(itens, grade, det, r)
    setItens(proximo)
    setColagem({ grade, det, inicio: r, antes: itens, tirouVazia })
    setAviso('')
    resolver(novas.map((n) => n.codigo))
  }
  const remapear = (coluna: number, campo: CampoPlanilha | null) => {
    if (!colagem) return
    const mapa = colagem.det.mapa.map((f, i) => (i === coluna ? campo : f === campo && campo ? null : f))
    const det = { ...colagem.det, mapa }
    const { proximo, novas } = aplicarColagem(colagem.antes, colagem.grade, det, colagem.inicio)
    setItens(proximo)
    setColagem({ ...colagem, det })
    resolver(novas.map((n) => n.codigo))
  }

  // ── seleção de linhas ──
  const clicarNumero = (e: React.MouseEvent, r: number) => {
    setSel((prev) => {
      if (e.shiftKey && ancora.current !== null) {
        const [a, b] = [Math.min(ancora.current, r), Math.max(ancora.current, r)]
        return new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k))
      }
      ancora.current = r
      const n = new Set(e.ctrlKey || e.metaKey ? prev : [])
      if (prev.has(r) && (e.ctrlKey || e.metaKey)) n.delete(r); else n.add(r)
      return n
    })
  }
  const apagar = (linhas: number[]) => {
    mudar((prev) => {
      const out = prev.filter((_, i) => !linhas.includes(i))
      return out.length ? out : [{ ...VAZIA }]
    })
    setSel(new Set())
    setColagem(null)
  }
  const duplicar = () => {
    const ordem = [...sel].sort((a, b) => a - b)
    mudar((prev) => {
      const out = [...prev]
      const ultima = ordem[ordem.length - 1]
      out.splice(ultima + 1, 0, ...ordem.map((i) => ({ ...prev[i] })))
      return out
    })
    setSel(new Set())
  }
  const copiarExcel = async () => {
    try { await navigator.clipboard.writeText(paraExcel(itens)); setAviso('Tabela copiada — cole no Excel com Ctrl+V.') }
    catch { setAviso('O navegador não deixou copiar. Selecione e copie à mão.') }
  }

  const preenchidas = itens.filter((i) => !linhaVazia(i))
  const total = preenchidas.reduce((s, i) => s + i.quantidade * i.preco, 0)

  return (
    <div className="plan-pecas" style={{ padding: '10px 16px 14px' }}>
      <style>{`
        .plan-pecas table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 13px; }
        .plan-pecas th { background: #f3f3f3; color: #444; font-weight: 600; font-size: 12px; height: 26px; border: 1px solid #d4d4d4; padding: 0 6px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .plan-pecas td { border: 1px solid #e1e1e1; padding: 0; height: 28px; position: relative; }
        .plan-pecas td.plan-num { background: #f3f3f3; color: #666; text-align: center; font-size: 11.5px; cursor: pointer; user-select: none; border-color: #d4d4d4; }
        .plan-pecas tr.plan-sel td { background: #e6f1ea; }
        .plan-pecas tr.plan-sel td.plan-num { background: #c8e2d2; color: #1d5c37; font-weight: 700; }
        .plan-pecas .plan-cel:focus-within { outline: 2px solid #217346; outline-offset: -2px; z-index: 1; }
        .plan-pecas input { width: 100%; height: 28px; border: none; outline: none; padding: 0 6px; font: inherit; background: transparent; color: #1a1a1a; box-sizing: border-box; }
        .plan-pecas .plan-dir, .plan-pecas .plan-dir input { text-align: right; font-variant-numeric: tabular-nums; }
        .plan-pecas .plan-calc { padding: 0 6px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
        .plan-pecas .plan-int { background: #fafafa; }
        .plan-pecas .plan-acao { position: absolute; right: 2px; top: 4px; display: none; }
        .plan-pecas td:hover .plan-acao, .plan-pecas td:focus-within .plan-acao { display: block; }
        .plan-pecas .plan-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 4px; border: 1px solid #d4d4d4; background: #fefefe; color: #333; font-size: 12px; font-weight: 600; cursor: pointer; }
        .plan-pecas .plan-btn:disabled { opacity: .45; cursor: default; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>
          Cole do Excel com <b>Ctrl+V</b> · digite o código e <b>Enter</b> puxa descrição e preço · setas, Enter e Tab andam como no Excel
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="plan-btn" onClick={desfazer} title="Desfazer (Ctrl+Z)"><Undo2 size={13} /> Desfazer</button>
        <button type="button" className="plan-btn" onClick={copiarExcel} disabled={preenchidas.length === 0} title="Copia a tabela para colar no Excel"><Copy size={13} /> Copiar para o Excel</button>
      </div>

      {colagem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: '8px 10px', borderRadius: 4, background: '#eef6f0', border: '1px solid #b9dcc5', fontSize: 12.5, color: '#1d5c37' }}>
          <b>Colei {linhasDaColagem(colagem.grade, colagem.det).length} linha(s).</b>
          <span>Entendi as colunas assim:</span>
          {colagem.det.mapa.map((campo, i) => (
            <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#4b7a5c', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={colagem.grade[0]?.[i]}>
                “{(colagem.grade[0]?.[i] || '').slice(0, 14)}”
              </span>
              <select value={campo || ''} onChange={(e) => remapear(i, (e.target.value || null) as CampoPlanilha | null)}
                style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #b9dcc5', background: '#fefefe' }}>
                <option value="">(ignorar)</option>
                {(Object.keys(ROTULO_CAMPO) as CampoPlanilha[]).map((f) => <option key={f} value={f}>{ROTULO_CAMPO[f]}</option>)}
              </select>
            </label>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="plan-btn" onClick={() => { setItens(colagem.antes); setColagem(null) }}><Undo2 size={13} /> Desfazer colagem</button>
          <button type="button" onClick={() => setColagem(null)} title="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b7a5c' }}><X size={14} /></button>
        </div>
      )}
      {aviso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', borderRadius: 4, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: 12.5, color: '#92400e' }}>
          <span style={{ flex: 1 }}>{aviso}</span>
          <button type="button" onClick={() => setAviso('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 860 }}>
          <colgroup>
            <col style={{ width: 36 }} /><col style={{ width: '15%' }} /><col />
            <col style={{ width: 64 }} /><col style={{ width: 104 }} /><col style={{ width: 108 }} />
            <col style={{ width: 112 }} /><col style={{ width: 74 }} /><col style={{ width: 30 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}></th>
              <th>Código</th><th>Descrição</th>
              <th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Unitário</th><th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }} title="Preço de venda atual no cadastro (Omie). Não sai no PDF.">Cadastro</th>
              <th style={{ textAlign: 'right' }} title="Margem sobre o custo médio (CMC). Não sai no PDF.">Margem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, r) => {
              const conf = it.codigo.trim() ? doItem(it.codigo) : null
              const semCadastro = !!conf?.avisos.includes('sem_cadastro')
              // compara a PRÓPRIA linha (o mesmo código pode aparecer em duas linhas com preços diferentes)
              const difere = !!conf && conf.precoCadastro !== null && precoDifere(it.preco, conf.precoCadastro)
              const m = margem(it.preco, conf?.custo)
              const celula = (c: Col, extra?: React.ReactNode) => (
                <td className={`plan-cel${NUMERICA(c) ? ' plan-dir' : ''}`}>
                  <input data-pr={r} data-pc={c} value={valor(r, c)} inputMode={NUMERICA(c) ? 'decimal' : undefined}
                    onChange={(e) => aoMudar(r, c, e.target.value)} onFocus={() => aoEntrar(r, c)} onBlur={() => fecharCelula(r, c)}
                    onKeyDown={(e) => teclado(e, r, c)} onPaste={(e) => colar(e, r, c)}
                    style={c === 'codigo' ? { paddingRight: 26, color: semCadastro ? '#b91c1c' : undefined } : undefined}
                    title={c === 'codigo' && semCadastro ? 'Código não cadastrado' : undefined} />
                  {extra}
                </td>
              )
              return (
                <tr key={r} className={sel.has(r) ? 'plan-sel' : undefined}>
                  <td className="plan-num" onClick={(e) => clicarNumero(e, r)} title="Clique para selecionar (Shift/Ctrl para várias)">{r + 1}</td>
                  {celula('codigo', (
                    <button type="button" className="plan-acao" onMouseDown={(e) => e.preventDefault()} onClick={() => onBuscar(r)} title="Buscar no cadastro"
                      style={{ border: 'none', background: '#fefefe', cursor: 'pointer', padding: 2, borderRadius: 3 }}><Search size={13} color="#666" /></button>
                  ))}
                  {celula('descricao')}
                  {celula('quantidade')}
                  {celula('preco')}
                  <td><div className="plan-calc" style={{ fontWeight: 600 }}>{linhaVazia(it) ? '' : formatarMoedaBR(it.quantidade * it.preco)}</div></td>
                  <td className="plan-int">
                    {conf && conf.precoCadastro !== null ? (
                      difere ? (
                        <button type="button" onClick={() => mudar((prev) => prev.map((x, i) => (i === r ? { ...x, preco: conf.precoCadastro! } : x)))}
                          title="Preço diferente do cadastro — clique para usar o do cadastro"
                          style={{ width: '100%', height: 28, border: 'none', background: '#fff7e0', color: '#b45309', fontWeight: 700, cursor: 'pointer', textAlign: 'right', padding: '0 6px', font: 'inherit', fontVariantNumeric: 'tabular-nums' }}>
                          {it.preco < conf.precoCadastro ? '▲' : '▼'} {formatarMoedaBR(conf.precoCadastro)}
                        </button>
                      ) : <div className="plan-calc" style={{ color: '#666' }}>{formatarMoedaBR(conf.precoCadastro)}</div>
                    ) : <div className="plan-calc" style={{ color: semCadastro ? '#b91c1c' : '#aaa', fontSize: 11.5 }}>{semCadastro ? 'não cadastrado' : ''}</div>}
                  </td>
                  <td className="plan-int">
                    <div className="plan-calc" style={{ color: m === null ? '#aaa' : m < 0 ? '#b91c1c' : m < 0.15 ? '#b45309' : '#1d5c37', fontWeight: m !== null && m < 0 ? 700 : 500, fontSize: m === null ? 11.5 : undefined }}
                      title={conf?.custo ? `Custo ${formatarMoedaBR(conf.custo)}` : undefined}>
                      {m === null ? (it.codigo.trim() && !semCadastro && it.preco > 0 ? 'sem custo' : '') : `${(m * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!(itens.length === 1 && linhaVazia(it)) && (
                      <button type="button" onClick={() => apagar([r])} title="Apagar linha" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 2 }}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ border: 'none', paddingTop: 8 }}>
                {sel.size > 0 ? (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button type="button" className="plan-btn" onClick={() => apagar([...sel])}><Trash2 size={13} /> Apagar {sel.size === 1 ? 'linha' : `${sel.size} linhas`}</button>
                    <button type="button" className="plan-btn" onClick={duplicar}><CopyPlus size={13} /> Duplicar</button>
                    <button type="button" className="plan-btn" onClick={() => setSel(new Set())}>Limpar seleção</button>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: '#888' }}>{preenchidas.length} {preenchidas.length === 1 ? 'item' : 'itens'}</span>
                )}
              </td>
              <td style={{ border: 'none', paddingTop: 8, textAlign: 'right', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>R$ {formatarMoedaBR(total)}</td>
              <td colSpan={3} style={{ border: 'none', paddingTop: 8, fontSize: 11, color: '#999', textAlign: 'right' }}>Cadastro e Margem não saem no PDF</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
