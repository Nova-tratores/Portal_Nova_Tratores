// Setor de destino do faturamento: Oficina (Pós-Vendas) ou Peças (Balcão)

// Categoria do Pedido de Venda no Omie que define o setor de Peças
export const CATEGORIA_OMIE_PECAS = '10. @Revenda de Peças Balcão'

// Determina o setor a partir da categoria do Pedido de Venda (Omie)
export function setorPorCategoriaOmie(categoria) {
  return String(categoria || '').trim() === CATEGORIA_OMIE_PECAS ? 'pecas' : 'oficina'
}

export const SETOR_LABEL = { oficina: 'Setor Oficina', pecas: 'Setor Peças' }

// Rótulo do card conforme o setor_destino (default oficina)
export function labelSetor(card) {
  return card?.setor_destino === 'pecas' ? SETOR_LABEL.pecas : SETOR_LABEL.oficina
}

// Filtro de setor:
//  - 'pecas'   → só os de peças
//  - 'oficina' → tudo que não é peças (legado/null)
//  - 'todos'   → tudo (Pós-Vendas vê Oficina + Peças)
export function ehDoSetor(card, setor) {
  if (setor === 'pecas') return card?.setor_destino === 'pecas'
  if (setor === 'oficina') return card?.setor_destino !== 'pecas'
  return true // 'todos'/indefinido
}

// Card "contém nota de serviço" quando tem num_nf_servico (ou o anexo da NFS-e).
// O setor de Peças NÃO deve ver esses cards, mesmo que também tenham NF de peça.
export function temNotaServico(card) {
  return !!String(card?.num_nf_servico || '').trim() || !!String(card?.anexo_nf_servico || '').trim()
}
