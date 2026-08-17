// Casamento da PREFERÊNCIA DE ENVIO (EnvioBoleto) com o card (Chamado_NF).
// Muitos cards não têm cnpj_cliente preenchido — então casamos por CNPJ e,
// na falta, pelo NOME normalizado (a preferência guarda cliente_nome).

const normNome = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
  .toUpperCase().replace(/\s+/g, ' ').trim()

// Monta os mapas a partir das linhas de EnvioBoleto (select cnpj_cpf, metodo, cliente_nome).
export function montarMapasPref(rows) {
  const porCnpj = {}, porNome = {}
  for (const p of rows || []) {
    const c = String(p.cnpj_cpf || '').replace(/\D/g, '')
    if (c) porCnpj[c] = p.metodo
    const n = normNome(p.cliente_nome)
    if (n && !porNome[n]) porNome[n] = p.metodo
  }
  return { porCnpj, porNome }
}

// Descobre o método de envio preferido do cliente de um card.
export function acharMetodo(card, mapas) {
  if (!mapas) return ''
  const c = String(card?.cnpj_cliente || '').replace(/\D/g, '')
  if (c && mapas.porCnpj && mapas.porCnpj[c]) return mapas.porCnpj[c]
  const n = normNome(card?.nom_cliente)
  if (n && mapas.porNome && mapas.porNome[n]) return mapas.porNome[n]
  return ''
}
