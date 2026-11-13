// DRE GERENCIAL POR SETOR — regras PURAS (sem banco). José, 11/11/2026 (tela "Como está a empresa").
//
// Ponto de partida: os lançamentos do DRE do Omie (ListarDRE, cópia mensal em dre_cache), sem as vendas entre
// NOVA e CASTRO. Diagnóstico de controladoria (11/11/2026): o plano de contas do Omie liga categorias que NÃO são
// resultado a linhas do DRE, e isso fabrica prejuízo todo mês:
//   • "Compras de Tratores/Implementos/Peças para Revenda" → "Custo dos Serviços Prestados" (a compra é ESTOQUE;
//     o custo da máquina vendida já entra no CMC — contava duas vezes; em jul/2026 foram R$ 1,39 mi)
//   • "Outras Entradas de Peças" → "Outros Custos" (entrada de estoque, não custo)
//   • "Pagamento de Empréstimos" → "Despesas Financeiras" (devolver o principal não é despesa; os juros continuam)
//   • "Adiantamento a Fornecedores" → custo (é adiantamento, não custo)
//   • "3. Investimentos" (compra de ativo) — fora do resultado
// O gerencial tira esses lançamentos (e mostra a lista do que tirou). A correção definitiva é no Omie.
//
// Setor de cada lançamento (decisão do José: "departamento + receita"):
//   1) departamento do Omie: Comercial Tratores/Implementos/Frota e Marketing → Comercial; Comercial Peças → Peças;
//      Oficina e "Serviços em…" → Pós-Vendas
//   2) sem departamento útil: pela categoria (venda de trator/implemento → Comercial; peças balcão → Peças;
//      serviço, deslocamento, peças da OS/revisão, garantia → Pós-Vendas)
//   Receita e deduções: a CATEGORIA decide antes do departamento (11/11: uma venda de implemento de R$ 350 mil veio
//   com departamento 'Comercial Peças'). CMC (vem sem categoria): o setor da VENDA da mesma nota fiscal; senão o
//   departamento. "Descontos Concedidos" (o Omie põe em despesa financeira) viram dedução da receita do setor.
//   3) o que sobra sem setor (Administrativo, N/D…) vai para "geral" e é RATEADO pela parte de cada setor na receita.

export type SetorG = 'comercial' | 'posvendas' | 'pecas'
export const SETORES_G: SetorG[] = ['comercial', 'posvendas', 'pecas']

export interface MovDre {
  valor: number | string; dreTipo?: string; dreGrupo?: string; dreConta?: string
  categoria?: string; departamento?: string; cnpj_cpf?: string; origem?: string; numeroDocFiscal?: string
}

/** As linhas do DRE gerencial (valores com sinal: receita +, custos/despesas −). */
export interface LinhasDre {
  receita: number        // 01. Receita Bruta de Vendas
  deducoes: number       // impostos sobre venda, devoluções, frete de venda
  custos: number         // CMC + custo dos serviços + outros custos (já sem as compras para revenda)
  margem: number         // receita + deduções + custos
  outrasReceitas: number // receitas financeiras (descontos obtidos, juros recebidos)
  despesas: number       // despesas do próprio setor (pessoal, variáveis, adm, financeiras, marketing)
  rateio: number         // parte das despesas gerais que cabe ao setor (pela receita)
  resultado: number      // margem + outrasReceitas + despesas + rateio
  porConta: Record<string, number> // dreConta → valor (para abrir a conta)
}

export interface AjusteDre { id: string; nome: string; explica: string; valor: number; qtd: number }

export interface DreGerencial {
  setores: Record<SetorG, LinhasDre>
  geral: LinhasDre         // o que ficou sem setor (antes do rateio) — rateio sai daqui
  empresa: LinhasDre       // soma dos setores (= resultado gerencial da empresa)
  omie: number             // resultado do DRE do Omie (sem intercompany), para comparar
  ajustes: AjusteDre[]     // o que o gerencial tirou
  parteReceita: Record<SetorG, number> // chave do rateio (0..1)
}

const n = (v: unknown) => Number(v) || 0
const linhasVazias = (): LinhasDre => ({ receita: 0, deducoes: 0, custos: 0, margem: 0, outrasReceitas: 0, despesas: 0, rateio: 0, resultado: 0, porConta: {} })

