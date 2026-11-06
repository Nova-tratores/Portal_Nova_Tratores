'use client'
// Peças comuns das telas do Caixa (Calendário e Vencidos). As contas vêm prontas
// das rotas /api/dre-financeiro/* (mesmo código do DRE Financeiro); aqui só formato e visual.
import { fetchAuth } from '@/lib/auth/client'

export type Conta = 'todas' | 'nova' | 'castro'
export type Tipo = 'receber' | 'pagar' | 'ambos'

export const COR = { receber: '#059669', pagar: '#dc2626', vencido: '#dc2626', azul: '#2563eb' }

export const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** R$ curto para caber em célula pequena: 1,2 mi · 35 mil · 820 */
export const brlCurto = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })} mil`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
export const dataBR = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a.slice(2)}` }
export const contas = (n: number) => `${n} ${n === 1 ? 'conta' : 'contas'}`
export const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const empresa = (c: string) => (c === 'CASTRO' ? 'Castro' : 'Nova')
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
/** Hoje no relógio de Brasília (YYYY-MM-DD). */
export const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)

// o Omie manda nomes com HTML codificado ("ROSA &amp; RIBEIRO")
const ENTIDADES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' }
// cadastro com acento estragado no Omie ("VinÃ­cius CÃ´rrea": UTF-8 lido como Latin-1): desfaz na hora de mostrar.
// Só mexe quando o texto inteiro volta como UTF-8 válido; senão fica como veio.
const consertaAcento = (s: string) => {
  if (!/[ÃÂ][\u0080-¿]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map((c) => { const n = c.charCodeAt(0); if (n > 255) throw new Error(); return n }))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { return s }
}
export const nomeDe = (n: string | null | undefined) => (n ? consertaAcento(n.replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENTIDADES[m])) : 'Sem nome')
// "00008325" → "8325", como na tela de Notas fiscais (vale para "0001877,0001878" também)
export const semZeros = (nf: string) => nf.split(',').map((p) => p.trim().replace(/^0+(?=\d)/, '')).join(', ')

export function Seta({ tipo }: { tipo: 'pagar' | 'receber' }) {
  return <i className={`fa-solid ${tipo === 'receber' ? 'fa-arrow-down' : 'fa-arrow-up'}`} style={{ color: COR[tipo], fontSize: 12 }} title={tipo === 'receber' ? 'A receber' : 'A pagar'} />
}

export function Documento({ nf, doc, parcela }: { nf: string | null; doc: string | null; parcela: string | null }) {
  const parc = parcela && parcela !== '001/001' ? <small className="cx-apagado"> parc. {parcela}</small> : null
  if (nf) return <span><span className="cx-nf"><small>NF</small>{semZeros(nf)}</span>{parc}</span>
  return <span>{doc || '—'}{parc}</span>
}

export function SegTipo({ valor, onMudar, rotulos = { receber: 'A receber', pagar: 'A pagar', ambos: 'Os dois' }, ordem = ['receber', 'pagar', 'ambos'] }: {
  valor: Tipo; onMudar: (t: Tipo) => void; rotulos?: Record<Tipo, string>; ordem?: Tipo[]
}) {
  return (
    <div className="cx-seg" role="group" aria-label="O que mostrar">
      {ordem.map((v) => (
        <button key={v} type="button" aria-pressed={valor === v} className={valor === v ? 'cx-seg-on' : ''} onClick={() => onMudar(v)}>{rotulos[v]}</button>
      ))}
    </div>
  )
}

/** Busca JSON de uma rota do DRE; erro vira mensagem. */
export async function pegarDre<T>(url: string): Promise<T> {
  const r = await fetchAuth(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.erro) throw new Error(j.erro || j.error || `Erro ${r.status}`)
  return j as T
}

