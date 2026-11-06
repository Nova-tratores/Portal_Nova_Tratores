'use client'
// Área Pessoas do Financeiro novo (José, 06/11/2026; docs/financeiro-novo-06-11.md): o que a empresa paga para a
// equipe no mês, nos blocos P1 Folha, P2 Benefícios, P3 Comissões e P4 Viagens e alimentação. A tela é a comum
// das áreas de blocos (ModuloContasTela); aqui fica o painel "no portal": as comissões calculadas e as
// requisições de Alimentação. Por enquanto só mostra; lançar no Omie a partir daqui é o passo seguinte.
import Link from 'next/link'
import { BLOCOS_PESSOAS, type RespostaPessoas } from '@/lib/financeiro/pessoas'
import type { EmpresaFin } from '../empresaFinanceiro'
import ModuloContasTela, { Painel, nomeMes, somaDoc, type ContextoPainel } from './ModuloContasTela'
import { COR, brl, dataBR } from './comum'

const NOME_COMISSAO: Record<string, [string, string]> = {
  aguardando: ['aguardando o diretor', '#b45309'], devolvida: ['devolvida para correção', '#b45309'],
  espelhada: ['autorizada, no RH', '#16a34a'], erro_rh: ['autorizada, erro ao mandar ao RH', COR.vencido],
}
const NOME_REQ: Record<string, [string, string]> = { pedido: ['em aberto', '#b45309'], financeiro: ['no Financeiro', '#16a34a'] }
const url = (mes: string, conta: EmpresaFin) => `/api/dre-financeiro/pessoas?mes=${mes}&conta=${conta}`

export default function PessoasCaixa() {
  return (
    <ModuloContasTela<RespostaPessoas>
      blocos={BLOCOS_PESSOAS} base="/financeiro/pessoas" url={url} rotulo="contas a pagar do Omie pelo vencimento"
      painel={(ctx) => <NoPortal {...ctx} />}
      como={<>
        Os quatro números do alto são o que a empresa escolhida no topo tem para pagar à equipe no mês, pelas contas a pagar do Omie,
        com vencimento no mês. Clique num deles, ou na aba de cima, para ver as contas. Ao lado, o que o portal já sabe do mesmo assunto: as comissões
        calculadas na Gestão Pós-Vendas (as de um mês são pagas no seguinte) e as requisições de Alimentação. Por enquanto a tela só
        mostra; lançar no Omie a partir daqui é o próximo passo.
      </>}
    />
  )
}

function NoPortal({ bloco, dados, conta, porBloco }: ContextoPainel<RespostaPessoas>) {
  if (bloco === 'P3') {
    const total = dados.comissoes.reduce((a, c) => a + c.valor, 0)
    const autorizado = dados.comissoes.filter((c) => c.status === 'espelhada' || c.status === 'erro_rh').reduce((a, c) => a + c.valor, 0)
    return (
      <Painel titulo={`Comissões de ${nomeMes(dados.mesComissoes).toLowerCase()} no portal`} total={brl(total)}>
        {dados.comissoes.length === 0 ? <div className="cx-vazio">Nenhuma comissão calculada para {nomeMes(dados.mesComissoes).toLowerCase()}</div> : (
          <ul className="ps-lista">
            {dados.comissoes.map((c) => {
              const [nome, cor] = NOME_COMISSAO[c.status] || [c.status, '#475569']
              return <li key={c.id}><span className="ps-nome">{c.tecnico}</span><span className="cx-pilula" style={{ color: cor }}>{nome}</span><span className="ps-valor">{brl(c.valor)}</span></li>
            })}
          </ul>
        )}
        <p className="cx-nota ps-pe">
          Autorizado: {brl(autorizado)}. No Omie da {conta === 'castro' ? 'Castro' : 'Nova'}, comissões com vencimento neste mês: {brl(somaDoc(porBloco.P3 || []))}.
          {' '}As comissões do portal são as da Gestão Pós-Vendas. <Link href="/mecanicos" className="cx-link">Abrir a Gestão</Link>
        </p>
      </Painel>
    )
  }
  if (bloco === 'P4') {
    const l = dados.alimentacao
    const emAberto = l.filter((r) => r.status === 'pedido')
    const noFin = l.filter((r) => r.status === 'financeiro')
    return (
      <Painel titulo="Requisições de Alimentação no portal" total={`${l.length} · ${brl(l.reduce((a, r) => a + r.valor, 0))}`}>
        <div className="ps-cats"><span>em aberto <b>{brl(emAberto.reduce((a, r) => a + r.valor, 0))}</b> <small>{emAberto.length}</small></span><span>no Financeiro <b>{brl(noFin.reduce((a, r) => a + r.valor, 0))}</b> <small>{noFin.length}</small></span></div>
        {l.length === 0 ? <div className="cx-vazio">Nenhuma requisição de Alimentação neste mês</div> : (
          <ul className="ps-lista">
            {l.slice(0, 30).map((r) => {
              const [nome, cor] = NOME_REQ[r.status] || [r.status, '#475569']
              return <li key={r.id}><span className="ps-nome">{r.solicitante || 'Sem nome'}<small>{[dataBR(r.data), r.ordem_servico, r.fornecedor].filter(Boolean).join(' · ')}</small></span><span className="cx-pilula" style={{ color: cor }}>{nome}</span><span className="ps-valor">{brl(r.valor)}</span></li>
            })}
          </ul>
        )}
        <p className="cx-nota ps-pe">
          A requisição não diz a empresa: aqui aparecem as das duas. A requisição aberta pela OS fica em aberto até a OS concluir.
          {l.length > 30 && ` Mostrando as 30 mais recentes de ${l.length}.`} <Link href="/requisicoes" className="cx-link">Abrir Requisições</Link>
        </p>
      </Painel>
    )
  }
  return (
    <Painel titulo={bloco === 'P1' ? 'Folha no portal' : 'Benefícios no portal'}>
      <p className="cx-nota ps-pe">
        {bloco === 'P1'
          ? 'A folha é fechada pela contabilidade, e o RH do portal lança no Omie a previsão de salário de cada pessoa ao montar a folha do mês (número RH-SAL-mês-ano). Ligar a folha do RH a esta tela é o passo seguinte.'
          : 'Os benefícios ainda não estão no portal: hoje são lançados à mão no Omie. Cadastrar o benefício de cada pessoa no RH, para gerar as contas do mês junto com a folha, é o passo seguinte.'}
        {bloco === 'P2' && conta === 'castro' && ' Atenção: na Castro, "Vale Transporte" tem Alelo, CTF e Sem Parar, que são combustível e pedágio; a categoria parece errada.'}
      </p>
    </Painel>
  )
}
