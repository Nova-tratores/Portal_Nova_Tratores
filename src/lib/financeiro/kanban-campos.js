// Regras puras dos campos editáveis no modal dos kanbans (Pós-Vendas e Peças).

// A tela só tem campos de comprovante até a 5ª parcela (comprovante_pagamento_p1..p5).
export const MAX_PARCELAS_TELA = 5

// Coluna numérica: campo apagado vira null (gravar '' numa coluna numeric dá erro).
export function valorNumericoOuNull(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Datas da 2ª parcela em diante (datas_parcelas = "aaaa-mm-dd, aaaa-mm-dd").
// Registros antigos salvaram a parcela 1 também aqui — remove pra não duplicar.
export function datasExtrasDoCard(card) {
  const raw = String(card?.datas_parcelas || '').split(/[\s,]+/).filter((d) => d.includes('-'))
  if (raw.length > 0 && raw[0] === card?.vencimento_boleto) raw.shift()
  return raw
}

// Grava a data da parcela (indice 0 = 2ª parcela) sem deslocar as outras.
// O texto não guarda "buraco" (quem lê descarta vazios), então as datas precisam
// ir em ordem: não dá pra preencher a 4ª com a 3ª vazia, nem apagar a do meio.
// Devolve { ok: true, texto } ou { ok: false, erro }.
export function salvarDataParcela(atuais, indice, valor) {
  const arr = [...(atuais || [])]
  const v = String(valor || '').trim()
  const nome = (i) => `${i + 2}ª parcela`
  if (v) {
    if (indice > arr.length) return { ok: false, erro: `Preencha antes a data da ${nome(arr.length)}.` }
    arr[indice] = v
  } else {
    if (indice < arr.length - 1) return { ok: false, erro: `Para apagar a data da ${nome(indice)}, apague antes a das parcelas seguintes.` }
    if (indice === arr.length - 1) arr.pop()
  }
  return { ok: true, texto: arr.join(', ') }
}

// Opções do seletor "Quantidade": 1..5 e, se o Omie mandou mais, o valor real também
// (senão o select mostraria uma opção que não é a verdadeira).
export function opcoesQtdParcelas(qtdBruta) {
  const qtd = parseInt(qtdBruta, 10) || 1
  const opcoes = Array.from({ length: MAX_PARCELAS_TELA }, (_, i) => i + 1)
  const foraDoPadrao = qtd > MAX_PARCELAS_TELA
  if (foraDoPadrao) opcoes.push(qtd)
  return { qtd, opcoes, foraDoPadrao }
}
