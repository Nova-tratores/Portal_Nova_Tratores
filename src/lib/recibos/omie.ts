// Recibo → Omie (José, 03/11/2026). SÓ SERVIDOR. Colunas: sql/recibos-omie.sql.
//   pagamos   → conta a pagar (fornecedor = quem recebeu) + LancarPagamento (já sai paga)
//   recebemos → conta a receber (cliente = quem pagou)    + LancarRecebimento (já sai recebida)
// Código de integração estável REC-<NT|CP>-<número>: tentar de novo nunca duplica o lançamento,
// e a baixa usa o mesmo código (codigo_baixa_integracao), então também não repete.
import { omie } from '@/lib/omie/porta'
import {
  buscarOuCriarFornecedorOmie, criarContaPagarOmie, dataParaOmie, getAccount,
  listarCategoriasDespesa, listarCategoriasReceita, listarContasCorrentes, type OmieAccount,
} from '@/lib/financeiro/omie-contapagar'
import { brl, numeroRecibo, type Recibo, type TipoRecibo } from './tipos'

async function chamar<T>(acc: OmieAccount, endpoint: string, call: string, param: Record<string, unknown>): Promise<T> {
  const j = await omie<{ faultstring?: string; faultcode?: string }>(
    { appKey: acc.key, appSecret: acc.secret, rotulo: acc.name }, endpoint, call, param, { lancarFault: false })
  if (j?.faultstring) throw new Error(`Omie: ${j.faultstring}`)
  return j as T
}

const jaExiste = (e: unknown) => /j[aá] (cadastrad|existe(?! uma requisi))|sentry-103/i.test(String((e as Error)?.message || e))
const quitado = (e: unknown) => /j[aá] est[aá] (pago|recebido|liquidado)/i.test(String((e as Error)?.message || e))

/** Listas para a tela: categorias (despesa para pagamos, receita para recebemos) e contas correntes. */
export async function listasOmie(empresa: string, tipo: TipoRecibo) {
  const acc = getAccount(empresa)
  const [categorias, contas] = await Promise.all([
    tipo === 'pagamos' ? listarCategoriasDespesa(acc) : listarCategoriasReceita(acc),
    listarContasCorrentes(acc),
  ])
  return { categorias, contas: contas.map((c) => ({ id: c.id, descricao: c.descricao })) }
}

export const codigoIntegracaoRecibo = (r: Pick<Recibo, 'empresa' | 'numero'>) =>
  `REC-${r.empresa === 'Castro Peças' ? 'CP' : 'NT'}-${numeroRecibo(r.numero)}`

function ufDaCidade(cidade?: string | null): { cidade?: string; estado?: string } {
  const m = /^(.*?)\s*[-/]\s*([A-Za-z]{2})\s*$/.exec(String(cidade || ''))
  return m ? { cidade: m[1].trim(), estado: m[2].toUpperCase() } : { estado: 'SP' }
}

async function criarContaReceber(acc: OmieAccount, p: Record<string, unknown>): Promise<number> {
  try {
    const r = await chamar<{ codigo_lancamento_omie?: number }>(acc, '/financas/contareceber/', 'IncluirContaReceber', p)
    if (r?.codigo_lancamento_omie) return r.codigo_lancamento_omie
    throw new Error('Omie não devolveu o código do lançamento')
  } catch (e) {
    if (!jaExiste(e)) throw e
    const c = await chamar<{ codigo_lancamento_omie?: number }>(acc, '/financas/contareceber/', 'ConsultarContaReceber',
      { codigo_lancamento_integracao: p.codigo_lancamento_integracao })
    if (c?.codigo_lancamento_omie) return c.codigo_lancamento_omie
    throw e
  }
}

/** Lança o recibo no Omie (cria o título e dá baixa). Devolve o código do lançamento. Lança Error com a mensagem do Omie. */
export async function lancarReciboNoOmie(r: Recibo): Promise<{ codigo: number; baixou: boolean; codigoBaixa?: number }> {
  if (!r.omie_categoria || !r.omie_conta_corrente) throw new Error('Escolha a categoria e a conta corrente do Omie')
  if (!r.pessoa_doc) throw new Error('Para lançar no Omie precisa do CPF ou CNPJ')
  const acc = getAccount(r.empresa)
  const pagar = r.tipo === 'pagamos'
  const codPessoa = await buscarOuCriarFornecedorOmie(
    { nome: r.pessoa_nome, documento: r.pessoa_doc, tag: pagar ? 'Fornecedor' : 'Cliente', endereco: ufDaCidade(r.cidade) }, acc)

  const integ = codigoIntegracaoRecibo(r)
  const data = dataParaOmie(r.data_pagto)
  const obs = `Recibo nº ${numeroRecibo(r.numero)} (portal) — ${r.referente}. ${r.forma}. Emitido por ${r.emitido_nome || 'portal'}.`.slice(0, 999)

  let codigo = r.omie_codigo_lancamento || 0
  if (!codigo) {
    if (pagar) {
      codigo = (await criarContaPagarOmie({
        codigoIntegracao: integ, codFornecedor: codPessoa, dataVencimento: data, valor: Number(r.valor),
        codigoCategoria: r.omie_categoria, idContaCorrente: Number(r.omie_conta_corrente),
        numeroDocumento: `REC ${numeroRecibo(r.numero)}`, observacao: obs, codigoTipoDocumento: 'REC', // "Recibo" (sem isto o Omie põe NFE)
      }, acc)).codigoLancamentoOmie
    } else {
      codigo = await criarContaReceber(acc, {
        codigo_lancamento_integracao: integ, codigo_cliente_fornecedor: codPessoa,
        data_vencimento: data, data_previsao: data, valor_documento: Number(Number(r.valor).toFixed(2)),
        codigo_categoria: r.omie_categoria, id_conta_corrente: Number(r.omie_conta_corrente),
        numero_documento: `REC ${numeroRecibo(r.numero)}`, observacao: obs, codigo_tipo_documento: 'REC',
      })
    }
  }

  // baixa. NÃO dá para confiar no status_titulo: no teste de 03/11 ele seguiu "VENCE HOJE" logo depois da baixa.
  // Proteção contra baixa dupla (testada no Omie): com o mesmo codigo_baixa_integracao o Omie devolve a MESMA baixa,
  // e um título já quitado é recusado com "já está pago/recebido" — tratado como sucesso.
  const ep = pagar ? '/financas/contapagar/' : '/financas/contareceber/'
  try {
    const b = await chamar<{ codigo_baixa?: number }>(acc, ep, pagar ? 'LancarPagamento' : 'LancarRecebimento', {
      codigo_lancamento: codigo, codigo_baixa_integracao: integ, codigo_conta_corrente: Number(r.omie_conta_corrente),
      valor: Number(Number(r.valor).toFixed(2)), data, observacao: `Recibo nº ${numeroRecibo(r.numero)} · ${brl(r.valor)} · ${r.forma}`,
      conciliar_documento: 'N',
    })
    return { codigo, baixou: true, codigoBaixa: b?.codigo_baixa }
  } catch (e) {
    if (quitado(e)) return { codigo, baixou: false }
    throw e
  }
}
