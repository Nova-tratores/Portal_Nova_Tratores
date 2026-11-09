'use client'
// Aba Contas correntes da área Banco (José, 06/11/2026; docs/financeiro-novo-06-11.md): B3 caixas e cartão,
// B4 transferências e B5 saldo. Cada conta corrente da empresa no mês, com o que entrou e saiu (movimentos do
// Omie, /api/dre-financeiro/movimentos, já sem a contagem em dobro título + baixa). Clicar abre os movimentos.
// Conciliar com o extrato do banco ainda não dá: o extrato não chega ao portal.
import { useEffect, useMemo, useState } from 'react'
import { NOME_EMPRESA_FIN, useEmpresaFinanceiro } from '../empresaFinanceiro'
import { nomeMes } from './ModuloContasTela'
import { COR, ESTILO_CAIXA, brl, dataBR, hojeISO, nomeDe, pegarDre } from './comum'

type Mov = {
  id: number; natureza: 'R' | 'P'; origem: string | null; data_pagamento: string; valor_pago: number | string
  codigo_conta_corrente: number | null; nome_conta_corrente: string | null; descricao_categoria: string | null
  nome_cliente_fornecedor: string | null; numero_documento_fiscal: string | null
}
type Resp = { movimentos: Mov[]; totais: { entradas: number; saidas: number; qtd: number }; emDobroTirados?: number }

