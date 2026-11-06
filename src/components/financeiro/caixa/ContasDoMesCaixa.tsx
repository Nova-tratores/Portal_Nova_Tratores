'use client'
// Área Contas do mês do Financeiro novo (José, 06/11/2026; docs/financeiro-novo-06-11.md): F1 Fixas, F2 Impostos,
// F3 Bens e consórcios e F4 Marketing. A tela é a comum das áreas de blocos (ModuloContasTela); o painel "no portal"
// mostra as contas que se repetem todo mês e se já vieram (o lembrete de recorrentes, lib/financeiro/recorrentes.ts).
// Por enquanto só mostra.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/auth/client'
import { BLOCOS_CONTAS_MES, type ContaModulo } from '@/lib/financeiro/modulosContas'
import type { ItemRec, Situacao } from '@/lib/financeiro/recorrentes'
import type { EmpresaFin } from '../empresaFinanceiro'
import ModuloContasTela, { Painel, nomeMes, type ContextoPainel } from './ModuloContasTela'
import { COR, brl, dataBR, nomeDe } from './comum'

type Resposta = { mes: string; conta: string; contas: ContaModulo[] }
const url = (mes: string, conta: EmpresaFin) => `/api/dre-financeiro/contas-do-mes?mes=${mes}&conta=${conta}`

const NOME_SIT: Record<Situacao, [string, string]> = {
  faltando: ['não veio', COR.vencido], aguardando: ['ainda no prazo', '#b45309'], lancada: ['veio', '#16a34a'],
  vizinho: ['veio no mês ao lado', '#16a34a'], marcada: ['marcada à mão', '#475569'],
}

export default function ContasDoMesCaixa() {
  return (
    <ModuloContasTela<Resposta>
      blocos={BLOCOS_CONTAS_MES} base="/financeiro/contas-do-mes" url={url} rotulo="contas a pagar do Omie pelo vencimento"
      painel={(ctx) => <Recorrentes {...ctx} />}
      como={<>
        Os quatro números do alto são as contas do mês da empresa escolhida no topo, pelas contas a pagar do Omie com vencimento
        no mês: F1 as fixas (aluguel, água, luz, telefone, sistemas, contabilidade, advogados, seguros, cartório), F2 os impostos
        e taxas, F3 as parcelas de bens e consórcios e F4 o marketing. Clique num deles, ou na aba de cima, para ver as contas.
        Ao lado, as contas que se repetem todo mês e se já foram lançadas no Omie (o mesmo aviso de Financeiro › Recorrentes,
        que vale para o mês atual e os dois anteriores). Por enquanto a tela só mostra.
      </>}
    />
  )
}

function Recorrentes({ bloco, conta, mes }: ContextoPainel<Resposta>) {
  const [itens, setItens] = useState<ItemRec[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    fetchAuth('/api/financeiro/recorrentes')
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erro ${r.status}`); return j })
      .then((j) => { if (vivo) setItens(j.itens || []) })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
    return () => { vivo = false }
  }, [])

  const info = BLOCOS_CONTAS_MES.find((b) => b.codigo === bloco)!
  const empresa = conta.toUpperCase()
  const doMes = (itens || []).filter((i) => i.empresa === empresa && i.mes === mes)
  const l = doMes.filter((i) => info.categorias.includes(i.categoria))
  const faltam = l.filter((i) => i.situacao === 'faltando')
  const fora = itens && doMes.length === 0 // mês fora da janela do aviso (atual e os 2 anteriores)

  return (
    <Painel titulo={`${info.nome} que se repetem todo mês`} total={itens && !fora ? `${l.length} · ${faltam.length} não ${faltam.length === 1 ? 'veio' : 'vieram'}` : undefined}>
      {erro ? <div className="cx-card cx-erro">{erro}</div>
        : !itens ? <div className="cx-vazio">Carregando…</div>
          : fora ? <div className="cx-vazio">O aviso de recorrentes olha só o mês atual e os dois anteriores.</div>
            : l.length === 0 ? <div className="cx-vazio">Nenhuma conta de {info.nome.toLowerCase()} se repete todo mês em {nomeMes(mes).toLowerCase()}</div> : (
              <ul className="ps-lista">
                {l.map((i) => {
                  const [nome, cor] = NOME_SIT[i.situacao]
                  return (
                    <li key={i.chave}>
                      <span className="ps-nome">{nomeDe(i.fornecedor)}<small>{[i.categoria, `costuma vencer dia ${i.dia}`, i.situacao === 'faltando' ? `prazo era ${dataBR(i.prazo)}` : null, i.quem_lanca ? `lança: ${i.quem_lanca}` : null].filter(Boolean).join(' · ')}</small></span>
                      <span className="cx-pilula" style={{ color: cor }}>{nome}</span>
                      <span className="ps-valor">{brl(i.valor_costumeiro)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
      <p className="cx-nota ps-pe">
        O valor é o de costume (a mediana dos últimos meses). Para marcar &quot;já lancei&quot;, &quot;pular este mês&quot; ou &quot;não é recorrente&quot;,
        use a tela de Recorrentes. <Link href="/financeiro/recorrentes" className="cx-link">Abrir Recorrentes</Link>
      </p>
    </Painel>
  )
}
