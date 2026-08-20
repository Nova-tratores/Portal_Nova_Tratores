'use client'
// ETIQUETAS DE IDENTIFICAÇÃO DE PEÇAS (módulo PPV) — painel embutível.
// Usado como ABA dentro do PPV (embedded) e também pela rota /ppv/etiquetas.
// Formato por etiqueta:
//     EMPRESA 1
//     CÓDIGO - DESCRIÇÃO - CARACTERÍSTICA DE LOCAÇÃO
// Fonte: produtos_caracteristicas (sync de Ajustes; locação = chaves com #).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ArrowLeft, Loader2, Plus, Printer, QrCode, Search, Tag, Trash2, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import { htmlFolha, htmlRecorte, type BlocoEtiqueta } from '@/lib/ppv/etiquetas-html'
import { casaFiltroColuna, reconciliarOrdem, ControleOrdenacao, SeletorColunas, MenuEngrenagem, type Sort } from '@/components/tabela/ConfigColunas'

interface ItemBusca {
  conta_omie: string
  codigo: string
  descricao: string | null
  caracteristicas: Record<string, string> | null
  /** Data da NF de entrada (só nas "últimas compradas"). */
  chegou?: string | null
}
interface LinhaEtiqueta {
  conta: string // 'NOVA' | 'CASTRO' (cru — vai pro rastreio)
  empresa: string
  codigo: string
  descricao: string
  locacao: string
}
interface Etiqueta {
  id: number
  linhas: LinhaEtiqueta[]
  copias: number
}
interface FolhaHist { id: number; formato: string; rastreado: boolean; usadas: number[]; total: number; criado_nome: string | null; criado_em: string }

