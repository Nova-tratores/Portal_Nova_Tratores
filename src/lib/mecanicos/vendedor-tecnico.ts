// Quem NÃO é técnico numa OS que só existe no Omie (José, 16/11/2026: o Dougras, diretor, aparecia como
// técnico na Gestão Pós Vendas pela OS 5440 — comissão do consórcio lançada com ele de "vendedor").

/** Nome sem acento, caixa e "de/da/do/dos/das", palavras em ordem — "DOUGRAS MOGRS DE JESUS BOMFIM" = "Dougras Mogrs Jesus Bomfim". */
export const chaveNomeCompleto = (n: unknown) => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .split(/[^A-Z]+/).filter((w) => w && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(w)).join(' ')

/** Nome completo igual ao de um vendedor do comercial (nome parcial, ex. "Luiz Fernando", NÃO conta). */
export const ehVendedor = (nome: string, vendedores: Set<string>) => vendedores.has(chaveNomeCompleto(nome))

/** OS só do Omie que é comissão de venda (consórcio, venda direta), não serviço do pós-vendas. */
export const ehComissaoDeVenda = (texto: string) => /comiss[aã]o|promo[cç][aã]o de venda/i.test(texto)