const andarMes = (m: string, n: number) => { const [a, k] = m.split('-').map(Number); return new Date(Date.UTC(a, k - 1 + n, 1)).toISOString().slice(0, 7) }
const fimDoMes = (m: string) => { const [a, n] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(a, n, 0)).getUTCDate()).padStart(2, '0')}` }
// tipo de conta pelo nome, para o ícone e a ordem (bancos primeiro, depois caixas, cartão e as do Omie)
const tipoDe = (nome: string) => /caixa|caixinha/i.test(nome) ? ['fa-cash-register', 'caixa', 2] as const
  : /visa|master|cart/i.test(nome) ? ['fa-credit-card', 'cartão', 3] as const
    : /omie|interno/i.test(nome) ? ['fa-arrows-rotate', 'conta do Omie', 4] as const
      : ['fa-building-columns', 'banco', 1] as const
const ORIGEM: Record<string, string> = { BAXR: 'recebimento', BAXP: 'pagamento', TRAR: 'transferência', TRAP: 'transferência', EXTR: 'lançado no extrato', EXTP: 'lançado no extrato' }

export default function ContasCorrentesCaixa() {
  const [conta] = useEmpresaFinanceiro()
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const [dados, setDados] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const pedido = `${mes}|${conta}`
  const [visto, setVisto] = useState(pedido)
  if (visto !== pedido) { setVisto(pedido); setDados(null); setErro(''); setAberta(null) }

  useEffect(() => {
    let vivo = true
    pegarDre<Resp>(`/api/dre-financeiro/movimentos?de=${mes}-01&ate=${fimDoMes(mes)}&conta=${conta}`)
      .then((d) => { if (vivo) setDados(d) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    return () => { vivo = false }
  }, [mes, conta])

  const ccs = useMemo(() => {
    const m: Record<string, { chave: string; nome: string; ent: number; sai: number; n: number; ultimo: string; movs: Mov[] }> = {}
    for (const mv of dados?.movimentos || []) {
      const chave = String(mv.codigo_conta_corrente ?? mv.nome_conta_corrente ?? '—')
      const g = (m[chave] ||= { chave, nome: mv.nome_conta_corrente || 'Sem conta', ent: 0, sai: 0, n: 0, ultimo: '', movs: [] })
      const v = Number(mv.valor_pago) || 0
      if (mv.natureza === 'R') g.ent += v; else g.sai += v
      g.n++; g.movs.push(mv); if (mv.data_pagamento > g.ultimo) g.ultimo = mv.data_pagamento
    }
    return Object.values(m).sort((a, b) => tipoDe(a.nome)[2] - tipoDe(b.nome)[2] || (b.ent + b.sai) - (a.ent + a.sai))
  }, [dados])
  const sel = ccs.find((c) => c.chave === aberta)

  return (
    <div className="cx">
      <style>{ESTILO_CAIXA + ESTILO}</style>
      <section className="cx-card cx-topo">
        <div className="cx-grupo">
          <button type="button" className="cx-seta" onClick={() => setMes(andarMes(mes, -1))} aria-label="Mês anterior"><i className="fa-solid fa-chevron-left" /></button>
          <span className="cx-periodo" style={{ minWidth: 200, textAlign: 'center' }}>{nomeMes(mes)}</span>
          <button type="button" className="cx-seta" onClick={() => setMes(andarMes(mes, 1))} aria-label="Próximo mês"><i className="fa-solid fa-chevron-right" /></button>
          {mes !== hojeISO().slice(0, 7) && <button type="button" className="cx-link" onClick={() => setMes(hojeISO().slice(0, 7))}>Voltar para este mês</button>}
        </div>
        <span className="cx-apagado">{NOME_EMPRESA_FIN[conta]} · movimentos das contas correntes no Omie</span>
      </section>

      {erro && <div className="cx-card cx-erro">{erro}</div>}
      {!dados && !erro && <div className="cx-card cx-vazio">Carregando {nomeMes(mes).toLowerCase()}…</div>}

      {dados && (
        <>
          <section className="cx-card cx-resumo">
            <div className="cx-res"><span className="cx-rot">Entrou</span><strong style={{ color: COR.receber }}>{brl(dados.totais.entradas)}</strong><span className="cx-det">em todas as contas</span></div>
            <div className="cx-res"><span className="cx-rot">Saiu</span><strong style={{ color: COR.pagar }}>{brl(dados.totais.saidas)}</strong><span className="cx-det">em todas as contas</span></div>
            <div className="cx-res"><span className="cx-rot">Diferença do mês</span><strong>{brl(dados.totais.entradas - dados.totais.saidas)}</strong><span className="cx-det">{dados.totais.qtd} movimentos</span></div>
          </section>

          {ccs.length === 0 ? <div className="cx-card cx-vazio">Nenhum movimento em {nomeMes(mes).toLowerCase()}</div> : (
            <div className="ccx-grade">
              {ccs.map((c) => {
                const [fa, tipo] = tipoDe(c.nome)
                return (
                  <button key={c.chave} type="button" className={`cx-card ccx-cc${aberta === c.chave ? ' ccx-on' : ''}`} onClick={() => setAberta(aberta === c.chave ? null : c.chave)} aria-expanded={aberta === c.chave}>
                    <span className="ccx-cab"><span className="ccx-ico"><i className={`fa-solid fa-fw ${fa}`} /></span><span className="ccx-nome">{c.nome}<small>{tipo} · último movimento {dataBR(c.ultimo)}</small></span></span>
                    <span className="ccx-lin"><span>entrou</span><b style={{ color: COR.receber }}>{brl(c.ent)}</b></span>
                    <span className="ccx-lin"><span>saiu</span><b style={{ color: COR.pagar }}>{brl(c.sai)}</b></span>
                    <span className="ccx-lin ccx-dif"><span>diferença · {c.n} mov.</span><b>{brl(c.ent - c.sai)}</b></span>
                  </button>
                )
              })}
            </div>
          )}

          {sel && (
            <section className="cx-card">
              <div className="cx-tab-cab"><span>{sel.nome} em {nomeMes(mes).toLowerCase()}</span></div>
              <div className="cx-rola">
                <table className="cx-tab ccx-tab cx-cartao">
                  <thead><tr><th>Dia</th><th>Quem</th><th>O que foi</th><th>Entrou</th><th>Saiu</th></tr></thead>
                  <tbody>
                    {[...sel.movs].sort((a, b) => (a.data_pagamento < b.data_pagamento ? 1 : -1)).map((m) => (
                      <tr key={m.id}>
                        <td>{dataBR(m.data_pagamento)}</td>
                        <td className="cx-nome">{nomeDe(m.nome_cliente_fornecedor)}<small>{[m.descricao_categoria, m.numero_documento_fiscal ? `NF ${m.numero_documento_fiscal}` : null].filter(Boolean).join(' · ')}</small></td>
                        <td>{ORIGEM[m.origem || ''] || m.origem || '—'}</td>
                        <td style={{ color: COR.receber }}>{m.natureza === 'R' ? brl(Number(m.valor_pago)) : ''}</td>
                        <td style={{ color: COR.pagar }}>{m.natureza === 'P' ? brl(Number(m.valor_pago)) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <details className="cx-card ccx-como">
        <summary>Como ler esta tela</summary>
        <p className="cx-nota">
          Cada cartão é uma conta corrente da empresa escolhida no topo (bancos, caixa da loja, caixinha, cartão e as contas do Omie),
          com o que entrou e saiu nela no mês, pelos movimentos do Omie. Clique num cartão para ver os movimentos. O Omie manda o título
          quitado e a baixa dele como dois movimentos do mesmo dinheiro; aqui conta só a baixa. Os movimentos chegam ao portal com um ou
          dois dias de atraso. Conferir com o extrato do banco (conciliação) ainda não dá, porque o extrato não chega ao portal.
        </p>
      </details>
    </div>
  )
}

const ESTILO = `
.ccx-grade { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); align-items: stretch }
.ccx-cc { display: grid; gap: 6px; align-content: start; padding: 14px 16px; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, box-shadow .2s }
.ccx-cc:hover { border-color: #93c5fd } .ccx-on { border-color: #2563eb; box-shadow: 0 0 0 3px color-mix(in srgb, #2563eb 15%, transparent) }
.ccx-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 4px }
.ccx-ico { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; color: #2563eb; background: color-mix(in srgb, #2563eb 11%, transparent) }
.ccx-nome { display: grid; font-size: 16px; min-width: 0 } .ccx-nome small { font-size: 13px; color: var(--portal-text-muted, #64748b) }
.ccx-lin { display: flex; justify-content: space-between; gap: 8px; font-size: 14.5px; color: var(--portal-text-secondary, #475569) }
.ccx-lin b { font-weight: 500; font-variant-numeric: tabular-nums } .ccx-dif { padding-top: 6px; border-top: 1px solid var(--border, #e2e8f0); color: var(--portal-text, #0f172a) }
.ccx-tab { min-width: 720px; font-size: 15px }
.ccx-como { padding: 12px 16px } .ccx-como summary { cursor: pointer; font-size: 15px } .ccx-como p { margin-top: 8px }
`
