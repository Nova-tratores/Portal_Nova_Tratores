// =====================================================================
// Acesso a dados da MARGEM DE REVISÕES (server-side). Lê parâmetros, kits
// (tabela revisoes), horas-padrão e resolve CMC + preço de venda de
// Produtos_Completos EM LOTE. Monta a matriz e o detalhe da célula.
// A matemática vive em margem.ts (pura); aqui só I/O.
// =====================================================================
import { supabaseFetch, getValorInsensivel } from '@/lib/ppv/supabase'
import { TBL_REVISOES, TBL_PRODUTOS } from '@/lib/ppv/constants'
import {
  type RevisaoParametros,
  type Pagador,
  type OrigemKit,
  type ItemResolvido,
  KITS_DISTINTOS,
  DEFAULT_HORAS_PADRAO,
  calcularMargemCelula,
  resolverModeloKit,
  kitDeHoras,
} from './margem'

export const TBL_PARAMS = 'revisao_parametros'
export const TBL_HORAS = 'revisao_horas_padrao'
export const TBL_SNAP = 'revisao_margem_snapshot'

function num(v: unknown, d = 0): number {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : d
}

function parseHoras(s: string): number {
  const m = String(s || '').replace(/\./g, '').match(/\d+/)
  return m ? parseInt(m[0], 10) : 0
}

function parseProdutos(row: Record<string, unknown>): { codigo: string; quantidade: number }[] {
  const out: { codigo: string; quantidade: number }[] = []
  for (let i = 1; i <= 15; i++) {
    const cod = String(getValorInsensivel(row, `Cod_Prod_${i}`) || '').trim()
    const qtd = parseFloat(String(getValorInsensivel(row, `Qtd${i}`) || 0)) || 0
    if (cod && cod.toUpperCase() !== 'NULL' && cod.length > 1) out.push({ codigo: cod, quantidade: qtd || 1 })
  }
  return out
}