const AJUSTES: Array<{ id: string; nome: string; explica: string; teste: (m: MovDre) => boolean }> = [
  { id: 'compras_revenda', nome: 'Compras para revenda', explica: 'Compra de máquina e peça para vender é estoque, não custo. O custo entra no CMC quando a venda acontece.',
    teste: (m) => /compras?\s+de\s+.*para\s+revenda/i.test(m.categoria || '') },
  { id: 'entradas_estoque', nome: 'Entradas de estoque', explica: '"Outras Entradas de Peças" é entrada de estoque, não custo.',
    teste: (m) => /outras\s+entradas\s+de\s+pe/i.test(m.categoria || '') },
  { id: 'emprestimos', nome: 'Principal de empréstimos', explica: 'Devolver o dinheiro emprestado não é despesa. Os juros continuam como despesa financeira.',
    teste: (m) => /pagamento\s+de\s+empr/i.test(m.categoria || '') },
  { id: 'adiantamentos', nome: 'Adiantamento a fornecedores', explica: 'Adiantamento é dinheiro que volta como mercadoria ou serviço, não é custo.',
    teste: (m) => /adiantamento\s+a\s+fornecedor/i.test(m.categoria || '') },
  { id: 'investimentos', nome: 'Investimentos (ativos)', explica: 'Compra de bem da empresa (veículo, equipamento) não é despesa do mês.',
    teste: (m) => /^3\./.test(String(m.dreTipo || '').trim()) },
]

/** Setor pelo departamento do Omie; null = departamento não decide. */
export function setorPorDepartamento(dep: string | undefined): SetorG | null {
  const d = String(dep || '').toLowerCase()
  if (!d || d === 'n/d') return null
  if (/comercial\s+pe[çc]as/.test(d)) return 'pecas'
  if (/oficina|servi[çc]os?\s+em/.test(d)) return 'posvendas'
  if (/comercial|marketing/.test(d)) return 'comercial'
  return null // administrativo, "sua empresa", desativado…
}
/** Setor pela categoria (quando o departamento não decide); null = geral. */
export function setorPorCategoria(cat: string | undefined): SetorG | null {
  const c = String(cat || '').toLowerCase()
  if (!c || c === 'n/d') return null
  if (/pe[çc]as\s+balc/.test(c)) return 'pecas'
  if (/serv\s*prest|servi[çc]os?\s+prestados|deslocamento|pe[çc]as\s+(em\s+servi|revis)|garantia|entrega\s+t[ée]cnica|montagem/.test(c)) return 'posvendas'
  if (/venda\s+de\s+(tratores|implementos|m[áa]quinas)|atv|utv|seminov/.test(c)) return 'comercial'
  return null
}

/** Linha do DRE gerencial de um lançamento (já fora os ajustes). */
function linhaDe(m: MovDre): keyof Omit<LinhasDre, 'margem' | 'resultado' | 'rateio' | 'porConta'> | null {
  if (/descontos?\s+concedidos?/i.test(m.categoria || '')) return 'deducoes'
  const tipo = String(m.dreTipo || ''), conta = String(m.dreConta || '').toLowerCase(), grupo = String(m.dreGrupo || '').toLowerCase()
  if (tipo.startsWith('2')) return 'despesas'
  if (!tipo.startsWith('1')) return null
  if (conta.includes('receita bruta')) return 'receita'
  if (conta.includes('receitas financeiras') || grupo.includes('indireta')) return 'outrasReceitas'
  if (conta.includes('impostos') || conta.includes('dedu')) return 'deducoes'
  return 'custos'
}

/**
 * Monta o DRE gerencial de UM mês.
 * @param movs lançamentos do mês já SEM intercompany (NOVA ↔ CASTRO)
 */
