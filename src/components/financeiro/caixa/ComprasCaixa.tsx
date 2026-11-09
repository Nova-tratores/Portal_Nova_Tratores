'use client'
// Área Compras do Financeiro novo (09/11/2026; docs/financeiro-novo-06-11.md): C1 Mercadoria para revenda, C2 Tratores
// Mahindra, C3 Uso e consumo, C4 Frete, C5 Serviço de terceiros e C6 Devolução ao cliente, na tela comum das áreas de
// blocos (ModuloContasTela). O painel ao lado mostra o boleto: quantas contas do mês já têm (e onde) e as que vencem
// sem boleto, que hoje o financeiro corre atrás por fora. Por enquanto só mostra: pagar e o DDA dependem do José.
import { BLOCOS_COMPRAS, type ContaModulo, type OrigemBoleto } from '@/lib/financeiro/modulosContas'
import type { EmpresaFin } from '../empresaFinanceiro'
import ModuloContasTela, { Painel, nomeMes, type ContextoPainel } from './ModuloContasTela'
import { brl, dataBR, nomeDe } from './comum'

type Resposta = { mes: string; conta: string; contas: ContaModulo[] }
const url = (mes: string, conta: EmpresaFin) => `/api/dre-financeiro/compras?mes=${mes}&conta=${conta}`

const ORIGEM: Record<OrigemBoleto, string> = { omie: 'código de barras no Omie', portal: 'foto ou código no portal', agrupado: 'boleto agrupado do fornecedor' }

export default function ComprasCaixa() {
  return (
    <ModuloContasTela<Resposta>
      blocos={BLOCOS_COMPRAS} base="/financeiro/compras" url={url} rotulo="contas a pagar do Omie pelo vencimento"
      painel={(ctx) => <Boletos {...ctx} />}
      como={<>
        Os números do alto são as compras da empresa escolhida no topo, pelas contas a pagar do Omie com vencimento no mês, separadas
        pela categoria: C1 peças, implementos e outras entradas de mercadoria, C2 os tratores, C3 o que a oficina e o escritório
        consomem, C4 os fretes, C5 os serviços contratados e C6 as devoluções a clientes. Combustível e manutenção de veículos e do
        prédio ainda não entram aqui. Ao lado, o boleto de cada conta: o Omie quase nunca tem o código de barras, então o portal procura
        também na conta lançada pelo portal (foto ou código do boleto) e nos boletos agrupados de fornecedor. Por enquanto a tela só mostra.
      </>}
    />
  )
}

const aberta = (c: ContaModulo) => c.status !== 'LIQUIDADO'

/** O boleto das contas do bloco no mês: quantas têm e onde, e as que vencem sem boleto. */
function Boletos({ bloco, porBloco, mes }: ContextoPainel<Resposta>) {
  const l = porBloco[bloco] || []
  const abertas = l.filter(aberta)
  const contagem = (o: OrigemBoleto | null) => abertas.filter((c) => (c.boleto ?? null) === o)
  const semBoleto = contagem(null).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
  const valor = (cs: ContaModulo[]) => brl(cs.reduce((s, c) => s + Math.max(0, c.valor_documento - c.valor_pago), 0))
  return (
    <Painel titulo="Boleto" total={abertas.length ? `${abertas.length - semBoleto.length} de ${abertas.length} em aberto com boleto` : undefined}>
      {abertas.length === 0 ? <div className="cx-vazio">Nada em aberto em {nomeMes(mes).toLowerCase()}</div> : (
        <>
          <div className="ps-cats">
            {(['omie', 'portal', 'agrupado'] as OrigemBoleto[]).map((o) => {
              const cs = contagem(o)
              return cs.length ? <span key={o}>{ORIGEM[o]} <b>{cs.length}</b> <small>{valor(cs)}</small></span> : null
            })}
            <span>sem boleto <b>{semBoleto.length}</b> <small>{valor(semBoleto)}</small></span>
          </div>
          {semBoleto.length > 0 && (
            <ul className="ps-lista">
              {semBoleto.slice(0, 40).map((c) => (
                <li key={c.codigo_lancamento}>
                  <span className="ps-nome">{nomeDe(c.nome)}<small>vence {dataBR(c.data_vencimento)}{c.numero_documento ? ` · ${c.numero_documento}` : ''}</small></span>
                  {c.status === 'VENCIDO' && <span className="cx-pilula" style={{ background: '#fee2e2', color: '#b91c1c' }}>vencida</span>}
                  <span className="ps-valor">{brl(Math.max(0, c.valor_documento - c.valor_pago))}</span>
                </li>
              ))}
              {semBoleto.length > 40 && <li><span className="ps-nome"><small>e mais {semBoleto.length - 40}</small></span></li>}
            </ul>
          )}
        </>
      )}
      <p className="cx-nota ps-pe">
        {bloco === 'C2'
          ? 'As parcelas dos tratores entram no Omie por repetição, quase todas sem a nota. Falta o José dizer se é floor plan (financiamento do estoque pelo banco ou pela Mahindra).'
          : bloco === 'C6'
            ? 'São R$ 4,9 milhões de devoluções de venda lançados por repetição no ano, só na Nova. Falta o José dizer o que são.'
            : 'Boleto que chega por e-mail ou papel e não foi anexado não aparece aqui. Com o DDA do banco, o boleto entraria sozinho: falta saber qual banco tem.'}
      </p>
    </Painel>
  )
}
