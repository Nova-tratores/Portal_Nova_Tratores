'use client'
// Tela das áreas de blocos do Financeiro novo (06/11/2026): Pessoas (P1–P4) e Contas do mês (F1–F4).
// Mês com setas, um número por bloco (cada bloco é uma aba com endereço próprio, <base>/<slug>), as contas a
// pagar do Omie do bloco no mês e, ao lado, o painel "no portal" que cada área passa em `painel`.
// Fica no layout da área: trocar de aba não perde o mês nem recarrega.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NOME_EMPRESA_FIN, useEmpresaFinanceiro, type EmpresaFin } from '../empresaFinanceiro'
import type { BlocoModulo, ContaModulo } from '@/lib/financeiro/modulosContas'
import { COR, ESTILO_CAIXA, MESES, brl, contas, dataBR, hojeISO, nomeDe, pegarDre } from './comum'

const andarMes = (m: string, n: number) => { const [a, k] = m.split('-').map(Number); return new Date(Date.UTC(a, k - 1 + n, 1)).toISOString().slice(0, 7) }
export const nomeMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`
const aberto = (c: ContaModulo) => (c.status === 'LIQUIDADO' ? 0 : Math.max(0, c.valor_documento - c.valor_pago))
export const somaDoc = (l: ContaModulo[]) => l.reduce((a, c) => a + c.valor_documento, 0)

function Situacao({ c }: { c: ContaModulo }) {
  if (c.status === 'LIQUIDADO') return <span className="cx-pilula" style={{ color: '#16a34a' }}>pago {c.data_pagamento ? dataBR(c.data_pagamento) : ''}</span>
  if (c.status === 'PARCIAL') return <span className="cx-pilula" style={{ color: '#b45309' }}>pago em parte</span>
  if (c.status === 'VENCIDO') return <span className="cx-pilula" style={{ color: COR.vencido }}>vencida</span>
  return <span className="cx-pilula" style={{ color: '#2563eb' }}>vence {dataBR(c.data_vencimento)}</span>
}

export interface ContextoPainel<R> { bloco: string; dados: R; conta: EmpresaFin; mes: string; porBloco: Record<string, ContaModulo[]> }

export default function ModuloContasTela<R extends { contas: ContaModulo[] }>({ blocos, base, url, rotulo, painel, como }: {
  blocos: BlocoModulo[]
  /** endereço da área, ex.: /financeiro/pessoas */
  base: string
  url: (mes: string, conta: EmpresaFin) => string
  /** o que é cada conta, no topo (ex.: "contas a pagar do Omie pelo vencimento") */
  rotulo: string
  painel: (ctx: ContextoPainel<R>) => ReactNode
  como: ReactNode
}) {
  const [conta] = useEmpresaFinanceiro()
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const slug = usePathname()?.slice(base.length + 1).split('/')[0]
  const info = blocos.find((b) => b.slug === slug) ?? blocos[0]
  const bloco = info.codigo
  const [dados, setDados] = useState<R | null>(null)
  const [erro, setErro] = useState('')
  const pedido = `${mes}|${conta}`
  const [visto, setVisto] = useState(pedido)
  if (visto !== pedido) { setVisto(pedido); setDados(null); setErro('') }

  useEffect(() => {
    let vivo = true
    pegarDre<R>(url(mes, conta))
      .then((d) => { if (vivo) setDados(d) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    return () => { vivo = false }
  }, [mes, conta, url])

  const porBloco = useMemo(() => {
    const m: Record<string, ContaModulo[]> = Object.fromEntries(blocos.map((b) => [b.codigo, [] as ContaModulo[]]))
    for (const c of dados?.contas || []) m[c.bloco]?.push(c)
    return m
  }, [dados, blocos])
  const lista = useMemo(() => porBloco[bloco] || [], [porBloco, bloco])
  const somaAberto = (l: ContaModulo[]) => l.reduce((a, c) => a + aberto(c), 0)
  const vencidas = (l: ContaModulo[]) => l.filter((c) => c.status === 'VENCIDO').length
  // por categoria, para o cabeçalho do bloco
  const categorias = useMemo(() => info.categorias.map((cat) => {
    const l = lista.filter((c) => c.categoria === cat)
    return { cat, n: l.length, total: somaDoc(l) }
  }).filter((x) => x.n > 0), [info, lista])

  return (
    <div className="cx">
      <style>{ESTILO_CAIXA + ESTILO_MODULO}</style>
      <section className="cx-card cx-topo">
        <div className="cx-grupo">
          <button type="button" className="cx-seta" onClick={() => setMes(andarMes(mes, -1))} aria-label="Mês anterior"><i className="fa-solid fa-chevron-left" /></button>
          <span className="cx-periodo" style={{ minWidth: 200, textAlign: 'center' }}>{nomeMes(mes)}</span>
          <button type="button" className="cx-seta" onClick={() => setMes(andarMes(mes, 1))} aria-label="Próximo mês"><i className="fa-solid fa-chevron-right" /></button>
          {mes !== hojeISO().slice(0, 7) && <button type="button" className="cx-link" onClick={() => setMes(hojeISO().slice(0, 7))}>Voltar para este mês</button>}
        </div>
        <span className="cx-apagado">{NOME_EMPRESA_FIN[conta]} · {rotulo}</span>
      </section>

      {erro && <div className="cx-card cx-erro">{erro}</div>}

      <section className="cx-card cx-resumo ps-resumo">
        {blocos.map((b) => {
          const l = porBloco[b.codigo] || [], v = vencidas(l)
          return (
            <Link key={b.codigo} href={`${base}/${b.slug}`} aria-current={bloco === b.codigo ? 'page' : undefined} className={`cx-res ps-res${bloco === b.codigo ? ' ps-on' : ''}`} style={{ ['--c' as string]: b.cor }}>
              <span className="cx-rot"><span className="ps-cod">{b.codigo}</span>{b.nome}</span>
              <strong>{dados ? brl(somaDoc(l)) : '…'}</strong>
              <span className="cx-det">{dados ? <>{contas(l.length)} · {somaAberto(l) > 0 ? `${brl(somaAberto(l))} em aberto` : 'tudo pago'}{v > 0 && <span style={{ color: COR.vencido }}> · {v} vencida{v > 1 ? 's' : ''}</span>}</> : 'carregando'}</span>
            </Link>
          )
        })}
      </section>

      {!dados && !erro && <div className="cx-card cx-vazio">Carregando {nomeMes(mes).toLowerCase()}…</div>}
      {dados && (
        <div className="ps-grade">
          <section className="cx-card ps-omie">
            <div className="ps-cab">
              <span className="ps-cab-nome"><span className="ps-cod" style={{ ['--c' as string]: info.cor }}>{bloco}</span>{info.nome} no Omie</span>
              <span className="cx-apagado">{contas(lista.length)} · {brl(somaDoc(lista))}</span>
            </div>
            {categorias.length > 1 && (
              <div className="ps-cats">{categorias.map((x) => <span key={x.cat}>{x.cat} <b>{brl(x.total)}</b> <small>{x.n}</small></span>)}</div>
            )}
            {lista.length === 0 ? <div className="cx-vazio">Nenhuma conta de {info.nome.toLowerCase()} com vencimento em {nomeMes(mes).toLowerCase()}</div> : (
              <div className="cx-rola">
                <table className="cx-tab ps-tab cx-cartao">
                  <thead><tr><th>Para quem</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {lista.map((c) => (
                      <tr key={c.codigo_lancamento} className={c.status === 'LIQUIDADO' ? 'ps-pago' : ''}>
                        <td className="cx-nome">{nomeDe(c.nome)}<small>{[c.categoria, c.numero_documento, c.observacao].filter(Boolean).join(' · ')}</small></td>
                        <td>{dataBR(c.data_vencimento)}</td>
                        <td>{brl(c.valor_documento)}</td>
                        <td><Situacao c={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {painel({ bloco, dados, conta, mes, porBloco })}
        </div>
      )}

      <details className="cx-card ps-como">
        <summary>Como ler esta tela</summary>
        <p className="cx-nota">{como}</p>
      </details>
    </div>
  )
}

/** Cartão do lado direito: o que o portal já sabe do bloco. */
export function Painel({ titulo, total, children }: { titulo: string; total?: string; children: ReactNode }) {
  return (
    <section className="cx-card ps-portal">
      <div className="ps-cab"><span className="ps-cab-nome"><i className="fa-solid fa-circle-nodes" style={{ color: '#2563eb' }} />{titulo}</span>{total && <span className="cx-apagado">{total}</span>}</div>
      {children}
    </section>
  )
}

const ESTILO_MODULO = `
.ps-resumo { grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)) }
.ps-res { cursor: pointer; color: inherit; text-decoration: none; transition: background .15s; box-shadow: inset 0 -3px 0 transparent }
.ps-res:hover { background: color-mix(in srgb, var(--c) 5%, transparent) }
.ps-on { background: color-mix(in srgb, var(--c) 8%, transparent); box-shadow: inset 0 -3px 0 var(--c) }
.ps-cod { display: inline-grid; place-items: center; min-width: 26px; height: 22px; padding: 0 5px; margin-right: 8px; border-radius: 6px; font-size: 12.5px; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent) }
.ps-grade { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(min(340px, 100%), 1fr); gap: 12px; align-items: start }
.ps-omie, .ps-portal { overflow: hidden; animation: ps-entra .3s ease both }
.ps-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.ps-cab-nome { display: inline-flex; align-items: center; gap: 8px; font-size: 16px }
.ps-cats { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 16px; border-bottom: 1px solid var(--border, #e2e8f0); font-size: 14px; color: var(--portal-text-secondary, #475569) }
.ps-cats b { font-weight: 500; color: var(--portal-text, #0f172a) } .ps-cats small { color: var(--portal-text-muted, #64748b) }
.ps-tab { min-width: 620px; font-size: 15px }
.ps-pago td { color: var(--portal-text-muted, #64748b) }
.ps-lista { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow-y: auto }
.ps-lista li { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-bottom: 1px solid var(--border, #e2e8f0) }
.ps-nome { flex: 1; min-width: 0; font-size: 15px; overflow-wrap: anywhere } .ps-nome small { display: block; margin-top: 2px; font-size: 13.5px; color: var(--portal-text-muted, #64748b) }
.ps-valor { flex-shrink: 0; font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap }
.ps-lista .cx-pilula { flex-shrink: 0; font-size: 13px }
.ps-pe { padding: 12px 16px }
.ps-como { padding: 12px 16px } .ps-como summary { cursor: pointer; font-size: 15px } .ps-como p { margin-top: 8px }
@keyframes ps-entra { from { opacity: 0; transform: translateY(6px) } }
@media (prefers-reduced-motion: reduce) { .ps-omie, .ps-portal { animation: none } }
@media (max-width: 1100px) { .ps-grade { grid-template-columns: minmax(0, 1fr) } }
@media (max-width: 640px) { .ps-res { border-left: none; border-top: 1px solid var(--border, #e2e8f0) } .ps-res:first-child { border-top: none } .ps-lista li { flex-wrap: wrap } .ps-nome { flex-basis: 100% } }
`
