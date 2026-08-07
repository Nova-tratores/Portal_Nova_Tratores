'use client'
// ETIQUETAS DE IDENTIFICAÇÃO DE PEÇAS (módulo PPV) — pedido do superior do
// usuário (30/07/2026): impressão pra colar na peça mostrando o código dela
// EM CADA EMPRESA. Formato por etiqueta:
//     EMPRESA 1
//     CÓDIGO - DESCRIÇÃO - CARACTERÍSTICA DE LOCAÇÃO
//     EMPRESA 2
//     CÓDIGO - DESCRIÇÃO - CARACTERÍSTICA DE LOCAÇÃO
// Fonte: produtos_caracteristicas (sync de Ajustes; locação = chaves com #).
// Fluxo: busca → seleciona as linhas da MESMA peça (uma por empresa) →
// adiciona à fila → imprime (janela própria, 2 colunas, borda de recorte).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Printer, Search, Tag, Trash2, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

interface ItemBusca {
  conta_omie: string
  codigo: string
  descricao: string | null
  caracteristicas: Record<string, string> | null
  /** Data da NF de entrada (só nas "últimas compradas"). */
  chegou?: string | null
}
interface LinhaEtiqueta {
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

const EMPRESA_LABEL: Record<string, string> = {
  NOVA: 'NOVA TRATORES',
  CASTRO: 'CASTRO PEÇAS',
}
const EMPRESA_COR: Record<string, string> = {
  NOVA: '#1d4ed8',
  CASTRO: '#be185d',
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

export default function EtiquetasPecasPage() {
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
  // Formato de impressão: 'folha' = folha adesiva pré-cortada 3×10 (Pimaco/
  // Avery 6180, 66,7×25,4mm — a que a oficina usa); 'recorte' = tracejado.
  const [formato, setFormato] = useState<'folha' | 'recorte'>('folha')
  // Modo "1 peça = 1 etiqueta": cada clique numa linha já vira uma etiqueta
  // na fila (sem juntar as duas empresas na mesma etiqueta)
  const [modoIndividual, setModoIndividual] = useState(false)
  // Posições (0-29) da PRIMEIRA folha que já foram usadas/descoladas — a
  // impressão pula essas células (folha começada não vai pro lixo).
  const [usadas, setUsadas] = useState<Set<number>>(new Set())
  const proxId = useRef(1)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado inicial: as últimas peças COMPRADAS (NFs de entrada) — as que
  // acabaram de chegar são as que precisam de etiqueta
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

  const alternarSel = (k: string) => {
    setSel(prev => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k); else s.add(k)
      return s
    })
  }

  const linhaDe = (i: ItemBusca): LinhaEtiqueta => ({
    empresa: EMPRESA_LABEL[i.conta_omie] || i.conta_omie,
    codigo: i.codigo,
    descricao: (i.descricao || '').trim(),
    locacao: locacaoDe(i.caracteristicas),
  })

  const clicarLinha = (i: ItemBusca) => {
    if (modoIndividual) {
      // cada clique = uma etiqueta própria, direto na fila
      setEtiquetas(prev => [...prev, { id: proxId.current++, linhas: [linhaDe(i)], copias: 1 }])
      return
    }
    alternarSel(chaveItem(i))
  }

