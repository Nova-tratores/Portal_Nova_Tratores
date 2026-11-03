// Recibos de pagamento (José, 03/11/2026): tipos e validação PUROS (cliente e servidor).
// Tabela: sql/recibos.sql · PDF: ./pdf.ts · servidor: ./server.ts · tela: /financeiro/recibos.

export type TipoRecibo = 'recebemos' | 'pagamos'
export type ModeloRecibo = 1 | 2 | 3

export const EMPRESAS_RECIBO = ['Nova Tratores', 'Castro Peças'] as const

export const FORMAS_PAGAMENTO = [
  'PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência bancária', 'Cheque', 'Boleto',
] as const

export const MODELOS: { id: ModeloRecibo; nome: string; detalhe: string }[] = [
  { id: 1, nome: 'Duas vias na folha', detalhe: 'A4 com a via do cliente em cima e a via da empresa embaixo, para recortar.' },
  { id: 2, nome: 'Folha inteira', detalhe: 'Uma via só, A4 inteira, letras maiores e espaço para observação.' },
  { id: 3, nome: 'Meia folha (A5)', detalhe: 'Compacto, uma via, bom para imprimir rápido no balcão.' },
]

export interface DadosRecibo {
  empresa: string
  tipo: TipoRecibo
  pessoa_nome: string
  pessoa_doc?: string | null
  valor: number
  referente: string
  forma: string
  data_pagto: string // YYYY-MM-DD
  cidade?: string | null
  observacao?: string | null
  origem_tipo?: 'os' | 'ppv' | null
  origem_id?: string | null
  com_assinatura?: boolean
}

export interface Recibo extends DadosRecibo {
  id: number
  numero: number
  token: string
  emitido_por: string | null
  emitido_nome: string | null
  assina_nome: string | null
  cancelado_em: string | null
  cancelado_por: string | null
  cancelado_motivo: string | null
  criado_em: string
  // Omie (sql/recibos-omie.sql)
  omie_lancar?: boolean
  omie_categoria?: string | null
  omie_categoria_nome?: string | null
  omie_conta_corrente?: number | null
  omie_conta_nome?: string | null
  omie_codigo_lancamento?: number | null
  omie_baixado_em?: string | null
  omie_erro?: string | null
}

export interface EmpresaRecibo {
  nome: string
  razao_social: string
  cnpj?: string | null
  ie?: string | null
  endereco?: string | null
  telefone?: string | null
}

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Confere e limpa o que veio da tela. Lança Error com a mensagem para o usuário. */
export function validarRecibo(b: Record<string, unknown>): DadosRecibo {
  const empresa = txt(b.empresa, 60) || 'Nova Tratores'
  if (!(EMPRESAS_RECIBO as readonly string[]).includes(empresa)) throw new Error('Empresa inválida')
  const tipo = b.tipo === 'pagamos' ? 'pagamos' : b.tipo === 'recebemos' ? 'recebemos' : null
  if (!tipo) throw new Error('Escolha se a empresa recebeu ou pagou')
  const pessoa_nome = txt(b.pessoa_nome, 140)
  if (pessoa_nome.length < 3) throw new Error(tipo === 'recebemos' ? 'Informe quem pagou' : 'Informe quem recebeu')
  const docDig = String(b.pessoa_doc ?? '').replace(/\D/g, '')
  if (docDig && docDig.length !== 11 && docDig.length !== 14) throw new Error('CPF deve ter 11 números e CNPJ 14')
  const valor = Math.round(Number(String(b.valor ?? '').replace(',', '.')) * 100) / 100
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe o valor')
  if (valor > 99_999_999) throw new Error('Valor alto demais')
  const referente = txt(b.referente, 400)
  if (referente.length < 3) throw new Error('Diga a que se refere o pagamento')
  const forma = txt(b.forma, 60)
  if (!forma) throw new Error('Escolha a forma de pagamento')
  const data_pagto = txt(b.data_pagto, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_pagto) || Number.isNaN(new Date(data_pagto).getTime())) throw new Error('Data inválida')
  const origem_tipo = b.origem_tipo === 'os' || b.origem_tipo === 'ppv' ? b.origem_tipo : null
  return {
    empresa, tipo, pessoa_nome, pessoa_doc: docDig || null, valor, referente, forma, data_pagto,
    cidade: txt(b.cidade, 60) || 'Piraju - SP',
    observacao: txt(b.observacao, 600) || null,
    origem_tipo, origem_id: origem_tipo ? txt(b.origem_id, 40) || null : null,
    com_assinatura: b.com_assinatura !== false,
  }
}

/** Lançamento no Omie escolhido na tela (categoria e conta corrente). null = não lançar. */
export interface EscolhaOmie { categoria: string; categoria_nome: string; conta: number; conta_nome: string }

export function validarOmie(b: Record<string, unknown>, d: DadosRecibo): EscolhaOmie | null {
  if (b.omie_lancar !== true) return null
  if (!d.pessoa_doc) throw new Error('Para lançar no Omie, informe o CPF ou CNPJ')
  const categoria = txt(b.omie_categoria, 30)
  if (!categoria) throw new Error('Escolha a categoria do Omie')
  const conta = Number(b.omie_conta_corrente)
  if (!Number.isFinite(conta) || conta <= 0) throw new Error('Escolha a conta corrente do Omie')
  return { categoria, categoria_nome: txt(b.omie_categoria_nome, 120), conta, conta_nome: txt(b.omie_conta_nome, 120) }
}

export const numeroRecibo =(n: number) => String(n).padStart(6, '0')

export const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** CPF → 000.000.000-00 · CNPJ → 00.000.000/0000-00 · outro tamanho → como veio. */
export function formatarDoc(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return String(raw ?? '')
}
export const rotuloDoc = (raw: string | null | undefined) => {
  const n = String(raw ?? '').replace(/\D/g, '').length
  return n === 11 ? 'CPF' : n === 14 ? 'CNPJ' : ''
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
/** "Piraju - SP, 3 de novembro de 2026" (YYYY-MM-DD lido como data local). */
export function dataPorExtenso(iso: string, cidade: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${cidade}, ${d} de ${MESES[(m || 1) - 1]} de ${a}`
}
