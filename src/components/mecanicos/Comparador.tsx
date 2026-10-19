'use client'
// Comparador do pós-vendas (José, 16/10/2026: "o comparador é muito bom"): duas pessoas lado a
// lado, barra contra barra — quem ganha em cada item fica destacado. Abre arrastando um cartão de
// técnico sobre outro (ou pelo botão "comparar" do cartão).
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { LinhaTecnico } from '@/lib/mecanicos/painel'
import { brl, horas, kmFmt } from './ui'

export interface PessoaComparada { nome: string; l?: LinhaTecnico; gastos: number; salario: number; pontos?: number }

const AZUL = '#0369a1', ROXO = '#7c3aed'

export default function Comparador({ a, b, pessoas, onTrocar, onFechar }: {
  a: PessoaComparada; b: PessoaComparada; pessoas: string[]
  onTrocar: (lado: 0 | 1, nome: string) => void; onFechar: () => void
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  if (typeof document === 'undefined') return null
  const custo = (p: PessoaComparada) => (p.l?.custo || 0) + p.gastos + p.salario
  const sobra = (p: PessoaComparada) => (p.l?.bruto || 0) - custo(p)
  // para cada R$ 1 que custa, quanto sobra (negativo = prejuízo)
  const porReal = (p: PessoaComparada) => (custo(p) > 0 ? ((p.l?.bruto || 0) - custo(p)) / custo(p) : 0)
  const pctMeta = (p: PessoaComparada) => (p.l?.meta ? ((p.l.faturadas + p.l.aguardando + p.l.internas) / p.l.meta) * 100 : 0)
  const reais = (n: number) => `${n >= 0 ? '+' : '−'}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const metricas: [string, number, number, (v: number) => string, boolean][] = [
    ['Faturado', a.l?.bruto || 0, b.l?.bruto || 0, brl, true],
    ['Mão de obra', a.l?.servico || 0, b.l?.servico || 0, brl, true],
    ['Deslocamento', a.l?.kmValor || 0, b.l?.kmValor || 0, brl, true],
    ['Peças', a.l?.pecas || 0, b.l?.pecas || 0, brl, true],
    ['Horas faturadas', a.l?.faturadas || 0, b.l?.faturadas || 0, horas, true],
    ['% da meta', pctMeta(a), pctMeta(b), (v) => `${Math.round(v)}%`, true],
    ['OS faturadas', a.l?.os || 0, b.l?.os || 0, (v) => String(Math.round(v)), true],
    ['Km cobrados', a.l?.km || 0, b.l?.km || 0, kmFmt, true],
    ['Gastos', a.gastos, b.gastos, brl, false],
    ['Pessoal (salário, comissão)', a.salario, b.salario, brl, false],
    ['Lucro por R$ 1 de custo', porReal(a), porReal(b), reais, true],
    ['Sobrou', sobra(a), sobra(b), brl, true],
    ['Pontos no mês', a.pontos ?? 0, b.pontos ?? 0, (v) => String(Math.round(v)), true],
  ]
  const vitorias = metricas.reduce((s, [, va, vb, , maior]) => s + (va === vb ? 0 : (maior ? va > vb : va < vb) ? 1 : 0), 0)
  const seletor = (lado: 0 | 1, atual: string) => (
    <select value={atual} onChange={(e) => onTrocar(lado, e.target.value)} className={`cmp-sel cmp-${lado ? 'b' : 'a'}`}>
      {pessoas.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  )
  return createPortal(
    <div className="cmp-fundo" onClick={onFechar}>
      <style>{ESTILO}</style>
      <div className="cmp-folha" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-cab">
          {seletor(0, a.nome)}
          <div className="cmp-placar"><b style={{ color: AZUL }}>{vitorias}</b><span>×</span><b style={{ color: ROXO }}>{metricas.length - vitorias - metricas.filter(([, va, vb]) => va === vb).length}</b><small>itens ganhos</small></div>
          {seletor(1, b.nome)}
          <button type="button" className="cmp-x" onClick={onFechar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>
        <div className="cmp-corpo">
          {metricas.map(([rot, va, vb, fmt, maiorMelhor], i) => {
            const max = Math.max(Math.abs(va), Math.abs(vb), 1)
            const empate = va === vb
            const ganhaA = maiorMelhor ? va > vb : va < vb
            return (
              <div key={rot} className="cmp-linha" style={{ animationDelay: `${i * 45}ms` }}>
                <div className="cmp-v" style={{ fontWeight: !empate && ganhaA ? 900 : 600, color: !empate && ganhaA ? AZUL : undefined }}>{!empate && ganhaA && <i className="fas fa-crown" />} {fmt(va)}</div>
                <div className="cmp-b esq"><i style={{ width: `${(Math.abs(va) / max) * 100}%`, background: !empate && ganhaA ? AZUL : '#cbd5e1', animationDelay: `${i * 45 + 150}ms` }} /></div>
                <div className="cmp-r">{rot}</div>
                <div className="cmp-b"><i style={{ width: `${(Math.abs(vb) / max) * 100}%`, background: !empate && !ganhaA ? ROXO : '#cbd5e1', animationDelay: `${i * 45 + 150}ms` }} /></div>
                <div className="cmp-v" style={{ textAlign: 'left', fontWeight: !empate && !ganhaA ? 900 : 600, color: !empate && !ganhaA ? ROXO : undefined }}>{fmt(vb)} {!empate && !ganhaA && <i className="fas fa-crown" />}</div>
              </div>
            )
          })}
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #94a3b8)', textAlign: 'center', marginTop: 6 }}>Em gastos e salário, ganha quem gasta menos. Mesmo período da fita do tempo. Esc fecha.</div>
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

const ESTILO = `
.cmp-fundo { position: fixed; inset: 0; z-index: 100060; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: center; animation: cmpFade .2s ease both }
@keyframes cmpFade { from { opacity: 0 } to { opacity: 1 } }
.cmp-folha { width: min(980px, 100%); max-height: 88vh; overflow-y: auto; background: var(--portal-bg-card, #fefefe); border-radius: 22px 22px 0 0; box-shadow: 0 -20px 60px rgba(15,23,42,.3); animation: cmpSobe .45s cubic-bezier(.2,.9,.2,1) both }
@keyframes cmpSobe { from { transform: translateY(60%) } to { transform: none } }
.cmp-cab { position: sticky; top: 0; z-index: 2; background: var(--portal-bg-card, #fefefe); display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 12px; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--portal-border, #e5e7eb) }
.cmp-sel { font-family: inherit; font-size: 17px; font-weight: 900; border: 2px solid; border-radius: 12px; padding: 8px 12px; background: transparent; cursor: pointer; min-width: 0 }
.cmp-a { color: ${AZUL}; border-color: ${AZUL}33 } .cmp-b { color: ${ROXO}; border-color: ${ROXO}33; text-align: right }
.cmp-placar { display: flex; align-items: baseline; gap: 8px; flex-direction: row; flex-wrap: wrap; justify-content: center }
.cmp-placar b { font-size: 30px; font-weight: 900 } .cmp-placar span { color: var(--portal-text-muted, #94a3b8); font-size: 18px }
.cmp-placar small { width: 100%; text-align: center; font-size: 11.5px; color: var(--portal-text-muted, #94a3b8); font-weight: 700 }
.cmp-x { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; cursor: pointer; color: var(--portal-text-muted, #64748b) }
.cmp-corpo { padding: 14px 20px 24px; display: grid; gap: 9px }
.cmp-linha { display: grid; grid-template-columns: 130px 1fr 150px 1fr 130px; gap: 10px; align-items: center; font-size: 14px; animation: cmpEntra .45s cubic-bezier(.2,.8,.2,1) both }
@keyframes cmpEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.cmp-v { text-align: right; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a); white-space: nowrap }
.cmp-v i { font-size: 11px; color: #eab308 }
.cmp-r { text-align: center; font-size: 12px; font-weight: 800; color: var(--portal-text-muted, #64748b); text-transform: uppercase; letter-spacing: .3px }
.cmp-b { height: 14px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; overflow: hidden; display: flex }
.cmp-b.esq { justify-content: flex-end }
.cmp-b i { display: block; height: 100%; border-radius: 99px; animation: cmpBarra .8s cubic-bezier(.2,.8,.2,1) both }
.cmp-b.esq i { transform-origin: right } .cmp-b:not(.esq) i { transform-origin: left }
@keyframes cmpBarra { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@media (max-width: 760px) { .cmp-linha { grid-template-columns: 78px 1fr 84px 1fr 78px; font-size: 12px } .cmp-cab { grid-template-columns: 1fr 1fr auto } .cmp-placar { grid-column: 1 / -1; order: 3 } .cmp-sel { font-size: 14px } }
`