// ---------------------------------------------------------------------------
// Parâmetros vigentes (vigencia_fim IS NULL). Lança se a migration não rodou.
// ---------------------------------------------------------------------------
export async function getParametrosVigentes(): Promise<{ id: number; parametros: RevisaoParametros }> {
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PARAMS}?vigencia_fim=is.null&order=id.desc&limit=1`
  )
  if (!rows || rows.length === 0) {
    throw new Error('Nenhuma vigência de parâmetros ativa — rode sql/create-revisoes-margem.sql')
  }
  const r = rows[0]
  const parametros: RevisaoParametros = {
    valor_hora_cliente: num(r.valor_hora_cliente, 200),
    valor_hora_garantia: num(r.valor_hora_garantia, 130),
    tarifa_km: num(r.tarifa_km, 2.8),
    salario_base: num(r.salario_base, 2500),
    fator_encargos: num(r.fator_encargos, 1.672208),
    horas_uteis_mes: num(r.horas_uteis_mes, 176),
    pct_servico: num(r.pct_servico, 30 / 176),
    pct_deslocamento: num(r.pct_deslocamento, 70 / 176),
    velocidade_media_kmh: num(r.velocidade_media_kmh, 45),
    custo_combustivel_km: num(r.custo_combustivel_km, 1.12),
    custo_manutencao_km: num(r.custo_manutencao_km, 0.55),
    aliquota_iss: num(r.aliquota_iss, 0.03),
    aliquota_pis_cofins: num(r.aliquota_pis_cofins, 0.0925),
    cmc_liquido_de_impostos: r.cmc_liquido_de_impostos === true,
    pct_credito_cmc: num(r.pct_credito_cmc, 0),
    comissao_min: num(r.comissao_min, 0.15),
    comissao_max: num(r.comissao_max, 0.3),
    comissao_media: num(r.comissao_media, 0.2),
    fator_realizacao_km: num(r.fator_realizacao_km, 0.85),
    fator_realizacao_horas: num(r.fator_realizacao_horas, 0.85),
  }
  return { id: Number(r.id), parametros }
}

// ---------------------------------------------------------------------------
// Horas-padrão por (cod_trator, horas_kit). Chave em MAIÚSCULO.
// ---------------------------------------------------------------------------
export async function getHorasPadrao(): Promise<Map<string, { horas: number; pagador: Pagador }>> {
  const rows = await supabaseFetch<Record<string, unknown>[]>(`${TBL_HORAS}?select=*`)
  const map = new Map<string, { horas: number; pagador: Pagador }>()
  for (const r of rows || []) {
    const cod = String(r.cod_trator || '').toUpperCase().trim()
    const hk = parseInt(String(r.horas_kit), 10)
    if (!cod || !hk) continue
    map.set(`${cod}|${hk}`, {
      horas: num(r.horas_padrao, DEFAULT_HORAS_PADRAO),
      pagador: ((r.pagador_padrao as Pagador) || 'cliente'),
    })
  }
  return map
}

export interface KitRow {
  trator: string
  codTrator: string
  horas: number
  produtos: { codigo: string; quantidade: number }[]
}

// Kits do tipo 'revisao' da tabela revisoes, com horas já em número.
export async function getKitsRevisao(): Promise<KitRow[]> {
  const rows = await supabaseFetch<Record<string, unknown>[]>(`${TBL_REVISOES}?select=*`)
  const kits: KitRow[] = []
  for (const r of rows || []) {
    const tipo = String(getValorInsensivel(r, 'tipo') || 'revisao')
    if (tipo !== 'revisao') continue
    const horas = parseHoras(String(getValorInsensivel(r, 'Horas', 'Horimetro') || ''))
    if (!horas) continue
    kits.push({
      trator: String(getValorInsensivel(r, 'Trator', 'Modelo') || '').trim(),
      codTrator: String(getValorInsensivel(r, 'Cod_Trator') || '').trim(),
      horas,
      produtos: parseProdutos(r),
    })
  }
  return kits
}

// Resolve descrição + preço de venda + CMC de Produtos_Completos EM LOTE.
// Prefere a linha da empresa NOVA quando um código existe em ambas (v1 = NOVA).
export async function resolverProdutos(
  codigos: string[]
): Promise<Map<string, { descricao: string; preco: number; cmc: number }>> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))]
  const map = new Map<string, { descricao: string; preco: number; cmc: number }>()
  for (let i = 0; i < unicos.length; i += 100) {
    const chunk = unicos.slice(i, i + 100)
    const inList = chunk.map((c) => `"${c.replace(/"/g, '')}"`).join(',')
    const rows = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS}?Codigo_Produto=in.(${encodeURIComponent(inList)})&select=Codigo_Produto,Descricao_Produto,Preco_Venda,CMC,Empresa`
    )
    for (const r of rows || []) {
      const cod = String(getValorInsensivel(r, 'Codigo_Produto', 'codigo') || '').trim()
      if (!cod) continue
      const isNova = /nova/i.test(String(getValorInsensivel(r, 'Empresa') || ''))
      if (map.has(cod) && !isNova) continue // NOVA vence o desempate
      map.set(cod, {
        descricao: String(getValorInsensivel(r, 'Descricao_Produto', 'descricao') || `Item ${cod}`),
        preco: num(getValorInsensivel(r, 'Preco_Venda', 'preco')),
        cmc: num(getValorInsensivel(r, 'CMC', 'cmc')),
      })
    }
  }
  return map
}

function itensDoKit(
  kit: KitRow,
  prodMap: Map<string, { descricao: string; preco: number; cmc: number }>
): ItemResolvido[] {
  return kit.produtos.map((p) => {
    const d = prodMap.get(p.codigo)
    return {
      codigo: p.codigo,
      descricao: d?.descricao,
      quantidade: p.quantidade,
      cmc: d?.cmc ?? 0,
      preco: d?.preco ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Matriz completa: uma linha por modelo, 5 células (os kits distintos).
// origem_kit = 'proprio' (a matriz nasce dos kits existentes; o fallback vale
// no detalhe/projeção de um modelo sem kit próprio).
// ---------------------------------------------------------------------------
export async function montarMatriz(opts: {
  pagador?: Pagador
  pctComissao?: number
  modelo?: string
}) {
  const [{ id: parametrosId, parametros }, horasMap, kits] = await Promise.all([
    getParametrosVigentes(),
    getHorasPadrao(),
    getKitsRevisao(),
  ])
  const pctComissao = opts.pctComissao ?? parametros.comissao_media
  const prodMap = await resolverProdutos(kits.flatMap((k) => k.produtos.map((p) => p.codigo)))

  const filtro = opts.modelo?.toUpperCase().trim()
  const porModelo = new Map<string, { trator: string; codTrator: string; kits: Map<number, KitRow> }>()
  for (const k of kits) {
    const chave = (k.codTrator || k.trator).toUpperCase()
    if (filtro && chave !== filtro && k.trator.toUpperCase() !== filtro) continue
    if (!porModelo.has(chave)) porModelo.set(chave, { trator: k.trator, codTrator: k.codTrator, kits: new Map() })
    porModelo.get(chave)!.kits.set(k.horas, k)
  }

  const linhas = [...porModelo.entries()].map(([, m]) => {
    const chaveHoras = (m.codTrator || m.trator).toUpperCase()
    const celulas = KITS_DISTINTOS.map((hk) => {
      const kit = m.kits.get(hk)
      if (!kit) return { horas_kit: hk, sem_kit: true as const }
      const hp = horasMap.get(`${chaveHoras}|${hk}`)
      const horasPadrao = hp?.horas ?? DEFAULT_HORAS_PADRAO
      const pagador = opts.pagador ?? hp?.pagador ?? 'cliente'
      const margem = calcularMargemCelula({
        itens: itensDoKit(kit, prodMap),
        horasPadrao,
        pagador,
        pctComissao,
        parametros,
      })
      return {
        horas_kit: hk,
        sem_kit: false as const,
        pagador,
        horas_padrao: horasPadrao,
        origem_kit: 'proprio' as OrigemKit,
        n_itens: kit.produtos.length,
        n_faltantes: margem.itens_faltantes.length,
        ...margem,
      }
    })
    return { cod_trator: m.codTrator, trator: m.trator, celulas }
  })

  return { parametros_id: parametrosId, parametros, pct_comissao: pctComissao, linhas }
}

// ---------------------------------------------------------------------------
// Detalhe de uma célula (item a item), com fallback de modelo marcado.
// ---------------------------------------------------------------------------
export async function detalheCelula(
  codTratorOuModelo: string,
  horas: number,
  opts: { pagador?: Pagador; pctComissao?: number }
) {
  const hk = kitDeHoras(horas)
  const [{ id: parametrosId, parametros }, horasMap, kits] = await Promise.all([
    getParametrosVigentes(),
    getHorasPadrao(),
    getKitsRevisao(),
  ])

  const modelosComKit = new Set<string>()
  const byKey = new Map<string, KitRow>()
  for (const k of kits) {
    if (k.horas !== hk) continue
    for (const chave of [k.codTrator, k.trator].filter(Boolean)) {
      const up = chave.toUpperCase()
      modelosComKit.add(up)
      if (!byKey.has(up)) byKey.set(up, k)
    }
  }

  const req = (codTratorOuModelo || '').toUpperCase().trim()
  let origem: OrigemKit = 'proprio'
  let kit = byKey.get(req)
  if (!kit) {
    const r = resolverModeloKit(codTratorOuModelo, modelosComKit)
    origem = r.origem
    kit = byKey.get(r.modelo.toUpperCase())
  }
  if (!kit) return null

  const prodMap = await resolverProdutos(kit.produtos.map((p) => p.codigo))
  const itens = itensDoKit(kit, prodMap)
  const hp = horasMap.get(`${(kit.codTrator || kit.trator).toUpperCase()}|${hk}`)
  const horasPadrao = hp?.horas ?? DEFAULT_HORAS_PADRAO
  const pagador = opts.pagador ?? hp?.pagador ?? 'cliente'
  const pctComissao = opts.pctComissao ?? parametros.comissao_media
  const margem = calcularMargemCelula({ itens, horasPadrao, pagador, pctComissao, parametros })

  return {
    cod_trator: kit.codTrator,
    trator: kit.trator,
    marco: horas,
    horas_kit: hk,
    origem_kit: origem,
    horas_padrao: horasPadrao,
    pagador,
    pct_comissao: pctComissao,
    parametros_id: parametrosId,
    itens: itens.map((it) => ({
      ...it,
      subtotal_venda: it.quantidade * it.preco,
      subtotal_custo: it.quantidade * it.cmc,
      faltante: !(it.preco > 0 && it.cmc > 0),
    })),
    margem,
  }
}
