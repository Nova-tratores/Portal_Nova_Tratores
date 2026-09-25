'use client'
import { Sprout, AlertTriangle, Flag, Package, FileText } from 'lucide-react'
import { PLANO_CAR, PLANO_CAR_META, FASES, type Bloco, type Fase } from '@/lib/agro/plano-car'

// Aba "Inteligência por CAR" do /dashboard-agro: renderiza o planejamento
// (lib pura src/lib/agro/plano-car.ts). Nada aqui lê banco — é o plano visível
// no portal, para o time ler e as próximas sessões executarem fase a fase.

const VERDE = '#16a34a'          // cor do módulo (admin/page.tsx)
const VERDE_ESCURO = '#15803d'
// #fefefe / #111111: branco e preto "de verdade" que o modo escuro NÃO remapeia
// (#fff e #111827 são convertidos pelas regras dark do globals.css).

const estilos = {
  card: {
    background: 'var(--portal-bg-card,#fefefe)',
    border: '1px solid var(--portal-border,#e5e7eb)',
    borderRadius: 10,
    padding: '18px 20px',
  } as React.CSSProperties,
  h2: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 18, fontWeight: 800, margin: '0 0 12px',
    color: 'var(--portal-text,#111111)',
  } as React.CSSProperties,
  p: { margin: '0 0 10px', lineHeight: 1.55, color: 'var(--portal-text,#111111)', fontSize: 14 } as React.CSSProperties,
  pre: {
    margin: '0 0 12px', padding: '12px 14px', overflow: 'auto',
    background: 'var(--portal-bg-secondary,#f3f4f6)', border: '1px solid var(--portal-border,#e5e7eb)',
    borderRadius: 8, fontSize: 12, lineHeight: 1.45, color: 'var(--portal-text,#111111)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'pre',
  } as React.CSSProperties,
  th: {
    textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700,
    color: 'var(--portal-text-secondary,#374151)', background: 'var(--portal-bg-secondary,#f3f4f6)',
    borderBottom: '1px solid var(--portal-border,#e5e7eb)',
  } as React.CSSProperties,
  td: {
    padding: '8px 10px', fontSize: 13, lineHeight: 1.45, verticalAlign: 'top',
    color: 'var(--portal-text,#111111)', borderBottom: '1px solid var(--portal-border,#e5e7eb)',
  } as React.CSSProperties,
}

