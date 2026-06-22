'use client'
// =============================================================================
// Tela Vencidos (port FIEL de views/vencidos.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - KPIs: total vencido, qtd titulos, maior atraso e split (a pagar/a receber
//    quando tipo='ambos', senao ticket medio).
//  - Faixas de atraso clicaveis (1-30 / 31-60 / 61-90 / 90+) que filtram a lista.
//  - Sub-abas "Lista" e "Por terceiro".
//  - Tabela ordenavel por cabecalho (empresa|nome|doc|venc|atraso|valor) com
//    tooltip flutuante; linhas abrem o modal de detalhes do titulo.
//  - "Por terceiro": agrupa por (tipo|contraparte), barra proporcional ao maior,
//    expande os titulos do terceiro inline.
//  - Modal: detalhes + produtos (fetch) + comentarios (fetch GET/POST/DELETE).
//  - Exportar CSV (UTF-8 BOM, separador ';') e Baixar PDF (janela de impressao).
//  - displayGrupo(): "Despesas Diretas" -> "Custos Diretos" so no display.
//
// A tela nao usa libs de grafico (apenas barras CSS). Toda a logica do <script>
// inline da fonte foi convertida em estado/efeitos React + render JSX.
//
// O toggle de TIPO (A Pagar / A Receber / Ambos) vinha do header global na fonte;
// como o layout do modulo do portal so expoe o seletor de CONTA, o toggle de TIPO
// e replicado localmente nesta tela (default 'pagar' = pegaTipo da fonte).
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro' e a sub-nav; ainda assim importamos useAuth/usePermissoes e
// SemPermissao por consistencia com o padrao do portal.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos KPIs/faixas/PDF/CSV.
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  const v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + (a / 1000).toFixed(1).replace('.', ',') + 'k'
  return s + 'R$ ' + a.toFixed(0)
}
function fmtBRLfull(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
}
function fmtData(iso) {
  if (!iso) return ''
  const p = String(iso).slice(0, 10).split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}
function esc(s) {
  // Usado apenas no HTML gerado para o PDF (window.open + document.write).
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  })
}
function empresaLabel(c) {
  const s = String(c || '').toUpperCase()
  if (s === 'NOVA') return 'Nova'
  if (s === 'CASTRO') return 'Castro'
  return c || '—'
}
function corAtraso(d) {
  if (d > 90) return 'bg-red-700 text-white'
  if (d > 60) return 'bg-red-500 text-white'
  if (d > 30) return 'bg-orange-500 text-white'
  return 'bg-amber-400 text-amber-900'
}
function docDe(t) {
  let doc = t.numero_documento_fiscal ? ('NF ' + t.numero_documento_fiscal)
    : (t.numero_documento ? ('Doc ' + t.numero_documento) : '')
  if (t.numero_parcela) doc += (doc ? ' · ' : '') + 'Parc ' + t.numero_parcela
  return doc
}
function uidDe(t) { return t.tipo + ':' + t.codigo_lancamento }

// Renomeia labels de grupo do Omie para o termo usado internamente.
function displayGrupo(g) {
  if (!g) return ''
  if (String(g).trim().toLowerCase() === 'despesas diretas') return 'Custos Diretos'
  return String(g)
}

function fmtDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = (n) => (n < 10 ? '0' : '') + n
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// ---------------------------------------------------------------------------
// Identidade do autor (provisoria, ate ter login Supabase): nome + token
// aleatorio salvos no navegador. O token controla quem pode excluir o proprio.
// ---------------------------------------------------------------------------
function autorToken() {
  if (typeof localStorage === 'undefined') return ''
  let t = localStorage.getItem('coment_token')
  if (!t) { t = 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('coment_token', t) }
  return t
}
function autorNome(forcar) {
  if (typeof localStorage === 'undefined') return ''
  let n = localStorage.getItem('coment_autor')
  if (!n || forcar) {
    n = (prompt('Seu nome (aparece nos comentarios):', n || '') || '').trim()
    if (n) localStorage.setItem('coment_autor', n)
  }
  return n
}

