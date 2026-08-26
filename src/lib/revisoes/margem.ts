// =====================================================================
// Cálculo de MARGEM DE REVISÕES (v1) — função pura, SEM I/O.
// Recebe parâmetros + itens já resolvidos e devolve a margem de uma célula
// (modelo × kit × pagador). O acesso a banco fica em margem-server.ts.
//
// Regras: docs/projecao-lucro-revisoes.md e o prompt-file `revisoes-margem`.
// =====================================================================

export type Pagador = 'cliente' | 'fabrica' | 'cortesia_loja'
export type OrigemKit = 'proprio' | 'fallback_modelo' | 'fallback_generico'

// Parâmetros de cálculo (espelha a linha vigente de revisao_parametros).
export interface RevisaoParametros {
  valor_hora_cliente: number
  valor_hora_garantia: number
  tarifa_km: number
  salario_base: number
  fator_encargos: number
  horas_uteis_mes: number
  pct_servico: number
  pct_deslocamento: number
  velocidade_media_kmh: number
  custo_combustivel_km: number
  custo_manutencao_km: number
  aliquota_iss: number
  aliquota_pis_cofins: number
  cmc_liquido_de_impostos: boolean
  pct_credito_cmc: number
  comissao_min: number
  comissao_max: number
  comissao_media: number
  fator_realizacao_km: number
  fator_realizacao_horas: number
}

// Item do kit já resolvido (CMC + preço de venda vindos de Produtos_Completos).
export interface ItemResolvido {
  codigo: string
  descricao?: string
  quantidade: number
  cmc: number      // custo médio unitário (bruto)
  preco: number    // preço de venda unitário
}

// Os 11 marcos de horímetro e os 5 kits DISTINTOS (o resto é ciclo).
export const MARCOS = [50, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000] as const
export const KITS_DISTINTOS = [50, 300, 600, 900, 1200] as const

// horas de MO default quando não há linha em revisao_horas_padrao (provisório —
// o valor real vem da planilha/editor; ver §4 do prompt).
export const DEFAULT_HORAS_PADRAO = 2

// Fallbacks de modelo (§2.2) — NUNCA silenciosos: quem usa marca origem_kit.
const FALLBACK_MODELO: Record<string, string> = { '7095': '9500' }
const MODELO_GENERICO = '2025'

// -------------------------------------------------------------------------
// Ciclo de revisões: só existem 5 kits; de 300h em diante repetem de 4 em 4.
// 1500->300, 1800->600, 2100->900, 2400->1200, 2700->300, 3000->600.
// -------------------------------------------------------------------------
export function kitDeHoras(horas: number): number {
  if (horas < 300) return 50
  const n = Math.round(horas / 300)
  return 300 + 300 * ((n - 1) % 4)
}

// Expande o ciclo até um horizonte (default 3000h) devolvendo cada marco e o
// kit distinto que ele usa — base da projeção "resumo por modelo".
export function expandirCiclo(horizonteHoras = 3000): { marco: number; kit: number }[] {
  return MARCOS.filter((m) => m <= horizonteHoras).map((m) => ({ marco: m, kit: kitDeHoras(m) }))
}

// -------------------------------------------------------------------------
// Alocação das horas pagas em 3 baldes e custo efetivo da hora de serviço.
// O déficit de deslocamento é rateado nas horas de serviço; a hora de trajeto
// já está contada em resultado_deslocamento — NÃO somá-la de novo por km.
// -------------------------------------------------------------------------
export function alocarHoras(p: RevisaoParametros) {
  const custoMensal = p.salario_base * p.fator_encargos
  const custoHoraPago = custoMensal / p.horas_uteis_mes
  const horasDeslocamento = p.horas_uteis_mes * p.pct_deslocamento
  const horasServico = p.horas_uteis_mes * p.pct_servico
  const horasOcio = p.horas_uteis_mes - horasDeslocamento - horasServico
  const kmMes = horasDeslocamento * p.velocidade_media_kmh
  const impostosServico = p.aliquota_iss + p.aliquota_pis_cofins

  const resultadoDeslocamento =
    kmMes * p.tarifa_km * (1 - impostosServico) * p.fator_realizacao_km -
    kmMes * (p.custo_combustivel_km + p.custo_manutencao_km) -
    horasDeslocamento * custoHoraPago

  const custoHoraServicoEfetivo =
    (custoHoraPago * (horasServico + horasOcio) + Math.max(0, -resultadoDeslocamento)) /
    horasServico

  return {
    custoMensal,
    custoHoraPago,
    horasServico,
    horasDeslocamento,
    horasOcio,
    kmMes,
    resultadoDeslocamento,
    custoHoraServicoEfetivo,
  }
}