function fmtDataHora(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

const EMPRESA_LABEL: Record<string, string> = {
  NOVA: 'NOVA TRATORES',
  CASTRO: 'CASTRO PEÇAS',
}
const EMPRESA_COR: Record<string, string> = {
  NOVA: '#EA580C',
  CASTRO: '#EA580C',
}

// Locação = chaves prefixadas com # (#PRATELEIRA/#ANDAR/#CAIXA), nesta ordem
function locacaoDe(car: Record<string, string> | null): string {
  if (!car) return ''
  const ordem = ['#PRATELEIRA', '#ANDAR', '#CAIXA']
  const pares: string[] = []
  for (const k of ordem) {
    const v = (car[k] || '').trim()
    if (v && !/^0+$/.test(v) && !/^x+$/i.test(v)) pares.push(`${k.slice(1)} ${v}`)
  }
  for (const [k, v] of Object.entries(car)) {
    if (!k.startsWith('#') || ordem.includes(k)) continue
    const val = (v || '').trim()
    if (val) pares.push(`${k.slice(1)} ${val}`)
  }
  return pares.join(' · ')
}

const chaveItem = (i: ItemBusca) => `${i.conta_omie}|${i.codigo}`

// ── Config de colunas da tabela (filtro/ordenação/seletor, estilo Características) ──
const LOC_KEYS = ['#PRATELEIRA', '#ANDAR', '#CAIXA']
const LABELS_FIXOS: Record<string, string> = {
  empresa: 'Empresa', codigo: 'Código', descricao: 'Descrição',
  '#PRATELEIRA': 'Prateleira', '#ANDAR': 'Andar', '#CAIXA': 'Caixa', chegou: 'Chegou em',
}
const DEFAULT_ORDEM_ETIQ = ['empresa', 'codigo', 'descricao', '#PRATELEIRA', '#ANDAR', '#CAIXA', 'chegou']
const CHAVE_PREF_COLUNAS = 'etiquetas-colunas'
const ORDEM_KEY = (uid: string) => `etiq-ordem-colunas-${uid}`
const OCULTAS_KEY = (uid: string) => `etiq-colunas-ocultas-${uid}`
function labelColEtiq(k: string): string { return LABELS_FIXOS[k] || k.replace(/^#/, '') }

// Valor "limpo" de uma característica (ignora vazio / só-zeros / só-x, como na locação).
function valCarac(car: Record<string, string> | null, k: string): string {
  const v = (car?.[k] || '').trim()
  if (!v || /^0+$/.test(v) || /^x+$/i.test(v)) return ''
  return v
}

// Valor de uma célula (item × coluna) — base do filtro e da ordenação.
function valColEtiq(i: ItemBusca, col: string): string {
  if (col === 'empresa') return EMPRESA_LABEL[i.conta_omie] || i.conta_omie
  if (col === 'codigo') return i.codigo || ''
  if (col === 'descricao') return (i.descricao || '').trim()
  if (col === 'chegou') return i.chegou || ''
  if (col.startsWith('#')) return valCarac(i.caracteristicas, col)
  return (i.caracteristicas?.[col] || '').trim()
}

export default function EtiquetasPanel({ embedded = false }: { embedded?: boolean }) {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)

  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ItemBusca[]>([])
  const [recentes, setRecentes] = useState<ItemBusca[]>([])
  const [carregandoRecentes, setCarregandoRecentes] = useState(true)
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [formato, setFormato] = useState<'folha' | 'recorte'>('folha')
  const [copiasLote, setCopiasLote] = useState(1)
  const [usadas, setUsadas] = useState<Set<number>>(new Set())
  const [rastrear, setRastrear] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const [folhas, setFolhas] = useState<FolhaHist[]>([])
  // Config de colunas (filtro por coluna, ordenação principal+desempate, seletor).
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [sorts, setSorts] = useState<Sort[]>([])
  const [ordemColunas, setOrdemColunas] = useState<string[]>([])
  const [colunasOcultas, setColunasOcultas] = useState<string[]>([])
  const [seletorAberto, setSeletorAberto] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try { setRastrear(localStorage.getItem('etiquetas_rastrear') === '1') } catch { /* segue */ }
  }, [])
  const mudarRastrear = (v: boolean) => {
    setRastrear(v)
    try { localStorage.setItem('etiquetas_rastrear', v ? '1' : '0') } catch { /* segue */ }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/ppv/etiquetas?recentes=1')
        const json = await res.json()
        if (res.ok) setRecentes(json.itens || [])
      } catch { /* silencioso — a busca continua funcionando */ }
      finally { setCarregandoRecentes(false) }
    })()
  }, [])

  // Preferências de colunas (ordem + ocultas) por usuário: Supabase (portal_ui_prefs)
  // com fallback localStorage. Mesmo padrão de /ajustes/caracteristicas.
  useEffect(() => {
    const uid = userProfile?.id
    if (!uid) return
    ;(async () => {
      let ordem: string[] | null = null
      let ocultas: string[] | null = null
      try {
        const r = await fetch(`/api/perfil/ui-prefs?user_id=${encodeURIComponent(uid)}&chave=${CHAVE_PREF_COLUNAS}`)
        if (r.ok) {
          const d = await r.json()
          if (d.valor && typeof d.valor === 'object') {
            if (Array.isArray(d.valor.ordem)) ordem = d.valor.ordem.map(String)
            if (Array.isArray(d.valor.ocultas)) ocultas = d.valor.ocultas.map(String)
          }
        }
      } catch { /* segue pro fallback */ }
      if (!ordem) { try { const raw = localStorage.getItem(ORDEM_KEY(uid)); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) ordem = a } } catch { /* ignore */ } }
      if (!ocultas) { try { const raw = localStorage.getItem(OCULTAS_KEY(uid)); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) ocultas = a } } catch { /* ignore */ } }
      if (ordem) setOrdemColunas(ordem)
      if (ocultas) setColunasOcultas(ocultas)
    })()
  }, [userProfile?.id])

  // Fila COMPARTILHADA + histórico de folhas (persistidos). A fila deixou de ser
  // local: carrega no mount e cada alteração escreve no servidor (todos veem).
  const carregarFolhas = async () => {
    try {
      const res = await fetch('/api/ppv/etiquetas/folhas', { headers: { ...(await authHeaders()) } })
      const json = await res.json()
      if (res.ok) setFolhas(json.folhas || [])
    } catch { /* silencioso */ }
  }
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/ppv/etiquetas/fila', { headers: { ...(await authHeaders()) } })
        const json = await res.json()
        if (res.ok) setEtiquetas((json.fila || []).map((r: { id: number; linhas: LinhaEtiqueta[]; copias: number }) => ({ id: r.id, linhas: r.linhas, copias: r.copias })))
      } catch { /* silencioso */ }
    })()
    carregarFolhas()
  }, [])

  // --- escrita na fila compartilhada (otimista) ---
  const addFilaServer = async (linhas: LinhaEtiqueta[], copias: number) => {
    try {
      const res = await fetch('/api/ppv/etiquetas/fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ linhas, copias }),
      })
      const json = await res.json(); if (!res.ok || json.erro) throw new Error(json.erro || 'falha')
      setEtiquetas(prev => [...prev, { id: json.item.id, linhas: json.item.linhas, copias: json.item.copias }])
    } catch (e) { setErro('Erro ao adicionar à fila: ' + (e instanceof Error ? e.message : e)) }
  }
  // Adição em MASSA: cada peça marcada vira sua própria etiqueta, num único POST.
  const addFilaLoteServer = async (itensLinhas: LinhaEtiqueta[][], copias: number) => {
    if (itensLinhas.length === 0) return
    try {
      const res = await fetch('/api/ppv/etiquetas/fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ itens: itensLinhas.map(linhas => ({ linhas, copias })) }),
      })
      const json = await res.json(); if (!res.ok || json.erro) throw new Error(json.erro || 'falha')
      setEtiquetas(prev => [...prev, ...(json.itens || []).map((r: { id: number; linhas: LinhaEtiqueta[]; copias: number }) => ({ id: r.id, linhas: r.linhas, copias: r.copias }))])
    } catch (e) { setErro('Erro ao adicionar em massa: ' + (e instanceof Error ? e.message : e)) }
  }
  const mudarCopiasServer = async (id: number, copias: number) => {
    const c = Math.max(1, Math.min(50, copias))
    setEtiquetas(prev => prev.map(x => x.id === id ? { ...x, copias: c } : x))
    try { await fetch('/api/ppv/etiquetas/fila', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ id, copias: c }) }) } catch { /* segue */ }
  }
  const removerFilaServer = async (id: number) => {
    setEtiquetas(prev => prev.filter(x => x.id !== id))
    try { await fetch(`/api/ppv/etiquetas/fila?id=${id}`, { method: 'DELETE', headers: { ...(await authHeaders()) } }) } catch { /* segue */ }
  }
  const limparFilaServer = async () => {
    setEtiquetas([])
    try { await fetch('/api/ppv/etiquetas/fila?limpar=1', { method: 'DELETE', headers: { ...(await authHeaders()) } }) } catch { /* segue */ }
  }
  const reimprimir = async (id: number) => {
    try {
      const res = await fetch(`/api/ppv/etiquetas/folhas?id=${id}`, { headers: { ...(await authHeaders()) } })
      const json = await res.json(); if (!res.ok || json.erro) throw new Error(json.erro || 'falha')
      const folha = json.folha as { formato: string; rastreado: boolean; usadas: number[]; itens: { linhas: LinhaEtiqueta[]; numero?: string; unidade_id?: string }[] }
      const w = window.open('', '_blank'); if (!w) { setErro('O navegador bloqueou a janela — libere pop-ups.'); return }
      let blocos: BlocoEtiqueta[] = (folha.itens || []).map(it => ({ linhas: it.linhas }))
      if (folha.rastreado) {
        const qrs = await Promise.all((folha.itens || []).map(it => it.unidade_id
          ? QRCode.toString(`${window.location.origin}/p/${it.unidade_id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
          : Promise.resolve('')))
        blocos = (folha.itens || []).map((it, i) => ({ linhas: it.linhas, qrSvg: qrs[i] || null, numero: it.numero }))
      }
      w.document.open()
      w.document.write(folha.formato === 'recorte' ? htmlRecorte(blocos) : htmlFolha(blocos, new Set(folha.usadas || [])))
      w.document.close()
    } catch (e) { setErro(String(e instanceof Error ? e.message : e)) }
  }

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.trim().length < 2) { setResultados([]); return }
    debounce.current = setTimeout(async () => {
      setBuscando(true)
      setErro('')
      try {
        const res = await fetch(`/api/ppv/etiquetas?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha na busca')
        setResultados(json.itens || [])
      } catch (e) {
        setErro(String(e instanceof Error ? e.message : e))
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 400)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [q])

  if (!pLoading && userProfile && !pode('ppv', 'etiquetas')) return <SemPermissao />

  // Lista mostrada: resultados da busca ou as "últimas compradas" (estado inicial).
  const mostrandoRecentes = q.trim().length < 2
  const listaMostrada = mostrandoRecentes ? recentes : resultados

  // Colunas disponíveis: fixas + localização + 'chegou' (recentes) + demais características presentes.
  const colunasDisponiveis = useMemo(() => {
    const base = ['empresa', 'codigo', 'descricao', ...LOC_KEYS]
    if (mostrandoRecentes) base.push('chegou')
    const extras = new Set<string>()
    for (const i of listaMostrada) {
      if (!i.caracteristicas) continue
      for (const k of Object.keys(i.caracteristicas)) {
        if (!LOC_KEYS.includes(k) && valCarac(i.caracteristicas, k)) extras.add(k)
      }
    }
    return [...base, ...[...extras].sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [listaMostrada, mostrandoRecentes])

  const ordemEfetiva = reconciliarOrdem(ordemColunas.length ? ordemColunas : DEFAULT_ORDEM_ETIQ, colunasDisponiveis)
  const colsVisiveis = ordemEfetiva.filter(k => !colunasOcultas.includes(k))

  // Lista visível = filtro por coluna (AND) + ordenação multi-nível (principal + desempate).
  const linhasVisiveis = useMemo(() => {
    let arr = listaMostrada
    const ativos = Object.entries(filtros).filter(([, v]) => v && v.trim() !== '')
    if (ativos.length) arr = arr.filter(i => ativos.every(([col, v]) => casaFiltroColuna(valColEtiq(i, col), v)))
    if (sorts.length) {
      arr = arr.slice().sort((a, b) => {
        for (const { key, dir } of sorts) {
          const c = valColEtiq(a, key).localeCompare(valColEtiq(b, key), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir
          if (c !== 0) return c
        }
        return 0
      })
    }
    return arr
  }, [listaMostrada, filtros, sorts])

  // Clique no cabeçalho: define a coluna como critério ÚNICO (inverte se já for principal).
  const clicarSort = (key: string) => setSorts(arr => (arr[0]?.key === key ? [{ key, dir: -arr[0].dir }] : [{ key, dir: 1 }]))
  const sortInfo = (key: string) => { const idx = sorts.findIndex(x => x.key === key); return idx < 0 ? null : { pos: idx, dir: sorts[idx].dir } }

  // Persistência das preferências de colunas (localStorage + Supabase).
  const salvarPrefsColunas = async (ordem: string[], ocultas: string[]) => {
    const uid = userProfile?.id
    if (!uid) return
    try { localStorage.setItem(ORDEM_KEY(uid), JSON.stringify(ordem)); localStorage.setItem(OCULTAS_KEY(uid), JSON.stringify(ocultas)) } catch { /* ignore */ }
    try {
      await fetch('/api/perfil/ui-prefs', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, chave: CHAVE_PREF_COLUNAS, valor: { ordem, ocultas } }),
      })
    } catch { /* best-effort */ }
  }
  const aplicarColunas = (ordem: string[], ocultas: string[]) => {
    setOrdemColunas(ordem); setColunasOcultas(ocultas); setSeletorAberto(false); salvarPrefsColunas(ordem, ocultas)
  }
  const restaurarColunas = () => {
    const ordem = reconciliarOrdem(DEFAULT_ORDEM_ETIQ, colunasDisponiveis)
    setOrdemColunas(ordem); setColunasOcultas([]); salvarPrefsColunas(ordem, [])
  }

  const alternarSel = (k: string) => {
    setSel(prev => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k); else s.add(k)
      return s
    })
  }

  const linhaDe = (i: ItemBusca): LinhaEtiqueta => ({
    conta: i.conta_omie,
    empresa: EMPRESA_LABEL[i.conta_omie] || i.conta_omie,
    codigo: i.codigo,
    descricao: (i.descricao || '').trim(),
    locacao: locacaoDe(i.caracteristicas),
  })

  const clicarLinha = (i: ItemBusca) => alternarSel(chaveItem(i))

  // Peças marcadas (dedupe). Varre resultados E recentes porque a seleção persiste
  // entre buscas (o usuário pode marcar em "últimas compradas" e depois buscar).
  const itensSelecionados = (): ItemBusca[] => {
    const vistos = new Set<string>()
    return [...resultados, ...recentes].filter(i => {
      const k = chaveItem(i)
      if (!sel.has(k) || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
  }

  // "Juntar em 1 etiqueta" — mesma peça em 2 empresas (NOVA+CASTRO), máx. 2.
  const juntarEtiqueta = () => {
    const linhas = itensSelecionados()
      .map(linhaDe)
      .sort((a, b) => a.empresa.localeCompare(b.empresa) * -1)
    if (linhas.length === 0) return
    if (linhas.length > 2) {
      setErro('Para "juntar" use no máximo 2 peças (uma por empresa). Para muitas, use "Adicionar como etiquetas separadas".')
      return
    }
    setErro('')
    addFilaServer(linhas, 1)
    setSel(new Set())
  }

  // Adição em MASSA — cada peça marcada vira sua própria etiqueta, com copiasLote cópias.
  const adicionarSeparadas = () => {
    const itens = itensSelecionados().map(i => [linhaDe(i)])
    if (itens.length === 0) return
    setErro('')
    addFilaLoteServer(itens, Math.max(1, Math.min(50, copiasLote)))
    setSel(new Set())
  }

  // Marca/desmarca todas as peças VISÍVEIS (respeita o filtro por coluna atual).
  const todasMarcadas = linhasVisiveis.length > 0 && linhasVisiveis.every(i => sel.has(chaveItem(i)))
  const alternarTodas = () => {
    setSel(prev => {
      const s = new Set(prev)
      if (todasMarcadas) linhasVisiveis.forEach(i => s.delete(chaveItem(i)))
      else linhasVisiveis.forEach(i => s.add(chaveItem(i)))
      return s
    })
  }

  const imprimir = async () => {
    if (etiquetas.length === 0 || imprimindo) return
    const fisicas = etiquetas.flatMap(e => Array.from({ length: Math.max(1, e.copias) }, () => e))
    const w = window.open('', '_blank')
    if (!w) { setErro('O navegador bloqueou a janela de impressão — libere pop-ups.'); return }
    setImprimindo(true)
    setErro('')
    let loteId = ''
    try {
      let blocos: BlocoEtiqueta[] = fisicas.map(e => ({ linhas: e.linhas }))
      let itensFolha: { linhas: LinhaEtiqueta[]; numero?: string; unidade_id?: string }[] = fisicas.map(e => ({ linhas: e.linhas }))
      if (rastrear) {
        w.document.write('<p style="font-family:sans-serif;padding:20px;color:#555">Registrando unidades e gerando QR codes…</p>')
        const res = await fetch('/api/pecas/unidades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            etiquetas: fisicas.map(e => ({
              conta_omie: e.linhas[0]?.conta || '',
              codigo: e.linhas[0]?.codigo || '',
              descricao: e.linhas[0]?.descricao || '',
              locacao: e.linhas[0]?.locacao || '',
              ...(e.linhas[1] ? {
                alt_conta_omie: e.linhas[1].conta,
                alt_codigo: e.linhas[1].codigo,
                alt_descricao: e.linhas[1].descricao,
                alt_locacao: e.linhas[1].locacao,
              } : {}),
            })),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Falha ao registrar as unidades de rastreio.')
        loteId = json.lote_id || ''
        const unidades: { id: string; numero: string; codigo: string }[] = json.unidades || []
        if (unidades.length !== fisicas.length) throw new Error('Registro de unidades incompleto — tente de novo.')
        for (let i = 0; i < fisicas.length; i++) {
          if (String(unidades[i].codigo).trim() !== String(fisicas[i].linhas[0]?.codigo || '').trim()) {
            throw new Error('Pareamento etiqueta↔QR divergiu — nada foi impresso, tente de novo.')
          }
        }
        const qrs = await Promise.all(unidades.map(u =>
          QRCode.toString(`${window.location.origin}/p/${u.id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })))
        blocos = fisicas.map((e, i) => ({ linhas: e.linhas, qrSvg: qrs[i], numero: unidades[i].numero }))
        itensFolha = fisicas.map((e, i) => ({ linhas: e.linhas, numero: unidades[i].numero, unidade_id: unidades[i].id }))
      }
      w.document.open()
      w.document.write(formato === 'folha' ? htmlFolha(blocos, usadas) : htmlRecorte(blocos))
      w.document.close()
      // registra a folha no histórico (snapshot p/ reimprimir) e esvazia a fila
      // COMPARTILHADA — o que foi impresso sai da fila e vira "folha" consultável.
      try {
        await fetch('/api/ppv/etiquetas/folhas', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ formato, rastreado: rastrear, usadas: Array.from(usadas), itens: itensFolha }),
        })
      } catch { /* histórico é best-effort — não trava a impressão */ }
      await limparFilaServer()
      setUsadas(new Set())
      carregarFolhas()
    } catch (e) {
      w.close()
      setErro(String(e instanceof Error ? e.message : e))
      if (loteId) {
        try {
          await fetch(`/api/pecas/unidades?lote_id=${encodeURIComponent(loteId)}`, {
            method: 'DELETE',
            headers: await authHeaders(),
          })
        } catch { /* fica pro depto cancelar na fila */ }
      }
    } finally {
      setImprimindo(false)
    }
  }

  const INP: React.CSSProperties = { width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 14, boxSizing: 'border-box', background: 'var(--portal-bg-card)', outline: 'none', color: 'var(--portal-text)' }

  const totalFisicas = etiquetas.reduce((s, e) => s + Math.max(1, e.copias), 0)

  return (
    <div style={{ padding: embedded ? '18px 22px 40px' : '18px 22px', maxWidth: 1100, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {!embedded && (
          <Link href="/ppv" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
            <ArrowLeft size={15} /> PPV
          </Link>
        )}
        <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag size={18} color="#e8730c" /> Etiquetas de identificação de peças
        </h1>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
        Busque as peças (ou uma prateleira inteira, ex.: <em>PRATELEIRA 3</em>), <strong>marque várias</strong> e
        adicione todas à fila de uma vez — cada uma vira uma etiqueta com
        <strong> EMPRESA → CÓDIGO - DESCRIÇÃO - LOCAÇÃO</strong>, no tamanho da folha adesiva 3×10:
        imprime direto nela e é só descolar, sem recortar.
      </p>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--portal-text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Código, descrição ou locação (ex.: PRATELEIRA 6, ANDAR H ou 3 G 1)…" style={INP} autoFocus={!embedded} />
        {buscando && <Loader2 size={15} className="animate-spin" style={{ position: 'absolute', right: 12, top: 12, color: 'var(--portal-text-muted)' }} />}
      </div>
      {erro && <div style={{ fontSize: 12.5, color: '#EA580C', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {/* Resultados (busca) ou as últimas peças COMPRADAS (estado inicial) */}
      {(() => {
        const lista = listaMostrada
        if (mostrandoRecentes && carregandoRecentes) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--portal-text-muted)', padding: '14px 4px' }}>
              <Loader2 size={14} className="animate-spin" /> Carregando as últimas peças compradas…
            </div>
          )
        }
        if (lista.length === 0) return null
        return (
        <>
        {/* Barra: Ordenar por (principal + desempate) + engrenagem (seletor de colunas) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <ControleOrdenacao cols={colsVisiveis.map(c => ({ key: c, label: labelColEtiq(c) }))} sorts={sorts} setSorts={setSorts} />
          <div style={{ marginLeft: 'auto' }}>
            <MenuEngrenagem ocultasCount={colunasOcultas.length} onColunas={() => setSeletorAberto(true)} onRestaurar={restaurarColunas} />
          </div>
        </div>
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          {mostrandoRecentes && (
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 800, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)' }}>
              📦 Últimas peças compradas (NFs de entrada do Omie)
            </div>
          )}
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', width: 30 }}>
                    <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} title={todasMarcadas ? 'Desmarcar todas' : 'Selecionar todas'} style={{ cursor: 'pointer' }} />
                  </th>
                  {colsVisiveis.map(col => {
                    const si = sortInfo(col)
                    return (
                      <th key={col} onClick={() => clicarSort(col)} title="Clique para ordenar por esta coluna" style={{ padding: '8px 10px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', color: 'var(--portal-text)' }}>
                        {labelColEtiq(col)}
                        {si && <span style={{ marginLeft: 4, color: '#2563eb' }}>{si.dir > 0 ? '▲' : '▼'}{sorts.length > 1 && <sup style={{ fontSize: '.6rem' }}>{si.pos + 1}</sup>}</span>}
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  <th style={{ padding: '0 6px 6px', background: 'var(--portal-bg-secondary)' }} />
                  {colsVisiveis.map(col => (
                    <th key={col} style={{ padding: '0 6px 6px', background: 'var(--portal-bg-secondary)' }}>
                      <input value={filtros[col] || ''} onClick={e => e.stopPropagation()} onChange={e => setFiltros(f => ({ ...f, [col]: e.target.value }))}
                        placeholder="filtrar" title={/^\d/.test(filtros[col] || '') ? 'Número = valor exato' : 'Texto = contém'}
                        style={{ width: '100%', minWidth: 54, border: '1px solid var(--portal-border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map(i => {
                  const k = chaveItem(i)
                  const marcado = sel.has(k)
                  return (
                    <tr key={k} onClick={() => clicarLinha(i)} style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer', background: marcado ? 'rgba(232,115,12,.08)' : 'transparent' }}>
                      <td style={{ padding: '7px 10px' }}>
                        <input type="checkbox" readOnly checked={marcado} />
                      </td>
                      {colsVisiveis.map(col => {
                        if (col === 'empresa') return (
                          <td key={col} style={{ padding: '7px 10px' }}>
                            <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: '#fff', background: EMPRESA_COR[i.conta_omie] || '#6b7280' }}>
                              {EMPRESA_LABEL[i.conta_omie] || i.conta_omie}
                            </span>
                          </td>
                        )
                        if (col === 'codigo') return <td key={col} style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{i.codigo}</td>
                        if (col === 'descricao') return <td key={col} style={{ padding: '7px 10px', color: 'var(--portal-text)' }}>{i.descricao || <em style={{ color: 'var(--portal-text-muted)' }}>sem cadastro de características</em>}</td>
                        const v = valColEtiq(i, col)
                        return <td key={col} style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)', whiteSpace: (col.startsWith('#') || col === 'chegou') ? 'nowrap' : undefined }}>{v || '—'}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--portal-bg-secondary)' }}>
            <button onClick={adicionarSeparadas} disabled={sel.size === 0} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none',
              background: sel.size === 0 ? '#9ca3af' : '#e8730c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sel.size === 0 ? 'default' : 'pointer',
            }}>
              <Plus size={14} /> Adicionar {sel.size} peça{sel.size === 1 ? '' : 's'} ({copiasLote}× cada)
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
              Cópias por peça
              <input type="number" min={1} max={50} value={copiasLote}
                onClick={e => e.stopPropagation()}
                onChange={e => setCopiasLote(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }} />
            </label>
            <button onClick={juntarEtiqueta} disabled={sel.size < 1 || sel.size > 2} title="Mesma peça nas 2 empresas (NOVA+CASTRO) numa única etiqueta com os dois códigos" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
              color: sel.size < 1 || sel.size > 2 ? 'var(--portal-text-muted)' : 'var(--portal-text)',
              fontSize: 12.5, fontWeight: 700, cursor: sel.size < 1 || sel.size > 2 ? 'default' : 'pointer',
            }}>
              Juntar em 1 etiqueta
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', flex: '1 1 220px', minWidth: 0 }}>
              Marque várias (ou use o ✓ do cabeçalho pra <strong>selecionar todas</strong>) e adicione de uma vez —
              cada peça vira 1 etiqueta. <strong>Juntar</strong> é só pra mesma peça nas 2 empresas (máx. 2).
            </span>
          </div>
        </div>
        {seletorAberto && (
          <SeletorColunas ordem={ordemEfetiva} ocultas={colunasOcultas} labelCol={labelColEtiq}
            onAplicar={aplicarColunas} onCancelar={() => setSeletorAberto(false)} />
        )}
        </>
        )
      })()}

      {/* Formato de impressão */}
      <div style={{ marginTop: 18, padding: '12px 14px', border: '1px solid var(--portal-border)', borderRadius: 10, background: 'var(--portal-bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--portal-text)' }}>Imprimir em:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text)', cursor: 'pointer' }}>
            <input type="radio" checked={formato === 'folha'} onChange={() => setFormato('folha')} />
            Folha adesiva 3×10 (Pimaco/Avery 6180 — 66,7 × 25,4 mm)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text)', cursor: 'pointer' }}>
            <input type="radio" checked={formato === 'recorte'} onChange={() => setFormato('recorte')} />
            Papel comum (tracejado pra recortar)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: rastrear ? '#EA580C' : 'var(--portal-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={rastrear} onChange={e => mudarRastrear(e.target.checked)} />
            <QrCode size={14} /> Rastrear unidades (QR)
          </label>
        </div>
        {rastrear && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>
            Cada etiqueta impressa vira uma <strong>unidade rastreada</strong> com QR próprio (o QR entra no lugar do código de barras).
            Quem pegar a peça escaneia, marca &quot;peguei&quot; e o departamento libera na fila de retiradas.
          </div>
        )}
        {formato === 'folha' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
              Cada peça sai numa etiqueta da folha — é só descolar, sem recortar. Na impressão use <strong>escala 100%</strong> (sem &quot;ajustar à página&quot;).
              {' '}Folha já começada? Clique abaixo nas posições <strong>já usadas</strong> pra impressão pular elas{usadas.size > 0 && <> · <button onClick={() => setUsadas(new Set())} style={{ border: 'none', background: 'none', color: '#EA580C', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>limpar ({usadas.size})</button></>}:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gap: 3 }}>
              {Array.from({ length: 30 }, (_, p) => (
                <button key={p} onClick={() => setUsadas(prev => { const s = new Set(prev); if (s.has(p)) s.delete(p); else s.add(p); return s })}
                  title={usadas.has(p) ? 'Posição já usada — a impressão pula' : 'Posição livre'}
                  style={{
                    height: 17, borderRadius: 4, fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                    border: '1px solid var(--portal-border)',
                    background: usadas.has(p) ? '#d1d5db' : 'var(--portal-bg-card)',
                    color: usadas.has(p) ? '#6b7280' : 'var(--portal-text-muted)',
                    textDecoration: usadas.has(p) ? 'line-through' : 'none',
                  }}>
                  {p + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fila de etiquetas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>
          Fila de impressão ({totalFisicas} etiqueta{totalFisicas === 1 ? '' : 's'})
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {etiquetas.length > 0 && (
            <button onClick={limparFilaServer} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={13} /> Limpar
            </button>
          )}
          <button onClick={imprimir} disabled={etiquetas.length === 0 || imprimindo} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none',
            background: etiquetas.length === 0 || imprimindo ? '#9ca3af' : '#111827', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: etiquetas.length === 0 || imprimindo ? 'default' : 'pointer',
          }}>
            <Printer size={14} /> {imprimindo
              ? 'Gerando…'
              : rastrear && totalFisicas > 0
                ? `Imprimir (${totalFisicas} unidade${totalFisicas === 1 ? '' : 's'} rastreada${totalFisicas === 1 ? '' : 's'})`
                : 'Imprimir'}
          </button>
        </div>
      </div>

      {etiquetas.length === 0 ? (
        <div style={{ border: '1.5px dashed var(--portal-border)', borderRadius: 10, padding: 26, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-muted)' }}>
          Nenhuma etiqueta na fila — busque uma peça acima e adicione.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {etiquetas.map(e => (
            <div key={e.id} style={{ border: '1.5px dashed #94a3b8', borderRadius: 8, padding: '10px 12px', position: 'relative', background: 'var(--portal-bg-card)' }}>
              <button onClick={() => removerFilaServer(e.id)} title="Remover etiqueta"
                style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={12} />
              </button>
              {e.linhas.map((l, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 0 : 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .5, color: 'var(--portal-text)' }}>{l.empresa}</div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', lineHeight: 1.4 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--portal-text)' }}>{l.codigo}</span>
                    {' - '}{l.descricao}{l.locacao ? ` - ${l.locacao}` : ''}
                  </div>
                </div>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>
                Cópias
                <input type="number" min={1} max={50} value={e.copias}
                  onChange={ev => mudarCopiasServer(e.id, Number(ev.target.value) || 1)}
                  style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12 }} />
              </label>
            </div>
          ))}
        </div>
      )}

      {/* Histórico de folhas impressas — consultar/reimprimir a folha inteira */}
      {folhas.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 8px' }}>
            Histórico de folhas
          </h2>
          <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden' }}>
            {folhas.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--portal-border)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>
                    Folha #{f.id} · {f.total} etiqueta{f.total === 1 ? '' : 's'} · {f.formato === 'recorte' ? 'papel comum' : '3×10'}{f.rastreado ? ' · QR' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                    {fmtDataHora(f.criado_em)}{f.criado_nome ? ` · ${f.criado_nome}` : ''}
                  </div>
                </div>
                <button onClick={() => reimprimir(f.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Printer size={13} /> Reimprimir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
