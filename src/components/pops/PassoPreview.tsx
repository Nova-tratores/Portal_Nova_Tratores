'use client'
// POPs — como o passo aparece para quem executa (só leitura; os controles são de mentira).
// Usado no detalhe, na biblioteca de modelos e na prévia do editor.
import { Camera, CheckSquare, FileText, Hash, Info, ListChecks, PenLine, Type } from 'lucide-react'
import type { ConfigPasso, TipoPasso } from '@/lib/pops/regras'
import { COR_POPS, chip } from './comum'

export interface PassoVisivel {
  ordem?: number
  tipo: TipoPasso
  titulo: string
  ajuda?: string
  obrigatorio?: boolean
  config?: ConfigPasso
  midia_url?: string | null
  midia_tipo?: 'imagem' | 'video' | null
}

export const ICONE_PASSO: Record<TipoPasso, React.ReactNode> = {
  instrucao: <Info size={15} />, check: <CheckSquare size={15} />, foto: <Camera size={15} />, numero: <Hash size={15} />,
  texto: <Type size={15} />, selecao: <ListChecks size={15} />, assinatura: <PenLine size={15} />,
}

const falso: React.CSSProperties = {
  border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 8, padding: '8px 12px', fontSize: 13,
  color: 'var(--portal-text-muted,#888)', background: 'var(--portal-bg,#f9fafb)',
}

export function midiaEhVideo(url: string | null | undefined) {
  return !!url && /\.(mp4|webm|mov)(\?|$)/i.test(url)
}

export default function PassoPreview({ p, n }: { p: PassoVisivel; n: number }) {
  const c = p.config || {}
  const faixa = p.tipo === 'numero' && (c.min !== undefined || c.max !== undefined)
    ? `faixa ${c.min ?? '—'} a ${c.max ?? '—'}${c.unidade ? ' ' + c.unidade : ''}` : ''
  const video = p.midia_tipo ? p.midia_tipo === 'video' : midiaEhVideo(p.midia_url)
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0' }}>
      <span style={{
        flex: '0 0 28px', height: 28, borderRadius: '50%', background: p.tipo === 'instrucao' ? 'var(--portal-border,#e5e7eb)' : COR_POPS,
        color: p.tipo === 'instrucao' ? 'var(--portal-text,#111)' : '#fefefe', fontWeight: 900, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: COR_POPS }}>{ICONE_PASSO[p.tipo]}</span>
          <strong style={{ fontSize: 15, color: 'var(--portal-text,#111)' }}>{p.titulo || <em style={{ color: '#9ca3af' }}>sem título</em>}</strong>
          {p.tipo !== 'instrucao' && (p.obrigatorio === false
            ? <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>opcional</span>
            : <span style={chip('#b91c1c', 'rgba(220,38,38,.10)')}>obrigatório</span>)}
        </div>
        {p.ajuda && <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', whiteSpace: 'pre-wrap' }}>{p.ajuda}</div>}
        {p.midia_url && (video
          ? <video src={p.midia_url} controls style={{ maxWidth: 360, borderRadius: 8 }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={p.midia_url} alt="" style={{ maxWidth: 360, maxHeight: 240, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)' }} />)}
        {p.tipo === 'check' && <div style={{ display: 'flex', gap: 8 }}><span style={falso}>Sim</span><span style={falso}>Não</span></div>}
        {p.tipo === 'foto' && (
          <div style={{ ...falso, display: 'inline-flex', gap: 6, alignItems: 'center', width: 'fit-content' }}>
            <Camera size={14} /> Tirar foto · mín. {c.min_fotos ?? 1}{c.max_fotos ? `, máx. ${c.max_fotos}` : ''}
          </div>
        )}
        {p.tipo === 'numero' && <div style={{ ...falso, width: 'fit-content' }}>0{c.unidade ? ` ${c.unidade}` : ''}{faixa && <span style={{ marginLeft: 10 }}>· {faixa}</span>}</div>}
        {p.tipo === 'texto' && <div style={{ ...falso, minHeight: 44, display: 'flex', gap: 6, alignItems: 'flex-start' }}><FileText size={13} style={{ marginTop: 2 }} /> resposta livre</div>}
        {p.tipo === 'selecao' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(c.opcoes || []).filter((o) => o.trim()).map((o, i) => <span key={`${i}-${o}`} style={falso}>{o}</span>)}</div>
        )}
        {p.tipo === 'assinatura' && (
          <div style={{ ...falso, width: 'fit-content' }}>
            Assinatura {c.quem === 'cliente' ? 'do cliente' : 'de quem executa'} · nome + rubrica
          </div>
        )}
      </div>
    </div>
  )
}

// Cabeçalho da versão + passos numerados (o que se lê do POP).
export function VersaoConteudo({ objetivo, escopo, materiais, passos }: {
  objetivo: string; escopo: string; materiais: string; passos: PassoVisivel[]
}) {
  const bloco = (t: string, v: string) => v ? (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--portal-text-muted,#888)' }}>{t}</div>
      <div style={{ fontSize: 14, color: 'var(--portal-text,#111)', whiteSpace: 'pre-wrap' }}>{v}</div>
    </div>
  ) : null
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {(objetivo || escopo || materiais) && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {bloco('Objetivo', objetivo)}{bloco('Escopo', escopo)}{bloco('Materiais / EPIs', materiais)}
        </div>
      )}
      <div>
        {passos.length ? passos.map((p, i) => (
          <div key={i} style={{ borderTop: i ? '1px solid var(--portal-border,#e5e7eb)' : 'none' }}>
            <PassoPreview p={p} n={i + 1} />
          </div>
        )) : <div style={{ color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>Nenhum passo ainda.</div>}
      </div>
    </div>
  )
}
