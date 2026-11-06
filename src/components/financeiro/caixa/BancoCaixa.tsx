'use client'
// Área Banco do Financeiro novo (José, 06/11/2026; docs/financeiro-novo-06-11.md): B1 Empréstimos, B2 Antecipações
// e B4 Tarifas e multas, na tela comum das áreas de blocos (ModuloContasTela). O painel ao lado: para empréstimos e
// tarifas, quanto vai para cada banco no mês; para antecipações, as operações do mês (valor cheio, juros, líquido),
// remontadas pela rota do DRE a partir da conta "Omie Desconto de Duplicatas". Por enquanto só mostra.
import { useEffect, useState } from 'react'
import { BLOCOS_BANCO, type ContaModulo } from '@/lib/financeiro/modulosContas'
import type { EmpresaFin } from '../empresaFinanceiro'
import ModuloContasTela, { Painel, nomeMes, somaDoc, type ContextoPainel } from './ModuloContasTela'
import { brl, contas, dataBR, nomeDe, pegarDre } from './comum'

type Resposta = { mes: string; conta: string; contas: ContaModulo[] }
const url = (mes: string, conta: EmpresaFin) => `/api/dre-financeiro/banco?mes=${mes}&conta=${conta}`
const fimDoMes = (m: string) => { const [a, n] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(a, n, 0)).getUTCDate()).padStart(2, '0')}` }

export default function BancoCaixa() {
  return (
    <ModuloContasTela<Resposta>
      blocos={BLOCOS_BANCO} base="/financeiro/banco" url={url} rotulo="contas a pagar do Omie pelo vencimento"
      painel={(ctx) => (ctx.bloco === 'B2' ? <Antecipacoes {...ctx} /> : <PorBanco {...ctx} />)}
      como={<>
        Os três números do alto são as contas de banco da empresa escolhida no topo, pelas contas a pagar do Omie com vencimento no
        mês: B1 as parcelas, juros e IOF dos empréstimos e financiamentos, B2 as antecipações de duplicatas (Votorantim, ERG e o fundo
        do Omie, que no Omie têm a mesma categoria dos empréstimos e aqui se separam pelo parceiro) e B4 as tarifas e multas. Ao lado,
        quanto vai para cada banco no mês, ou, nas antecipações, as operações feitas no mês com o juro de cada uma. O dinheiro que entra
        e sai de cada conta corrente fica na aba Contas correntes. Por enquanto a tela só mostra.
      </>}
    />
  )
}

/** Quanto vai para cada banco/parceiro no mês (B1 e B4). */
function PorBanco({ bloco, porBloco, mes }: ContextoPainel<Resposta>) {
  const l = porBloco[bloco] || []
  const grupos = Object.values(l.reduce<Record<string, { nome: string; n: number; total: number; aberto: number }>>((m, c) => {
    const nome = nomeDe(c.nome)
    const g = (m[nome] ||= { nome, n: 0, total: 0, aberto: 0 })
    g.n++; g.total += c.valor_documento; if (c.status !== 'LIQUIDADO') g.aberto += Math.max(0, c.valor_documento - c.valor_pago)
    return m
  }, {})).sort((a, b) => b.total - a.total)
  return (
    <Painel titulo={bloco === 'B1' ? 'Por banco' : 'Por quem cobrou'} total={brl(somaDoc(l))}>
      {grupos.length === 0 ? <div className="cx-vazio">Nada em {nomeMes(mes).toLowerCase()}</div> : (
        <ul className="ps-lista">
          {grupos.map((g) => (
            <li key={g.nome}>
              <span className="ps-nome">{g.nome}<small>{contas(g.n)}{g.aberto > 0 ? ` · ${brl(g.aberto)} em aberto` : ' · tudo pago'}</small></span>
              <span className="ps-valor">{brl(g.total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="cx-nota ps-pe">
        {bloco === 'B1'
          ? 'Os contratos ainda não estão no portal. O próximo passo é o cadastro do contrato (banco, valor, parcelas, taxa), que gera as parcelas e mostra quanto falta pagar de cada um.'
          : 'Tarifas e multas entram no Omie quando aparecem no extrato. As multas desta categoria são as que o Omie põe no grupo financeiro, como as do D.E.R.'}
      </p>
    </Painel>
  )
}

type Operacao = { data: string; contaCorrente: string | null; valorCheio: number; juros: number; liquido: number; taxaPct: number; duplicatas: unknown[]; incompleta: boolean }
type RespAnt = { operacoes: Operacao[]; totais: { operacoes: number; duplicatas: number; valorCheio: number; juros: number; liquido: number; taxaMediaPct: number } }

/** As operações de antecipação do mês (B2). */
function Antecipacoes({ conta, mes }: ContextoPainel<Resposta>) {
  const [d, setD] = useState<RespAnt | null>(null)
  const [erro, setErro] = useState('')
  const pedido = `${mes}|${conta}`
  const [visto, setVisto] = useState(pedido)
  if (visto !== pedido) { setVisto(pedido); setD(null); setErro('') }
  useEffect(() => {
    let vivo = true
    pegarDre<RespAnt>(`/api/dre-financeiro/movimentos/antecipacoes?de=${mes}-01&ate=${fimDoMes(mes)}&conta=${conta}`)
      .then((r) => { if (vivo) setD(r) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    return () => { vivo = false }
  }, [mes, conta])
  const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  return (
    <Painel titulo={`Operações de ${nomeMes(mes).toLowerCase()}`} total={d ? `${d.totais.operacoes} · juros ${brl(d.totais.juros)}` : undefined}>
      {erro ? <div className="cx-card cx-erro">{erro}</div> : !d ? <div className="cx-vazio">Carregando…</div> : (
        <>
          <div className="ps-cats">
            <span>valor cheio <b>{brl(d.totais.valorCheio)}</b></span><span>caiu na conta <b>{brl(d.totais.liquido)}</b></span>
            <span>taxa média <b>{pct(d.totais.taxaMediaPct)}</b></span><span>duplicatas <b>{d.totais.duplicatas}</b></span>
          </div>
          {d.operacoes.length === 0 ? <div className="cx-vazio">Nenhuma antecipação em {nomeMes(mes).toLowerCase()}</div> : (
            <ul className="ps-lista">
              {d.operacoes.map((o, i) => (
                <li key={`${o.data}-${i}`}>
                  <span className="ps-nome">{dataBR(o.data)} · {o.duplicatas.length} duplicata{o.duplicatas.length === 1 ? '' : 's'}<small>{brl(o.valorCheio)} cheio · juros {brl(o.juros)} ({pct(o.taxaPct)}){o.incompleta ? ' · parte veio de antes de 2025' : ''}</small></span>
                  <span className="ps-valor">{brl(o.liquido)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="cx-nota ps-pe">
        Remontado a partir da conta &quot;Omie Desconto de Duplicatas&quot;: cada duplicata entra pelo valor cheio e a liberação sai pelo
        líquido mais o juro. O valor à direita é o que caiu na conta. As contas a pagar ao lado são as que os parceiros lançam
        sozinhos no Omie, já com boleto.
      </p>
    </Painel>
  )
}
