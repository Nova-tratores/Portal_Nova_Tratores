// Tipos do módulo Gestão de Vendas (port do app externo gestao-vendas).
// Tabelas: vendas_itens, comissao_ajustes_vendas, comissao_custos_vendedor,
// vendedores, pedidos_venda_relatorio (todas já existentes no Supabase).

export type VendaItem = {
  id: number
  mes: number
  ano: number
  codigo_produto: string | null
  valor_total: number
  quantidade: number
  valor_unitario: number
  tipo: string | null
  created_at: string
  familia: string | null
  data_pedido: string | null
  numero_pedido: string | null
  descricao: string | null
  codigo_cliente: string | null
  codigo_categoria: string | null
  conta_omie: string
  cmc_unitario: number | null
  vendedor: string | null
  nome_cliente: string | null
  departamento: string | null
}

// Campos resolvidos no servidor a partir das tabelas master (clientes/produtos/categorias)
export type VendaEnriquecida = VendaItem & {
  cliente_nome: string | null
  produto_familia_real: string | null
  categoria_descricao: string | null
}

export type AjusteVenda = {
  id: number
  conta_omie: string
  venda_id: string
  data_venda: string | null
  mes: number | null
  ano: number | null
  cliente: string | null
  vendedor: string | null
  familia: string | null
  categoria: string | null
  departamento: string | null
  produto_descricao: string | null
  cmc_total: number | null
  cmc_override: number | null // CMC total corrigido à mão; null = usa snapshot
  valor_venda: number
  margem_bruta_pct: number | null
  custos_extras: number
  custos_extras_desc: string | null
  desconto: number
  desconto_desc: string | null
  comissao_override_pct: number | null
  justificativa: string | null
  comissao_pct: number | null
  valor_comissao: number | null
  custo_total: number | null
  venda_liquida: number | null
  margem_loja: number | null
  margem_loja_pct: number | null
  status: string
  usuario: string | null
  created_at: string
  updated_at: string
}

export const CAMPOS_CUSTO = [
  'salario',
  'encargos',
  'custos_extras',
  'carro_aluguel',
  'combustivel',
  'manutencao',
] as const

export type CampoCusto = (typeof CAMPOS_CUSTO)[number]

export type CustoMensalVendedor = {
  id: number
  nome: string
  mes: number
  ano: number
  conta_omie: string
  salario: number
  encargos: number
  custos_extras: number
  carro_aluguel: number
  combustivel: number
  manutencao: number
  created_at: string
  updated_at: string
}

export type Vendedor = {
  id: number
  nome: string
  email: string
  ativo: boolean
  codigo: number | null
}

export type PedidoVendaItemEnriquecido = {
  codigo?: string
  familia?: string | null
  descricao?: string | null
  lucro_item?: number
  quantidade?: number
  valor_total?: number
  custo_origem?: string
  custo_unitario?: number
  valor_unitario?: number
  data_custo_entrada?: string
}

export type PedidoVendaRelatorio = {
  id: number
  empresa: string
  numero_venda: string
  data_emissao: string | null
  data_abertura: string | null
  cliente: string | null
  vendedor: string | null
  valor_total: number | null
  etapa: string | null
  nome_projeto: string | null
  categoria: string | null
  observacao: string | null
  cancelada: string | null
  devolvido: string | null
  itens_enriquecidos: PedidoVendaItemEnriquecido[] | null
  created_at: string | null
  updated_at: string | null
}

export const EMPRESAS_GV: { value: 'NOVA' | 'CASTRO'; label: string }[] = [
  { value: 'NOVA', label: 'Nova Tratores' },
  { value: 'CASTRO', label: 'Castro Peças' },
]

export function nomeEmpresaGV(conta: string | null | undefined): string {
  const up = (conta ?? '').toUpperCase()
  if (up === 'TODAS') return 'Todas as Lojas'
  return EMPRESAS_GV.find((e) => e.value === up)?.label ?? up
}