export const ESTILO_CAIXA = `
.cx { display: flex; flex-direction: column; gap: 12px }
.cx-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; min-width: 0 }
.cx-topo { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; padding: 12px 16px }
.cx-grupo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0 }
.cx-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px }
.cx-seg button { border: none; background: transparent; padding: 5px 14px; border-radius: 7px; color: var(--portal-text-secondary, #475569); font-size: 15.5px; cursor: pointer }
.cx-seg .cx-seg-on { background: color-mix(in srgb, #2563eb 11%, var(--surface, #fefefe)); color: #2563eb; font-weight: 500 }
.cx-seta { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); cursor: pointer; transition: border-color .2s }
.cx-seta:hover { border-color: #2563eb }
.cx-periodo { padding: 0 6px; font-size: 18px; font-weight: 500; white-space: nowrap }
.cx-apagado { color: var(--portal-text-muted, #64748b) }
.cx-erro { padding: 12px 16px; color: #dc2626 }
.cx-vazio { padding: 28px 16px; text-align: center; color: var(--portal-text-muted, #64748b) }
.cx-link { border: none; background: none; padding: 0 4px; color: #2563eb; font-size: 15px; cursor: pointer; text-decoration: underline }
.cx-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); overflow: hidden }
.cx-res { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 14px 18px; border: none; border-left: 1px solid var(--border, #e2e8f0); background: transparent; color: inherit; font: inherit; text-align: left }
.cx-res:first-child { border-left: none }
.cx-rot { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; color: var(--portal-text-secondary, #475569); white-space: nowrap }
.cx-res strong { font-size: 23px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap }
.cx-det { font-size: 14.5px; color: var(--portal-text-muted, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cx-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; border: 1px solid var(--border, #e2e8f0); border-radius: 999px; background: transparent; color: var(--portal-text-secondary, #475569); font-size: 15.5px; cursor: pointer; transition: background .2s, border-color .2s, color .2s }
.cx-chip:hover { border-color: #2563eb }
.cx-chip span { font-size: 14px; color: var(--portal-text-muted, #64748b) }
.cx-chip-on, .cx-chip-on span { background: #2563eb; border-color: #2563eb; color: #fefefe }
.cx-rola { overflow-x: auto }
.cx-tab-cab { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.cx-tab { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 16px }
.cx-tab th { padding: 10px 12px; text-align: left; font-size: 14.5px; font-weight: 400; color: var(--portal-text-secondary, #475569); background: var(--portal-bg-secondary, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0); white-space: nowrap }
.cx-tab td { padding: 10px 12px; border-bottom: 1px solid var(--border, #e2e8f0); white-space: nowrap; vertical-align: middle; font-variant-numeric: tabular-nums }
.cx-tab tbody tr { transition: background .15s }
.cx-tab tbody tr:hover { background: color-mix(in srgb, #0369a1 4%, var(--surface, #fefefe)) }
.cx-tab tbody tr:last-child td { border-bottom: none }
.cx-tab th:first-child, .cx-tab td:first-child { padding-left: 16px }
.cx-tab th:last-child, .cx-tab td:last-child { padding-right: 16px }
.cx-nome { white-space: normal !important; min-width: 220px }
.cx-nome small { display: block; margin-top: 2px; font-size: 14px; color: var(--portal-text-muted, #64748b) }
.cx-nf { display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px; border-radius: 7px; font-size: 15px; font-weight: 500; background: color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #2563eb 22%, transparent) }
.cx-nf small { font-size: 12.5px; color: #2563eb }
.cx-pilula { display: inline-flex; padding: 3px 10px; border-radius: 999px; font-size: 15px; background: color-mix(in srgb, currentColor 10%, transparent); white-space: nowrap }
.cx-barra { display: block; height: 6px; border-radius: 999px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden; flex: 1 }
.cx-barra > span { display: block; height: 100%; border-radius: 999px; background: var(--c, #2563eb); transition: width .4s ease }
.cx-dupla { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(560px, 100%), 1fr)); gap: 12px; align-items: start }
.cx-mais { display: flex; justify-content: center; padding: 12px }
.cx-nota { margin: 0; font-size: 14px; line-height: 1.6; color: var(--portal-text-muted, #64748b) }
.cx-campo { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; color: var(--portal-text-secondary, #475569); font-size: 15px }
.cx-campo input { width: 130px; border: none; outline: none; background: transparent; color: var(--portal-text, #0f172a); font-size: 15.5px; font-variant-numeric: tabular-nums }
`