function Numero({ n }: { n: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 8, background: VERDE, color: '#fefefe',
      fontSize: 13, fontWeight: 800, flexShrink: 0,
    }}>{n}</span>
  )
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <div style={{ overflowX: 'auto', margin: '0 0 12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead>
          <tr>{cabecalho.map((c) => <th key={c} style={estilos.th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} style={{ ...estilos.td, fontWeight: j === 0 ? 700 : 400 }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      margin: '0 0 12px', padding: '10px 12px', borderRadius: 8,
      background: 'rgba(245,158,11,0.12)', borderLeft: '4px solid #f59e0b',
      color: 'var(--portal-text,#111111)', fontSize: 14, lineHeight: 1.5, fontWeight: 600,
    }}>
      <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
      <span>{texto}</span>
    </div>
  )
}

function CardFase({ f }: { f: Fase }) {
  return (
    <div style={{
      display: 'flex', gap: 14,
      background: 'var(--portal-bg-card,#fefefe)',
      border: '1px solid var(--portal-border,#e5e7eb)',
      borderLeft: `5px solid ${VERDE}`, borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: VERDE_ESCURO, color: '#fefefe', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5 }}>FASE</span>
        <span style={{ fontSize: 20, fontWeight: 900 }}>{f.fase}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text,#111111)' }}>{f.titulo}</span>
          <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#6b7280)' }}>{f.duracao}</span>
        </div>
        {f.intro && <p style={{ ...estilos.p, fontStyle: 'italic' }}>{f.intro}</p>}
        {f.itens.length > 0 && (
          <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyle: 'disc' }}>
            {f.itens.map((it, i) => <li key={i} style={{ ...estilos.p, marginBottom: 4 }}>{it}</li>)}
          </ul>
        )}
        {f.tabela && <Tabela cabecalho={f.tabela.cabecalho} linhas={f.tabela.linhas} />}
        {f.rodape && <p style={estilos.p}>{f.rodape}</p>}
        {f.portao && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.12)', borderLeft: '4px solid #f59e0b', marginBottom: 8,
            fontSize: 13, lineHeight: 1.5, color: 'var(--portal-text,#111111)',
          }}>
            <Flag size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
            <span><b>Portão:</b> {f.portao}</span>
          </div>
        )}
        {f.entregavel && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 8,
            background: 'rgba(22,163,74,0.12)', borderLeft: `4px solid ${VERDE}`,
            fontSize: 13, lineHeight: 1.5, color: 'var(--portal-text,#111111)',
          }}>
            <Package size={16} style={{ color: VERDE, flexShrink: 0, marginTop: 2 }} />
            <span><b>Entregável:</b> {f.entregavel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BlocoView({ b }: { b: Bloco }) {
  switch (b.tipo) {
    case 'p': return <p style={estilos.p}>{b.texto}</p>
    case 'lista': {
      const Tag = b.numerada ? 'ol' : 'ul'
      return (
        <Tag style={{ margin: '0 0 12px', paddingLeft: 22, listStyle: b.numerada ? 'decimal' : 'disc' }}>
          {b.itens.map((it, i) => <li key={i} style={{ ...estilos.p, marginBottom: 5 }}>{it}</li>)}
        </Tag>
      )
    }
    case 'tabela': return <Tabela cabecalho={b.cabecalho} linhas={b.linhas} />
    case 'codigo': return <pre style={estilos.pre}>{b.texto}</pre>
    case 'aviso': return <Aviso texto={b.texto} />
    case 'fases':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FASES.map((f) => <CardFase key={f.fase} f={f} />)}
        </div>
      )
  }
}

export default function PlanoCarAba() {
  return (
    <div className="plano-car" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px 60px' }}>
      <style>{`
        .plano-car-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; align-items: start; }
        .plano-car-indice { position: sticky; top: 12px; }
        @media (max-width: 860px) {
          .plano-car-grid { grid-template-columns: 1fr; }
          .plano-car-indice { position: static; }
        }
        .plano-car-indice a { display: block; padding: 6px 10px; border-radius: 6px; font-size: 13px;
          color: var(--portal-text-secondary,#374151); text-decoration: none; }
        .plano-car-indice a:hover { background: rgba(22,163,74,0.12); color: var(--portal-text,#111111); }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ ...estilos.card, marginBottom: 20, borderTop: `4px solid ${VERDE}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Sprout size={26} style={{ color: VERDE }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--portal-text,#111111)' }}>
            {PLANO_CAR_META.titulo}
          </h1>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: .6, padding: '3px 9px', borderRadius: 999,
            background: 'rgba(22,163,74,0.16)', color: VERDE_ESCURO, border: `1px solid ${VERDE}`,
          }}>EM CONSTRUÇÃO</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--portal-text-muted,#6b7280)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{PLANO_CAR_META.subtitulo}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FileText size={13} /> <code style={{ fontSize: 12 }}>{PLANO_CAR_META.docPath}</code>
          </span>
        </div>
      </div>

      <div className="plano-car-grid">
        {/* Índice */}
        <nav className="plano-car-indice" style={{ ...estilos.card, padding: '12px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .5, color: 'var(--portal-text-muted,#6b7280)', padding: '0 10px 6px' }}>
            ÍNDICE
          </div>
          {PLANO_CAR.map((s) => (
            <a key={s.id} href={`#plano-car-${s.id}`}>{s.numero}. {s.titulo}</a>
          ))}
        </nav>

        {/* Seções */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {PLANO_CAR.map((s) => (
            <section key={s.id} id={`plano-car-${s.id}`} style={{ ...estilos.card, scrollMarginTop: 12 }}>
              <h2 style={estilos.h2}><Numero n={s.numero} /> {s.titulo}</h2>
              {s.blocos.map((b, i) => <BlocoView key={i} b={b} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
