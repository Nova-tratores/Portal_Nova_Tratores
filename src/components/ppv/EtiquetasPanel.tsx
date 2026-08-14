'use client'
// ETIQUETAS DE IDENTIFICAÇÃO DE PEÇAS (módulo PPV) — painel embutível.
// Usado como ABA dentro do PPV (embedded) e também pela rota /ppv/etiquetas.
// Formato por etiqueta:
//     EMPRESA 1
//     CÓDIGO - DESCRIÇÃO - CARACTERÍSTICA DE LOCAÇÃO
// Fonte: produtos_caracteristicas (sync de Ajustes; locação = chaves com #).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ArrowLeft, Loader2, Plus, Printer, QrCode, Search, Tag, Trash2, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import { htmlFolha, htmlRecorte, type BlocoEtiqueta } from '@/lib/ppv/etiquetas-html'

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
  const [modoIndividual, setModoIndividual] = useState(false)
  const [usadas, setUsadas] = useState<Set<number>>(new Set())
  const [rastrear, setRastrear] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const proxId = useRef(1)
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
    conta: i.conta_omie,
    empresa: EMPRESA_LABEL[i.conta_omie] || i.conta_omie,
    codigo: i.codigo,
    descricao: (i.descricao || '').trim(),
    locacao: locacaoDe(i.caracteristicas),
  })

  const clicarLinha = (i: ItemBusca) => {
    if (modoIndividual) {
      setEtiquetas(prev => [...prev, { id: proxId.current++, linhas: [linhaDe(i)], copias: 1 }])
      return
    }
    alternarSel(chaveItem(i))
  }

  const adicionarEtiqueta = () => {
    const vistos = new Set<string>()
    const linhas = [...resultados, ...recentes]
      .filter(i => {
        const k = chaveItem(i)
        if (!sel.has(k) || vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      .map(linhaDe)
      .sort((a, b) => a.empresa.localeCompare(b.empresa) * -1)
    if (linhas.length === 0) return
    if (linhas.length > 2) {
      setErro('Máximo de 2 peças por etiqueta (uma por empresa) — desmarque o excedente e adicione em etiquetas separadas.')
      return
    }
    setErro('')
    setEtiquetas(prev => [...prev, { id: proxId.current++, linhas, copias: 1 }])
    setSel(new Set())
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
      }
      w.document.open()
      w.document.write(formato === 'folha' ? htmlFolha(blocos, usadas) : htmlRecorte(blocos))
      w.document.close()
      if (rastrear) {
        setEtiquetas([])
        setUsadas(new Set())
      }
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
        Busque a peça, marque as linhas dela em cada empresa (o código muda de uma pra outra) e
        adicione à fila — a etiqueta sai com <strong>EMPRESA → CÓDIGO - DESCRIÇÃO - LOCAÇÃO</strong>,
        no tamanho da folha adesiva 3×10: imprime direto nela e é só descolar, sem recortar.
      </p>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--portal-text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Código, descrição ou locação (ex.: PRATELEIRA 6, ANDAR H ou 3 G 1)…" style={INP} autoFocus={!embedded} />
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
                    <tr key={k} onClick={() => clicarLinha(i)} style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer', background: marcado ? 'rgba(232,115,12,.08)' : 'transparent' }}>
                      <td style={{ padding: '7px 10px' }}>
                        {modoIndividual
                          ? <Plus size={14} color="#e8730c" style={{ display: 'block' }} />
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
                background: sel.size === 0 ? '#9ca3af' : '#e8730c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: sel.size === 0 ? 'default' : 'pointer',
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: rastrear ? '#0d9488' : 'var(--portal-text)', cursor: 'pointer' }}>
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
          Fila de impressão ({totalFisicas} etiqueta{totalFisicas === 1 ? '' : 's'})
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {etiquetas.length > 0 && (
            <button onClick={() => setEtiquetas([])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
