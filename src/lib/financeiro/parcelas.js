// Helpers do e-mail de cobrança: formatação de data em pt-BR e montagem das parcelas.

// Aceita ISO (aaaa-mm-dd), dd/mm/aaaa ou Date → devolve dd/mm/aaaa.
export function formatarDataBR(d) {
  if (!d) return ''
  const s = String(d).trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  if (br) return `${br[1]}/${br[2]}/${br[3]}`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s
}

// Valor → "R$ 1.234,56". Aceita número ou string ("1234.56", "1.234,56", "R$ ...").
export function formatarBRL(v) {
  if (v == null || v === '') return ''
  let n = typeof v === 'number' ? v : NaN
  if (isNaN(n)) {
    let str = String(v).replace(/[R$\s]/g, '').trim()
    if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.')
    else if (str.includes(',')) str = str.replace(',', '.')
    n = parseFloat(str)
  }
  if (isNaN(n)) return String(v)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Monta a lista de parcelas do card (Chamado_NF):
//  - parcela 1 = vencimento_boleto + valor_parcela1
//  - parcelas 2..N = datas_parcelas (separadas por vírgula) + valor_parcela2..N
// À vista (qtd<=1) devolve uma única parcela com o valor total.
// Retorno: [{ n, data (dd/mm/aaaa), valor ("R$ ...") }]
export function montarParcelas(card) {
  if (!card) return []
  const qtd = parseInt(card.qtd_parcelas) || 1
  const valores = [card.valor_parcela1, card.valor_parcela2, card.valor_parcela3, card.valor_parcela4, card.valor_parcela5]
  const datasRest = String(card.datas_parcelas || '').split(',').map((s) => s.trim()).filter(Boolean)

  if (qtd <= 1) {
    const v = card.valor_parcela1 ?? card.valor_servico ?? card.valor
    return [{ n: 1, data: formatarDataBR(card.vencimento_boleto), valor: formatarBRL(v) }]
  }

  const parcelas = [{ n: 1, data: formatarDataBR(card.vencimento_boleto), valor: formatarBRL(valores[0]) }]
  for (let i = 2; i <= qtd; i++) {
    const data = datasRest[i - 2] || ''
    const valor = valores[i - 1] ?? valores[0]
    parcelas.push({ n: i, data: formatarDataBR(data), valor: formatarBRL(valor) })
  }
  return parcelas
}
