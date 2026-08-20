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

// Valor → número. Aceita número ou string ("1234.56", "1.234,56", "R$ ...").
// Devolve null quando não dá pra interpretar (null, '', texto).
export function parseValorNum(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  let str = String(v).replace(/[R$\s]/g, '').trim()
  if (!str) return null
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.')
  else if (str.includes(',')) str = str.replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// Valor → "R$ 1.234,56". Aceita número ou string ("1234.56", "1.234,56", "R$ ...").
export function formatarBRL(v) {
  const n = parseValorNum(v)
  if (n == null) return v == null ? '' : String(v)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Valor TOTAL do card (Chamado_NF), com fallbacks — evita o "R$ 0,00" no e-mail:
// 1) valor_servico (o total preenchido pelo sync do Omie / edição manual)
// 2) valor (campo alternativo de registros antigos)
// 3) soma de valor_parcela1..5 (quando só as parcelas foram preenchidas)
// Zero/vazio conta como "não preenchido" e cai pro próximo. Sem nada → null.
export function valorTotalCard(card) {
  if (!card) return null
  const direto = parseValorNum(card.valor_servico)
  if (direto) return direto
  const alt = parseValorNum(card.valor)
  if (alt) return alt
  const soma = [card.valor_parcela1, card.valor_parcela2, card.valor_parcela3, card.valor_parcela4, card.valor_parcela5]
    .map(parseValorNum).filter((n) => n && n > 0).reduce((a, b) => a + b, 0)
  return soma > 0 ? soma : null
}

// Monta a lista de parcelas do card (Chamado_NF):
//  - parcela 1 = vencimento_boleto; parcelas 2..N = datas_parcelas (separadas por vírgula)
//  - valor de cada parcela: valor_parcelaN quando preenchido; senão TOTAL ÷ qtd
//    (é como o kanban calcula — os campos valor_parcelaN normalmente não são gravados)
//  - a última parcela recebe o ajuste de centavos pra soma bater com o total
// À vista (qtd<=1) devolve uma única parcela com o valor total.
// Retorno: [{ n, data (dd/mm/aaaa), valor ("R$ ...") }]
export function montarParcelas(card) {
  if (!card) return []
  const qtd = parseInt(card.qtd_parcelas) || 1
  const total = valorTotalCard(card)

  if (qtd <= 1) {
    return [{ n: 1, data: formatarDataBR(card.vencimento_boleto), valor: total != null ? formatarBRL(total) : '' }]
  }

  // Datas: registros antigos salvaram a parcela 1 TAMBÉM dentro de datas_parcelas
  // (mesma correção usada nos kanbans) — remove pra não duplicar.
  const rawDatas = String(card.datas_parcelas || '').split(/[\s,]+/).map((s) => s.trim())
    .filter((d) => d.includes('-') || d.includes('/'))
  if (rawDatas.length > 0 && rawDatas[0] === card.vencimento_boleto) rawDatas.shift()
  const datas = [card.vencimento_boleto, ...rawDatas]

  const valoresCampo = [card.valor_parcela1, card.valor_parcela2, card.valor_parcela3, card.valor_parcela4, card.valor_parcela5]
    .map(parseValorNum)
  const temCampos = valoresCampo.some((v) => v && v > 0)
  const valorUnit = total != null ? Math.round((total / qtd) * 100) / 100 : null

  const parcelas = []
  for (let i = 1; i <= qtd; i++) {
    const vCampo = valoresCampo[i - 1]
    const v = vCampo && vCampo > 0 ? vCampo : valorUnit
    parcelas.push({ n: i, data: formatarDataBR(datas[i - 1] || ''), valor: v != null ? formatarBRL(v) : '' })
  }
  // Sem valores por parcela no card → última parcela absorve a diferença de centavos
  if (!temCampos && total != null && valorUnit != null) {
    const resto = Math.round((total - valorUnit * (qtd - 1)) * 100) / 100
    parcelas[qtd - 1].valor = formatarBRL(resto)
  }
  return parcelas
}