// ---------------------------------------------------------------------------
// Constantes de UI (port fiel das vars do <script> da fonte)
// ---------------------------------------------------------------------------
const CORES_FAIXA = {
  '1-30': 'bg-amber-50 border-amber-300 text-amber-800',
  '31-60': 'bg-orange-50 border-orange-300 text-orange-800',
  '61-90': 'bg-red-50 border-red-300 text-red-800',
  '90+': 'bg-red-100 border-red-400 text-red-900',
  'ult180': 'bg-slate-50 border-slate-300 text-slate-700',
}
const LABEL_FAIXA = {
  '1-30': '1 a 30 dias', '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias', '90+': 'Mais de 90 dias',
  'ult180': 'Últimos 180 dias',
}

// Definicao das colunas da tabela (ordenaveis, com tooltip)
const COLUNAS = [
  { key: 'empresa', label: 'Empresa', align: 'left', tip: 'Empresa de origem do título: Nova Tratores ou Castro Peças.' },
  { key: 'nome', label: 'Terceiro', align: 'left', tip: 'Cliente (a receber) ou fornecedor (a pagar) do título.' },
  { key: 'doc', label: 'Documento', align: 'left', tip: 'Número da nota fiscal, do documento e da parcela.' },
  { key: 'venc', label: 'Vencimento', align: 'left', tip: 'Data em que o título venceu.' },
  { key: 'atraso', label: 'Atraso', align: 'center', tip: 'Dias corridos entre o vencimento e hoje.' },
  { key: 'valor', label: 'Valor em aberto', align: 'right', tip: 'Valor ainda devido (documento menos o que já foi pago).' },
]
function sortVal(t, key) {
  switch (key) {
    case 'empresa': return empresaLabel(t.conta_omie)
    case 'nome': return (t.nome || '').toLowerCase()
    case 'doc': return (t.numero_documento_fiscal || t.numero_documento || '')
    case 'venc': return t.data_vencimento || ''
    case 'atraso': return t.dias_atraso
    case 'valor': return t.valor_aberto
  }
  return ''
}

// Badge de empresa (JSX) — espelha empresaBadge() da fonte.
function EmpresaBadge({ conta }) {
  const s = String(conta || '').toUpperCase()
  const cls = s === 'NOVA' ? 'bg-blue-100 text-blue-800'
    : s === 'CASTRO' ? 'bg-purple-100 text-purple-800'
      : 'bg-slate-100 text-slate-700'
  return <span className={'inline-block px-2 py-0.5 rounded text-xs font-bold ' + cls}>{empresaLabel(conta)}</span>
}
// Badge de tipo (JSX) — espelha tipoBadge() da fonte.
function TipoBadge({ tipo }) {
  if (tipo === 'receber') return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Receber</span>
  return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">Pagar</span>
}