  const adicionarEtiqueta = () => {
    // A seleção pode vir da BUSCA ou da lista de últimas compradas (estado
    // inicial) — procurar só em `resultados` fazia o botão não fazer nada
    // quando as linhas marcadas eram das recentes.
    const vistos = new Set<string>()
    const linhas = [...resultados, ...recentes]
      .filter(i => {
        const k = chaveItem(i)
        if (!sel.has(k) || vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      .map(i => ({
        empresa: EMPRESA_LABEL[i.conta_omie] || i.conta_omie,
        codigo: i.codigo,
        descricao: (i.descricao || '').trim(),
        locacao: locacaoDe(i.caracteristicas),
      }))
      // NOVA primeiro, depois CASTRO (ordem fixa nas etiquetas)
      .sort((a, b) => a.empresa.localeCompare(b.empresa) * -1)
    if (linhas.length === 0) return
    // Etiqueta física tem 25,4mm de altura — mais de 2 peças não cabe legível
    if (linhas.length > 2) {
      setErro('Máximo de 2 peças por etiqueta (uma por empresa) — desmarque o excedente e adicione em etiquetas separadas.')
      return
    }
    setErro('')
    setEtiquetas(prev => [...prev, { id: proxId.current++, linhas, copias: 1 }])
    setSel(new Set())
  }

  const imprimir = () => {
    if (etiquetas.length === 0) return
    const blocos = etiquetas.flatMap(e => Array.from({ length: Math.max(1, e.copias) }, () => e))
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(formato === 'folha' ? htmlFolha(blocos, usadas) : htmlRecorte(blocos))
    w.document.close()
  }

  const INP: React.CSSProperties = { width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 14, boxSizing: 'border-box', background: 'var(--portal-bg-card)', outline: 'none', color: 'var(--portal-text)' }

  return (
    <div style={{ padding: '18px 22px', maxWidth: 1100, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Link href="/ppv" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--portal-text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={15} /> PPV
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag size={18} color="#ef4444" /> Etiquetas de identificação de peças
        </h1>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
        Busque a peça, marque as linhas dela em cada empresa (o código muda de uma pra outra) e
        adicione à fila — a etiqueta sai com <strong>EMPRESA → CÓDIGO - DESCRIÇÃO - LOCAÇÃO</strong>,
        no tamanho da folha adesiva 3×10: imprime direto nela e é só descolar, sem recortar.
      </p>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--portal-text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Código, descrição ou locação da peça (ex.: 3 G 1)…" style={INP} autoFocus />
        {buscando && <Loader2 size={15} className="animate-spin" style={{ position: 'absolute', right: 12, top: 12, color: 'var(--portal-text-muted)' }} />}
      </div>
      {erro && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, marginBottom: 10 }}>{erro}</div>}

      {/* Resultados (busca) ou as últimas peças COMPRADAS (estado inicial) */}
      {(() => {
        const mostrandoRecentes = q.trim().length < 2
        const lista = mostrandoRecentes ? recentes : resultados
        if (mostrandoRecentes && carregandoRecentes) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--portal-text-muted)', padding: '14px 4px' }}>
              <Loader2 size={14} className="animate-spin" /> Carregando as últimas peças compradas…
            </div>
          )
        }
        if (lista.length === 0) return null
        return (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          {mostrandoRecentes && (
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 800, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)' }}>
              📦 Últimas peças compradas (NFs de entrada do Omie)
            </div>
          )}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', width: 30 }} />
                  <th style={{ padding: '8px 10px', width: 140 }}>Empresa</th>
                  <th style={{ padding: '8px 10px', width: 130 }}>Código</th>
                  <th style={{ padding: '8px 10px' }}>Descrição</th>
                  <th style={{ padding: '8px 10px', width: 200 }}>Locação</th>
                  {mostrandoRecentes && <th style={{ padding: '8px 10px', width: 90 }}>Chegou em</th>}
                </tr>
              </thead>
              <tbody>
                {lista.map(i => {
                  const k = chaveItem(i)
                  const marcado = !modoIndividual && sel.has(k)
                  return (
                    <tr key={k} onClick={() => clicarLinha(i)} style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer', background: marcado ? 'rgba(239,68,68,.06)' : 'transparent' }}>
                      <td style={{ padding: '7px 10px' }}>
                        {modoIndividual
                          ? <Plus size={14} color="#ef4444" style={{ display: 'block' }} />
                          : <input type="checkbox" readOnly checked={marcado} />}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: '#fff', background: EMPRESA_COR[i.conta_omie] || '#6b7280' }}>
                          {EMPRESA_LABEL[i.conta_omie] || i.conta_omie}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--portal-text)' }}>{i.codigo}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--portal-text)' }}>
                        {i.descricao || <em style={{ color: 'var(--portal-text-muted)' }}>sem cadastro de características</em>}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)' }}>{locacaoDe(i.caracteristicas) || '—'}</td>
                      {mostrandoRecentes && <td style={{ padding: '7px 10px', color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>{i.chegou || '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--portal-bg-secondary)' }}>
            {!modoIndividual && (
              <button onClick={adicionarEtiqueta} disabled={sel.size === 0} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none',
                background: sel.size === 0 ? '#9ca3af' : '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sel.size === 0 ? 'default' : 'pointer',
              }}>
                <Plus size={14} /> Adicionar etiqueta ({sel.size} linha{sel.size === 1 ? '' : 's'})
              </button>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={modoIndividual} onChange={e => { setModoIndividual(e.target.checked); setSel(new Set()) }} />
              1 peça = 1 etiqueta
            </label>
            <span style={{ fontSize: 11.5, color: !modoIndividual && sel.size > 2 ? '#dc2626' : 'var(--portal-text-muted)', fontWeight: !modoIndividual && sel.size > 2 ? 700 : 400 }}>
              {modoIndividual
                ? 'Cada clique numa peça já adiciona uma etiqueta na fila.'
                : sel.size > 2
                  ? 'Máximo de 2 peças por etiqueta — desmarque o excedente.'
                  : 'Marque a MESMA peça nas duas empresas pra etiqueta sair com os dois códigos (máx. 2 por etiqueta).'}
            </span>
          </div>
        </div>
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
        </div>
        {formato === 'folha' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
              Cada peça sai numa etiqueta da folha — é só descolar, sem recortar. Na impressão use <strong>escala 100%</strong> (sem &quot;ajustar à página&quot;).
              {' '}Folha já começada? Clique abaixo nas posições <strong>já usadas</strong> pra impressão pular elas{usadas.size > 0 && <> · <button onClick={() => setUsadas(new Set())} style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>limpar ({usadas.size})</button></>}:
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
          Fila de impressão ({etiquetas.reduce((s, e) => s + Math.max(1, e.copias), 0)} etiqueta{etiquetas.length === 1 && etiquetas[0]?.copias <= 1 ? '' : 's'})
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {etiquetas.length > 0 && (
            <button onClick={() => setEtiquetas([])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={13} /> Limpar
            </button>
          )}
          <button onClick={imprimir} disabled={etiquetas.length === 0} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none',
            background: etiquetas.length === 0 ? '#9ca3af' : '#111827', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: etiquetas.length === 0 ? 'default' : 'pointer',
          }}>
            <Printer size={14} /> Imprimir
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
              <button onClick={() => setEtiquetas(prev => prev.filter(x => x.id !== e.id))} title="Remover etiqueta"
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
                  onChange={ev => setEtiquetas(prev => prev.map(x => x.id === e.id ? { ...x, copias: Math.max(1, Math.min(50, Number(ev.target.value) || 1)) } : x))}
                  style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 12 }} />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Impressão em FOLHA ADESIVA pré-cortada 3×10 (Pimaco/Avery 6180) ─────────
// Folha Carta 215,9×279,4mm · etiqueta 66,675×25,4mm · margem 12,7mm em cima/
// baixo e 4,76mm nas laterais · 3,175mm entre colunas · SEM espaço entre
// linhas. Uma peça por etiqueta — imprime direto na folha, é só descolar.
// `usadas` = posições (0-29) da 1ª folha já descoladas — saem em branco.
function htmlFolha(blocos: Etiqueta[], usadas: Set<number>): string {
  const paginas: (Etiqueta | null)[][] = []
  const fila = [...blocos]
  let primeira = true
  while (fila.length > 0) {
    const celulas: (Etiqueta | null)[] = []
    for (let p = 0; p < 30; p++) {
      if (primeira && usadas.has(p)) { celulas.push(null); continue }
      celulas.push(fila.shift() ?? null)
    }
    paginas.push(celulas)
    primeira = false
  }
  // Mês/ano da impressão no canto — mostra o quão atualizada a etiqueta está
  const agora = new Date()
  const dataRef = `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`
  // Foco no CÓDIGO e na DESCRIÇÃO (locação vira apoio): etiqueta de 1 peça
  // tem código grande + descrição em até 2 linhas; a dupla compacta a locação
  // junto do código pra descrição continuar aparecendo.
  const cel = (e: Etiqueta | null) =>
    e === null
      ? '    <div class="cel"></div>'
      : `    <div class="cel${e.linhas.length > 1 ? ' dupla' : ''}">
${e.linhas.map(l => e.linhas.length > 1
        ? `      <div class="bloco">
        <div class="emp">${esc(l.empresa)}</div>
        <div class="cod">${esc(l.codigo)}${l.locacao ? `<span class="loc"> · ${esc(l.locacao)}</span>` : ''}</div>${l.descricao ? `
        <div class="desc">${esc(l.descricao)}</div>` : ''}
      </div>`
        : `      <div class="bloco">
        <div class="emp">${esc(l.empresa)}</div>
        <div class="cod">${esc(l.codigo)}</div>${l.descricao ? `
        <div class="desc">${esc(l.descricao)}</div>` : ''}${l.locacao ? `
        <div class="loc-linha">${esc(l.locacao)}</div>` : ''}
      </div>`).join('\n')}
      <div class="dt">${dataRef}</div>
    </div>`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças (folha 3×10)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 215.9mm 279.4mm; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .pagina {
    width: 215.9mm; height: 279.4mm; padding: 12.7mm 4.7625mm;
    display: grid; grid-template-columns: repeat(3, 66.675mm);
    grid-auto-rows: 25.4mm; column-gap: 3.175mm;
    page-break-after: always;
  }
  .pagina:last-child { page-break-after: auto; }
  .cel {
    position: relative; overflow: hidden; padding: 0.8mm 2mm; text-align: center;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .bloco { max-width: 100%; }
  .bloco + .bloco { margin-top: 1.2mm; }
  .emp { font-size: 6.5pt; font-weight: 800; letter-spacing: .4px; }
  .cod { font-size: 13pt; font-weight: 800; line-height: 1.1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .desc { font-size: 9pt; font-weight: 600; line-height: 1.15; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .loc-linha { font-size: 7.5pt; color: #333; line-height: 1.15; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loc { font-size: 7.5pt; font-weight: 600; color: #333; }
  .dupla .emp { font-size: 5.5pt; }
  .dupla .cod { font-size: 10pt; }
  .dupla .desc { font-size: 7.5pt; -webkit-line-clamp: 1; }
  .dt { position: absolute; bottom: 0.5mm; right: 1.4mm; font-size: 5.5pt; color: #666; }
  @media screen {
    body { background: #e5e7eb; }
    .pagina { background: #fff; margin: 10px auto; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
    .cel { outline: 1px dashed #d1d5db; }
  }
</style></head><body>
${paginas.map(cels => `  <div class="pagina">
${cels.map(cel).join('\n')}
  </div>`).join('\n')}
<script>window.onload = () => { window.print(); }</script>
</body></html>`
}

// Impressão em papel comum, 2 colunas com borda tracejada pra recortar
function htmlRecorte(blocos: Etiqueta[]): string {
  const agora = new Date()
  const dataRef = `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 8mm; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .etq { position: relative; border: 1.5px dashed #555; border-radius: 4px; padding: 8px 10px 14px; break-inside: avoid; page-break-inside: avoid; }
  .emp { font-size: 11px; font-weight: 800; letter-spacing: .5px; margin-top: 6px; }
  .emp:first-child { margin-top: 0; }
  .linha { font-size: 12px; line-height: 1.35; margin-top: 1px; }
  .cod { font-weight: 800; font-family: 'Courier New', monospace; }
  .dt { position: absolute; bottom: 3px; right: 6px; font-size: 8px; color: #666; }
  @media print { body { padding: 4mm; } }
</style></head><body>
<div class="grade">
${blocos.map(e => `  <div class="etq">
${e.linhas.map(l => `    <div class="emp">${esc(l.empresa)}</div>
    <div class="linha"><span class="cod">${esc(l.codigo)}</span> - ${esc(l.descricao)}${l.locacao ? ` - ${esc(l.locacao)}` : ''}</div>`).join('\n')}
    <div class="dt">${dataRef}</div>
  </div>`).join('\n')}
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`
}