// Margem por km rodado (análise marginal — coluna separada, NÃO somar à célula).
export function margemPorKm(p: RevisaoParametros, custoHoraPago: number): number {
  const impostosServico = p.aliquota_iss + p.aliquota_pis_cofins
  return (
    p.tarifa_km * (1 - impostosServico) * p.fator_realizacao_km -
    (p.custo_combustivel_km + p.custo_manutencao_km) -
    custoHoraPago / p.velocidade_media_kmh
  )
}

export interface MargemCelula {
  pecas_venda: number
  pecas_custo: number
  margem_pecas: number
  receita_hora: number
  receita_mo_liquida: number
  comissao: number
  custo_mo: number
  margem_mo: number
  margem_nominal: number
  margem_realizada: number
  margem_por_km: number
  km_max: number | null // null = ilimitado (o km se paga sozinho)
  cobertura: number // 0..1
  itens_faltantes: string[]
  custo_hora_servico_efetivo: number
}

// -------------------------------------------------------------------------
// Fórmula da célula (§3). Peças + mão de obra; deslocamento entra só como
// análise marginal (km_max). Item sem preço/custo NÃO vira zero — conta como
// faltante e derruba a cobertura (mas o valor que existe ainda soma).
//
// NOTA v1: não há imposto sobre a VENDA de peças no schema (a planilha original
// usa Venda-Custo cheio); margem_pecas = pecas_venda - pecas_custo.
// -------------------------------------------------------------------------
export function calcularMargemCelula(input: {
  itens: ItemResolvido[]
  horasPadrao: number
  pagador: Pagador
  pctComissao: number
  parametros: RevisaoParametros
}): MargemCelula {
  const { itens, horasPadrao, pagador, pctComissao, parametros: p } = input
  const alloc = alocarHoras(p)
  const impostosServico = p.aliquota_iss + p.aliquota_pis_cofins

  // Peças
  let pecasVenda = 0
  let pecasCusto = 0
  let itensComPreco = 0
  const faltantes: string[] = []
  for (const it of itens) {
    const completo = it.preco > 0 && it.cmc > 0
    if (completo) itensComPreco++
    else faltantes.push(it.codigo)
    pecasVenda += it.quantidade * (it.preco || 0)
    const custoUnit = p.cmc_liquido_de_impostos ? it.cmc : it.cmc * (1 - p.pct_credito_cmc)
    pecasCusto += it.quantidade * (custoUnit || 0)
  }
  const margemPecas = pecasVenda - pecasCusto
  const cobertura = itens.length > 0 ? itensComPreco / itens.length : 0

  // Mão de obra
  const receitaHora =
    pagador === 'cliente' ? p.valor_hora_cliente : pagador === 'fabrica' ? p.valor_hora_garantia : 0
  const receitaMoLiquida = horasPadrao * receitaHora * (1 - impostosServico)
  // Base da comissão na cortesia = hora de GARANTIA (§2.4 + fixture §6.3);
  // o pseudocódigo do §3 diverge (diz valor_hora_cliente) — o fixture manda.
  const baseComissao = pagador === 'cortesia_loja' ? p.valor_hora_garantia : receitaHora
  const comissao = horasPadrao * baseComissao * pctComissao
  const custoMo = horasPadrao * alloc.custoHoraServicoEfetivo
  const margemMo = receitaMoLiquida - comissao - custoMo

  const margemNominal = margemPecas + margemMo
  const margemRealizada = margemPecas + margemMo * p.fator_realizacao_horas

  // Análise marginal de distância
  const mpk = margemPorKm(p, alloc.custoHoraPago)
  const kmMax = mpk >= 0 ? null : margemNominal / Math.abs(mpk)

  return {
    pecas_venda: pecasVenda,
    pecas_custo: pecasCusto,
    margem_pecas: margemPecas,
    receita_hora: receitaHora,
    receita_mo_liquida: receitaMoLiquida,
    comissao,
    custo_mo: custoMo,
    margem_mo: margemMo,
    margem_nominal: margemNominal,
    margem_realizada: margemRealizada,
    margem_por_km: mpk,
    km_max: kmMax,
    cobertura,
    itens_faltantes: faltantes,
    custo_hora_servico_efetivo: alloc.custoHoraServicoEfetivo,
  }
}

// -------------------------------------------------------------------------
// Resolução de qual kit usar para um modelo (§2.2). Fallback nunca silencioso.
// `modelosComKit` = conjunto de modelos que têm kit próprio na tabela revisoes.
// -------------------------------------------------------------------------
export function resolverModeloKit(
  modelo: string,
  modelosComKit: Set<string>
): { modelo: string; origem: OrigemKit } {
  const norm = (modelo || '').trim()
  if (modelosComKit.has(norm)) return { modelo: norm, origem: 'proprio' }
  const fb = FALLBACK_MODELO[norm]
  if (fb && modelosComKit.has(fb)) return { modelo: fb, origem: 'fallback_modelo' }
  return { modelo: MODELO_GENERICO, origem: 'fallback_generico' }
}