export type Linha = 'receita' | 'deducoes' | 'custos' | 'outrasReceitas' | 'despesas'
/** onLanc: chamado para cada lançamento já classificado (setor null = despesas gerais, rateadas) */
export function montarDreGerencial(movs: MovDre[], onLanc?: (m: MovDre, setor: SetorG | null, linha: Linha) => void): DreGerencial {
  const setores = Object.fromEntries(SETORES_G.map((s) => [s, linhasVazias()])) as Record<SetorG, LinhasDre>
  const geral = linhasVazias()
  const ajustes = AJUSTES.map((a) => ({ id: a.id, nome: a.nome, explica: a.explica, valor: 0, qtd: 0 }))
  let omie = 0
  // nota fiscal → setor da venda (para levar o CMC, que vem sem categoria, para o setor certo)
  const setorDaNota = new Map<string, SetorG>()
  for (const m of movs) {
    if (!String(m.dreConta || '').toLowerCase().includes('receita bruta')) continue
    const s = setorPorCategoria(m.categoria) ?? setorPorDepartamento(m.departamento)
    if (s) for (const nf of String(m.numeroDocFiscal || '').split('/').map((x) => x.trim()).filter(Boolean)) setorDaNota.set(nf, s)
  }
  const setorDe = (m: MovDre, linha: string): SetorG | null => {
    if (linha === 'receita' || linha === 'deducoes') return setorPorCategoria(m.categoria) ?? setorPorDepartamento(m.departamento)
    if (linha === 'custos') {
      const daNota = String(m.numeroDocFiscal || '').split('/').map((x) => setorDaNota.get(x.trim())).find(Boolean)
      return daNota ?? setorPorDepartamento(m.departamento) ?? setorPorCategoria(m.categoria)
    }
    return setorPorDepartamento(m.departamento) ?? setorPorCategoria(m.categoria)
  }

  for (const m of movs) {
    const v = n(m.valor), tipo = String(m.dreTipo || '')
    if (tipo.startsWith('1') || tipo.startsWith('2')) omie += v
    const aj = AJUSTES.findIndex((a) => a.teste(m))
    if (aj >= 0) { ajustes[aj].valor += v; ajustes[aj].qtd++; continue }
    const linha = linhaDe(m)
    if (!linha) continue
    const setor = setorDe(m, linha)
    onLanc?.(m, setor, linha as Linha)
    const alvo = setor ? setores[setor] : geral
    alvo[linha] += v
    const chave = String(m.dreConta || '(sem conta)')
    alvo.porConta[chave] = (alvo.porConta[chave] || 0) + v
  }

  // rateio do geral pela parte de cada setor na receita (receita do geral também é rateada)
  const recSet = SETORES_G.reduce((a, s) => a + Math.max(0, setores[s].receita), 0)
  const parteReceita = Object.fromEntries(SETORES_G.map((s) => [s, recSet ? Math.max(0, setores[s].receita) / recSet : 1 / SETORES_G.length])) as Record<SetorG, number>
  const totalGeral = geral.receita + geral.deducoes + geral.custos + geral.outrasReceitas + geral.despesas
  for (const s of SETORES_G) {
    const l = setores[s]
    l.margem = l.receita + l.deducoes + l.custos
    l.rateio = totalGeral * parteReceita[s]
    l.resultado = l.margem + l.outrasReceitas + l.despesas + l.rateio
  }
  geral.margem = geral.receita + geral.deducoes + geral.custos
  geral.resultado = totalGeral

  const empresa = linhasVazias()
  for (const s of SETORES_G) {
    const l = setores[s]
    for (const k of ['receita', 'deducoes', 'custos', 'margem', 'outrasReceitas', 'despesas', 'rateio', 'resultado'] as const) empresa[k] += l[k]
    for (const [c, v] of Object.entries(l.porConta)) empresa.porConta[c] = (empresa.porConta[c] || 0) + v
  }
  for (const [c, v] of Object.entries(geral.porConta)) empresa.porConta[c] = (empresa.porConta[c] || 0) + v

  return { setores, geral, empresa, omie, ajustes: ajustes.filter((a) => a.qtd > 0), parteReceita }
}

/** Tira os lançamentos entre as empresas do grupo (a mesma regra do DRE consolidado). */
export const CNPJ_GRUPO = { nova: '31463139000103', castro: '23268241000111' } as const
export function semIntercompany(movs: MovDre[], conta: 'nova' | 'castro'): MovDre[] {
  const outra = conta === 'nova' ? CNPJ_GRUPO.castro : CNPJ_GRUPO.nova
  return movs.filter((m) => String(m.cnpj_cpf || '').replace(/\D/g, '') !== outra)
}