export default function VencidosPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado (espelha as vars do IIFE da fonte) ----------------------------
  // TIPO replicado localmente (na fonte vinha do header global). Default 'pagar'.
  const [tipo, setTipo] = useState('pagar') // 'pagar' | 'receber' | 'ambos'
  const [dados, setDados] = useState(null)   // resposta da API
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState('lista')        // 'lista' | 'terceiro'
  const [faixaFiltro, setFaixaFiltro] = useState(null) // null = todas; senao '1-30' etc.
  const [sortCol, setSortCol] = useState('atraso')     // empresa|nome|doc|venc|atraso|valor
  const [sortDir, setSortDir] = useState('desc')       // asc|desc

  // index titulo por uid (reconstruido a cada carga) — para o modal
  const porUid = useRef({})

  // Tooltip flutuante (port de initTip/showTip/hideTip da fonte)
  const [tip, setTip] = useState({ show: false, text: '', left: 0, top: 0 })
  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect()
    // largura aproximada do tooltip (max-w-xs ~ 320) para o clamp horizontal
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 320 - 8)
    setTip({ show: true, text, left, top: r.bottom + 6 })
  }
  function hideTip() { setTip((s) => ({ ...s, show: false })) }

  // Estado do modal de detalhes do titulo
  const [modalTitulo, setModalTitulo] = useState(null) // objeto titulo ou null
  const [produtos, setProdutos] = useState({ estado: 'idle', itens: [] })
  const [coment, setComent] = useState({ estado: 'idle', lista: [] })
  const [comentInput, setComentInput] = useState('')
  const [enviandoComent, setEnviandoComent] = useState(false)
  const [meuNome, setMeuNome] = useState('—') // rerender quando trocar o nome

  // Terceiros expandidos (chave -> bool) na aba "Por terceiro"
  const [expandidos, setExpandidos] = useState({})

  // Sincroniza o nome exibido no rodape do formulario de comentario.
  useEffect(() => {
    if (typeof localStorage !== 'undefined') setMeuNome(localStorage.getItem('coment_autor') || '—')
  }, [modalTitulo])

  // =========================================================================
  // carregar(): fetch /api/dre-financeiro/vencidos?conta=&tipo=
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  const carregar = useCallback(() => {
    setCarregando(true)
    setErro('')
    const qs = 'conta=' + encodeURIComponent(conta) + '&tipo=' + encodeURIComponent(tipo)
    fetch('/api/dre-financeiro/vencidos?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setErro(d.erro); setDados(null); setCarregando(false); return }
        const idx = {}
          ; (d.titulos || []).forEach((t) => { idx[uidDe(t)] = t })
        porUid.current = idx
        setDados(d)
        setCarregando(false)
      })
      .catch((e) => { setErro('Falha ao carregar: ' + e.message); setDados(null); setCarregando(false) })
  }, [conta, tipo])

  // Recarrega ao trocar conta/tipo (espelha a IIFE + os reloads da fonte).
  // Tambem reseta filtros/abas para o estado inicial da nova consulta.
  useEffect(() => {
    setFaixaFiltro(null)
    setExpandidos({})
    carregar()
  }, [carregar])

  // Fecha o modal com ESC (port fiel do listener da fonte).
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setModalTitulo(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // =========================================================================
  // titulosFiltrados(): aplica faixaFiltro + ordenacao (port fiel)
  // =========================================================================
  const titulosFiltrados = useCallback(() => {
    if (!dados) return []
    let lista = dados.titulos.slice()
    if (faixaFiltro) {
      if (faixaFiltro === 'ult180') lista = lista.filter((t) => Number(t.dias_atraso) <= 180)
      else lista = lista.filter((t) => t.faixa === faixaFiltro)
    }
    const dir = sortDir === 'asc' ? 1 : -1
    lista.sort((a, b) => {
      const va = sortVal(a, sortCol), vb = sortVal(b, sortCol)
      let r
      if (typeof va === 'number' && typeof vb === 'number') r = va - vb
      else r = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' })
      if (r === 0) r = b.dias_atraso - a.dias_atraso // desempate
      return r * dir
    })
    return lista
  }, [dados, faixaFiltro, sortCol, sortDir])

  // =========================================================================
  // Modal: produtos + comentarios (port fiel de carregarProdutos/Comentarios)
  // =========================================================================
  function abrirModal(uid) {
    const t = porUid.current[uid]
    if (!t) return
    setModalTitulo(t)
    setComentInput('')
    carregarProdutos(t)
    carregarComentarios(t)
  }
  function fecharModal() { setModalTitulo(null) }

  function carregarProdutos(t) {
    setProdutos({ estado: 'carregando', itens: [] })
    fetch('/api/dre-financeiro/titulos/' + encodeURIComponent(t.tipo) + '/' + encodeURIComponent(t.codigo_lancamento) + '/produtos')
      .then((r) => r.json())
      .then((d) => setProdutos({ estado: 'ok', itens: (d && d.produtos) || [] }))
      .catch(() => setProdutos({ estado: 'ok', itens: [] }))
  }

  function carregarComentarios(t) {
    setComent({ estado: 'carregando', lista: [] })
    fetch('/api/dre-financeiro/titulos/' + encodeURIComponent(t.tipo) + '/' + encodeURIComponent(t.codigo_lancamento) + '/comentarios?autor_token=' + encodeURIComponent(autorToken()))
      .then((r) => r.json())
      .then((d) => setComent({ estado: 'ok', lista: (d && d.comentarios) || [] }))
      .catch(() => setComent({ estado: 'erro', lista: [] }))
  }

  function enviarComentario() {
    const t = modalTitulo
    if (!t) return
    const texto = (comentInput || '').trim()
    if (!texto) return
    const nome = autorNome(false)
    if (!nome) { alert('Informe seu nome para comentar.'); return }
    setMeuNome(localStorage.getItem('coment_autor') || '—')
    setEnviandoComent(true)
    fetch('/api/dre-financeiro/titulos/' + encodeURIComponent(t.tipo) + '/' + encodeURIComponent(t.codigo_lancamento) + '/comentarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentario: texto, autor_nome: nome, autor_token: autorToken(), conta_omie: t.conta_omie }),
    }).then((r) => r.json()).then((d) => {
      if (d.erro) { alert(d.erro); setEnviandoComent(false); return }
      setComentInput('')
      setEnviandoComent(false)
      carregarComentarios(t)
    }).catch(() => { alert('Falha ao enviar.'); setEnviandoComent(false) })
  }

  function excluirComentario(id) {
    const t = modalTitulo
    if (!t) return
    if (!confirm('Excluir este comentario?')) return
    fetch('/api/dre-financeiro/comentarios/' + encodeURIComponent(id) + '?autor_token=' + encodeURIComponent(autorToken()), { method: 'DELETE' })
      .then((r) => r.json()).then((d) => {
        if (d.erro) { alert(d.erro); return }
        carregarComentarios(t)
      }).catch(() => { alert('Falha ao excluir.') })
  }

  function trocarNome() {
    autorNome(true)
    setMeuNome(localStorage.getItem('coment_autor') || '—')
  }

  // =========================================================================
  // CSV (UTF-8 BOM, sep ';') — port fiel de exportarCSV()
  // =========================================================================
  function exportarCSV() {
    const lista = titulosFiltrados()
    const sep = ';'
    const head = ['Empresa', 'Tipo', 'Terceiro', 'Documento', 'NF', 'Parcela', 'Grupo', 'Categoria',
      'Emissao', 'Vencimento', 'Dias atraso', 'Valor documento', 'Valor pago', 'Valor em aberto']
    const cell = (v) => { v = (v == null ? '' : String(v)); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
    const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',')
    const linhas = lista.map((t) => [
      empresaLabel(t.conta_omie),
      t.tipo === 'receber' ? 'Receber' : 'Pagar',
      t.nome || '', t.numero_documento || '', t.numero_documento_fiscal || '', t.numero_parcela || '',
      t.grupo_categoria || '', t.descricao_categoria || '',
      fmtData(t.data_emissao), fmtData(t.data_vencimento), t.dias_atraso,
      num(t.valor_documento), num(t.valor_pago), num(t.valor_aberto),
    ].map(cell).join(sep))
    const csv = '﻿' + [head.join(sep)].concat(linhas).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vencidos_' + tipo + (faixaFiltro ? '_' + faixaFiltro : '') + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // =========================================================================
  // PDF (janela de impressao -> "Salvar como PDF") — port fiel de exportarPDF()
  // =========================================================================
  function exportarPDF() {
    const lista = titulosFiltrados()
    const totalAberto = lista.reduce((s, t) => s + (Number(t.valor_aberto) || 0), 0)
    const agora = new Date()
    const p = (n) => (n < 10 ? '0' : '') + n
    const dataStr = p(agora.getDate()) + '/' + p(agora.getMonth() + 1) + '/' + agora.getFullYear() + ' ' + p(agora.getHours()) + ':' + p(agora.getMinutes())
    const contaTxt = (conta === 'todas' || !conta) ? 'Todas as empresas' : empresaLabel(conta)
    const tipoTxt = tipo === 'receber' ? 'A receber' : (tipo === 'ambos' ? 'Pagar + Receber' : 'A pagar')
    const faixaTxt = faixaFiltro ? (' · Faixa: ' + (LABEL_FAIXA[faixaFiltro] || faixaFiltro)) : ''
    const periodoTxt = faixaFiltro === 'ult180' ? ' · Últimos 180 dias' : ''

    const rows = lista.map((t) => '<tr>' +
      '<td>' + esc(empresaLabel(t.conta_omie)) + '</td>' +
      '<td>' + esc(t.nome || '') + '</td>' +
      '<td>' + esc(docDe(t)) + '</td>' +
      '<td>' + esc(displayGrupo(t.grupo_categoria)) + '</td>' +
      '<td class="r">' + esc(fmtData(t.data_vencimento)) + '</td>' +
      '<td class="r">' + t.dias_atraso + 'd</td>' +
      '<td class="r">' + fmtBRLfull(t.valor_aberto) + '</td>' +
      '</tr>').join('')

    const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vencidos ' + dataStr + '</title>' +
      '<style>' +
      '*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:24px;font-size:12px}' +
      'h1{font-size:18px;margin:0 0 2px} .sub{color:#64748b;font-size:11px;margin-bottom:12px}' +
      '.tot{display:flex;gap:24px;margin:10px 0 14px;font-size:13px}' +
      '.tot b{font-size:16px;color:#dc2626}' +
      'table{width:100%;border-collapse:collapse} th,td{padding:5px 7px;border-bottom:1px solid #e2e8f0;text-align:left}' +
      'th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#475569}' +
      'td.r,th.r{text-align:right} tr:nth-child(even) td{background:#fafafa}' +
      '@media print{body{margin:10mm} .noprint{display:none}}' +
      '</style></head><body>' +
      '<h1>⚠️ Títulos Vencidos</h1>' +
      '<div class="sub">' + esc(contaTxt) + ' · ' + esc(tipoTxt) + esc(faixaTxt) + esc(periodoTxt) + ' · Gerado em ' + dataStr + '</div>' +
      '<div class="tot"><div>Total em aberto: <b>' + fmtBRLfull(totalAberto) + '</b></div><div>Títulos: <b style="color:#1e293b">' + lista.length + '</b></div></div>' +
      '<table><thead><tr><th>Empresa</th><th>Terceiro</th><th>Documento</th><th>Grupo</th>' +
      '<th class="r">Vencimento</th><th class="r">Atraso</th><th class="r">Valor em aberto</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>' +
      '</body></html>'

    const w = window.open('', '_blank')
    if (!w) { alert('Permita pop-ups para baixar o PDF.'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  // =========================================================================
  // Ordenacao por cabecalho (port fiel de bindTabela)
  // =========================================================================
  function clicarCabecalho(key) {
    if (key === sortCol) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')) }
    else { setSortCol(key); setSortDir((key === 'atraso' || key === 'valor' || key === 'venc') ? 'desc' : 'asc') }
    hideTip()
  }
  function setaCol(key) {
    if (key !== sortCol) return <span className="text-slate-300">⇅</span>
    return sortDir === 'asc' ? <span className="text-slate-700">▲</span> : <span className="text-slate-700">▼</span>
  }

  function clicarFaixa(f) {
    setFaixaFiltro((cur) => (cur === f ? null : f))
  }

  // --- Gate de permissao (por consistencia; o layout ja faz o gate) ---------
  if (loading || loadingPerm) {
    return <div className="p-8 text-center text-slate-400">Carregando...</div>
  }
  if (userProfile && !temAcesso('financeiro')) {
    return <SemPermissao />
  }

  const showTipo = (tipo === 'ambos')
  const inativoToggle = 'bg-white text-slate-700 hover:bg-slate-100'

  // --- KPIs derivados -------------------------------------------------------
  const k = dados ? dados.kpis : null
  const ticketMedio = k && k.count ? k.total / k.count : 0

  // --- Lista filtrada/ordenada para a aba "Lista" ---------------------------
  const lista = titulosFiltrados()
  const totalFiltro = lista.reduce((s, t) => s + t.valor_aberto, 0)

  // =========================================================================
  // "Por terceiro": agrupa (port fiel de renderTerceiro)
  // =========================================================================
  const base = (dados ? dados.titulos : [])
    .filter((t) => {
      if (!faixaFiltro) return true
      if (faixaFiltro === 'ult180') return Number(t.dias_atraso) <= 180
      return t.faixa === faixaFiltro
    })
  let grupos = []
  let maxTotal = 1
  if (tab === 'terceiro') {
    const mapa = {}
    base.forEach((t) => {
      const ch = t.tipo + '|' + (t.codigo_contraparte || ('nome:' + (t.nome || 'sem')))
      if (!mapa[ch]) mapa[ch] = { chave: ch, tipo: t.tipo, nome: t.nome || 'Sem nome', conta: t.conta_omie, total: 0, count: 0, maxAtraso: 0 }
      mapa[ch].total += t.valor_aberto; mapa[ch].count += 1
      if (t.dias_atraso > mapa[ch].maxAtraso) mapa[ch].maxAtraso = t.dias_atraso
    })
    grupos = Object.keys(mapa).map((kk) => mapa[kk]).sort((a, b) => b.total - a.total)
    maxTotal = grupos.length ? grupos[0].total : 1
  }
  // Titulos de um terceiro (para a linha expandida)
  function titulosDoTerceiro(chave) {
    return base.filter((t) => {
      const kk = t.tipo + '|' + (t.codigo_contraparte || ('nome:' + (t.nome || 'sem')))
      return kk === chave
    }).sort((a, b) => b.dias_atraso - a.dias_atraso)
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">⚠️ Vencidos</h1>
        <span className="text-xs text-slate-500">Títulos em aberto (status ATRASADO no Omie)</span>

        {/* Toggle de TIPO (replicado da header global da fonte) */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm ml-2" role="group">
          <button type="button" onClick={() => setTipo('pagar')}
            className={'px-3 py-1 transition ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>A Pagar</button>
          <button type="button" onClick={() => setTipo('receber')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>A Receber</button>
          <button type="button" onClick={() => setTipo('ambos')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Ambos</button>
        </div>

        {/* Sub-abas */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm ml-2">
          <button type="button" onClick={() => { setTab('lista'); hideTip() }}
            className={'px-3 py-1 transition ' + (tab === 'lista' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>Lista</button>
          <button type="button" onClick={() => { setTab('terceiro'); hideTip() }}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tab === 'terceiro' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>Por terceiro</button>
        </div>

        <button type="button" onClick={exportarPDF}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition">
          ⬇ Baixar PDF
        </button>
        <button type="button" onClick={exportarCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition">
          ⬇ Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total vencido</div>
          <div className="text-3xl font-bold text-red-600 mt-1">{k ? fmtBRL(k.total) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Títulos</div>
          <div className="text-3xl font-bold text-slate-800 mt-1">{k ? k.count : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Maior atraso</div>
          <div className="text-3xl font-bold text-slate-800 mt-1">{k ? ((k.maiorAtraso || 0) + ' dias') : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">{tipo === 'ambos' ? 'A Pagar / A Receber' : 'Ticket médio'}</div>
          <div className="mt-1">
            {!k ? '--' : tipo === 'ambos' ? (
              <>
                <div className="text-lg font-bold text-red-700">{fmtBRL(k.totalPagar)} <span className="text-xs font-normal text-slate-500">a pagar</span></div>
                <div className="text-lg font-bold text-emerald-700">{fmtBRL(k.totalReceber)} <span className="text-xs font-normal text-slate-500">a receber</span></div>
              </>
            ) : (
              <div className="text-3xl font-bold text-slate-800">{fmtBRL(ticketMedio)}</div>
            )}
          </div>
        </div>
      </div>

      {/* Faixas de atraso (clicaveis: filtram a lista) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {dados && (() => {
          const extra = {
            faixa: 'ult180',
            total: (dados.titulos || []).reduce((sum, t) => sum + (Number(t.dias_atraso) <= 180 ? Number(t.valor_aberto) || 0 : 0), 0),
            count: (dados.titulos || []).filter((t) => Number(t.dias_atraso) <= 180).length,
          }
          return [...dados.faixas, extra].map((f) => {
            const ativo = faixaFiltro === f.faixa
            const cls = CORES_FAIXA[f.faixa] || 'bg-slate-50 border-slate-300 text-slate-700'
            const ring = ativo ? 'ring-2 ring-offset-1 ring-slate-700' : ''
            return (
              <button key={f.faixa} type="button" onClick={() => clicarFaixa(f.faixa)}
                className={'text-left p-3 rounded-lg border ' + cls + ' ' + ring + ' hover:shadow transition'}>
                <div className="text-xs font-semibold uppercase tracking-wide">{LABEL_FAIXA[f.faixa]}</div>
                <div className="text-2xl font-bold mt-1">{fmtBRL(f.total)}</div>
                <div className="text-xs opacity-80">{f.count} título{f.count !== 1 ? 's' : ''}</div>
              </button>
            )
          })
        })()}
      </div>

      {/* Conteudo da aba */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {carregando ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : erro ? (
          <div className="p-8 text-center text-red-600">{erro}</div>
        ) : tab === 'terceiro' ? (
          // ---------------------------- Por terceiro ----------------------------
          <>
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
              <b>{grupos.length}</b> terceiro{grupos.length !== 1 ? 's' : ''}
              {faixaFiltro ? ' · faixa ' + LABEL_FAIXA[faixaFiltro] : ''}
              {' · clique para ver os títulos'}
            </div>
            {grupos.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 font-medium">Nenhum título vencido. 🎉</div>
            ) : grupos.map((g, i) => {
              const pct = Math.max(2, 100 * g.total / maxTotal)
              const aberto = !!expandidos[g.chave]
              return (
                <div key={g.chave} className="border-b border-slate-100">
                  <button type="button" onClick={() => setExpandidos((s) => ({ ...s, [g.chave]: !s[g.chave] }))}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center gap-3">
                    <div className="text-slate-400 font-bold w-6 text-right">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate text-base">
                        <EmpresaBadge conta={g.conta} />{' '}
                        {showTipo ? <><TipoBadge tipo={g.tipo} />{' '}</> : null}
                        {g.nome}
                      </div>
                      <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={'h-full ' + (g.tipo === 'receber' ? 'bg-emerald-500' : 'bg-red-500')} style={{ width: pct + '%' }} />
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-lg font-bold text-red-700">{fmtBRL(g.total)}</div>
                      <div className="text-xs text-slate-500">{g.count} tít. · até {g.maxAtraso}d</div>
                    </div>
                    <div className="text-slate-400">{aberto ? '▾' : '▸'}</div>
                  </button>
                  {aberto && (
                    <div className="bg-slate-50/60 px-4 pb-3">
                      <table className="w-full text-sm">
                        <tbody>
                          {titulosDoTerceiro(g.chave).map((t) => (
                            <tr key={uidDe(t)} onClick={() => abrirModal(uidDe(t))}
                              className="border-t border-slate-200 cursor-pointer hover:bg-white">
                              <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">{docDe(t)}</td>
                              <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">venc {fmtData(t.data_vencimento)}</td>
                              <td className="py-1.5 pr-2 text-center">
                                <span className={'inline-block px-1.5 py-0.5 rounded-full text-xs font-bold ' + corAtraso(t.dias_atraso)}>{t.dias_atraso}d</span>
                              </td>
                              <td className="py-1.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                                {fmtBRLfull(t.valor_aberto)}{t.parcial ? <span className="text-orange-600"> (parc)</span> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        ) : (
          // ------------------------------- Lista --------------------------------
          <>
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm">
              <div className="text-slate-600"><b>{lista.length}</b> título{lista.length !== 1 ? 's' : ''}
                {faixaFiltro ? ' · faixa ' + LABEL_FAIXA[faixaFiltro] : ''}</div>
              <div className="text-slate-600">Total: <b className="text-red-700">{fmtBRLfull(totalFiltro)}</b></div>
            </div>
            {lista.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 font-medium">Nenhum título vencido. 🎉</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-base text-slate-800">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-200">
                      {COLUNAS.map((c) => {
                        const alinha = c.align === 'left' ? 'text-left' : c.align === 'center' ? 'text-center' : 'text-right'
                        return (
                          <th key={c.key} onClick={() => clicarCabecalho(c.key)}
                            onMouseEnter={(e) => showTip(e, c.tip)} onMouseLeave={hideTip}
                            className={'px-4 py-2.5 font-bold ' + alinha + ' cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap'}>
                            <span className="inline-flex items-center gap-1">{c.label} {setaCol(c.key)}</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((t) => {
                      const sub = [t.grupo_categoria, t.descricao_categoria].filter(Boolean).join(' · ')
                      return (
                        <tr key={uidDe(t)} onClick={() => abrirModal(uidDe(t))}
                          className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer">
                          <td className="px-4 py-2.5"><EmpresaBadge conta={t.conta_omie} /></td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-900">
                              {showTipo ? <><TipoBadge tipo={t.tipo} />{' '}</> : null}
                              {t.nome || 'Sem nome'}
                              {t.parcial ? <span className="text-[11px] text-orange-600 font-semibold"> (parcial)</span> : null}
                            </div>
                            {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{docDe(t)}</td>
                          <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{fmtData(t.data_vencimento)}</td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-bold ' + corAtraso(t.dias_atraso)}>{t.dias_atraso}d</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{fmtBRLfull(t.valor_aberto)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tooltip flutuante dos cabecalhos */}
      {tip.show && (
        <div className="fixed z-[60] max-w-xs px-3 py-2 rounded-lg bg-slate-900 text-white text-xs leading-snug shadow-xl pointer-events-none"
          style={{ left: tip.left + 'px', top: tip.top + 'px' }}>
          {tip.text}
        </div>
      )}

      {/* Modal de detalhes do titulo */}
      {modalTitulo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-lg">Detalhes do título</h2>
              <button onClick={fecharModal} className="text-slate-400 hover:text-slate-900 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5">
              <ModalBody t={modalTitulo} />
              {/* Produtos */}
              <div className="mt-4">
                {produtos.estado === 'carregando' ? (
                  <div className="text-xs text-slate-400">Carregando produtos...</div>
                ) : produtos.itens.length ? (
                  <>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Produtos</div>
                    <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
                      {produtos.itens.map((pp, idx) => (
                        <li key={idx}>{pp.descricao || '(sem descricao)'}{pp.quantidade ? <span className="text-slate-400"> ({pp.quantidade})</span> : null}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
              {/* Comentarios */}
              <div className="mt-5 pt-4 border-t border-slate-200">
                {coment.estado === 'carregando' ? (
                  <div className="text-xs text-slate-400">Carregando comentarios...</div>
                ) : coment.estado === 'erro' ? (
                  <div className="text-xs text-red-600">Falha ao carregar comentarios.</div>
                ) : (
                  <>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Comentarios ({coment.lista.length})</div>
                    {coment.lista.length === 0 ? (
                      <div className="text-sm text-slate-400 mb-3">Nenhum comentario ainda.</div>
                    ) : (
                      <div className="space-y-2 mb-3">
                        {coment.lista.map((c) => {
                          const autor = c.autor_nome || c.autor_email || 'Anonimo'
                          return (
                            <div key={c.id} className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-700">{autor}</span>
                                <span className="text-[11px] text-slate-400">
                                  {fmtDataHora(c.created_at)}
                                  {c.meu ? <> · <button onClick={() => excluirComentario(c.id)} className="text-red-500 hover:text-red-700 font-semibold">excluir</button></> : null}
                                </span>
                              </div>
                              <div className="text-sm text-slate-800 whitespace-pre-wrap">{c.comentario || ''}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <textarea value={comentInput} onChange={(e) => setComentInput(e.target.value)}
                        rows={2} maxLength={2000} placeholder="Escreva um comentario..."
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">Comentando como <b>{meuNome}</b> · <button onClick={trocarNome} className="underline hover:text-slate-600">trocar nome</button></span>
                        <button onClick={enviarComentario} disabled={enviandoComent}
                          className="bg-slate-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-60">
                          {enviandoComent ? 'Enviando...' : 'Comentar'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Corpo do modal (cabecalho + linhas de detalhe) — port fiel de abrirModal()
// ---------------------------------------------------------------------------
function ModalBody({ t }) {
  // Linha label/valor; omite quando o valor e vazio (igual a funcao linha() da fonte).
  function Linha({ label, children }) {
    return (
      <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800 text-right">{children}</span>
      </div>
    )
  }
  return (
    <>
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <EmpresaBadge conta={t.conta_omie} />
        <TipoBadge tipo={t.tipo} />
        <span className={'inline-block px-2 py-0.5 rounded-full text-xs font-bold ' + corAtraso(t.dias_atraso)}>{t.dias_atraso} dias de atraso</span>
        {t.parcial ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800">Pagamento parcial</span> : null}
      </div>
      <div className="text-lg font-bold text-slate-900 mb-3">{t.nome || 'Sem nome'}</div>
      <div className="text-sm">
        <Linha label="Valor em aberto"><span className="text-red-700">{fmtBRLfull(t.valor_aberto)}</span></Linha>
        <Linha label="Valor do documento">{fmtBRLfull(t.valor_documento)}</Linha>
        {t.valor_pago > 0.01 ? <Linha label="Valor já pago">{fmtBRLfull(t.valor_pago)}</Linha> : null}
        <Linha label="Vencimento">{fmtData(t.data_vencimento)}</Linha>
        {t.data_emissao ? <Linha label="Emissão">{fmtData(t.data_emissao)}</Linha> : null}
        {t.numero_documento_fiscal ? <Linha label="Nota fiscal">{t.numero_documento_fiscal}</Linha> : null}
        {t.numero_documento ? <Linha label="Documento">{t.numero_documento}</Linha> : null}
        {t.numero_parcela ? <Linha label="Parcela">{t.numero_parcela}</Linha> : null}
        {t.grupo_categoria ? <Linha label="Grupo">{displayGrupo(t.grupo_categoria)}</Linha> : null}
        {t.descricao_categoria ? <Linha label="Categoria">{t.descricao_categoria}</Linha> : null}
        {t.codigo_lancamento ? <Linha label="Cód. lançamento">{t.codigo_lancamento}</Linha> : null}
      </div>
    </>
  )
}
