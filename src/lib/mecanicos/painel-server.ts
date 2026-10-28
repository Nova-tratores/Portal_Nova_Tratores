// Painel do pós-vendas (José, 16/10/2026) — leitura no banco. Regras em ./painel.ts.
//
// Fontes:
//  - Horas trabalhadas: Ordem_Servico_Tecnicos (app do técnico) — colunas explícitas
//    (select=* estoura o tempo: fotos e assinaturas na linha).
//  - OS faturadas no período: Ordem_Servico.faturado_omie_em (faturar pelo portal / carimbo
//    da conferência) OU a data da nota no espelho do Omie (os_servicos_itens, conta NOVA).
//    OS que só existe no Omie entra com as linhas de hora/km de lá e "Sem técnico".
//  - VALOR = o que foi FATURADO no Omie (linhas de hora/km/outros da OS no espelho) e MÊS = mês do
//    faturamento no espelho — a mesma régua do Dashboard de Vendas (José, 16/10/2026). O cálculo do
//    portal (horas × valor da hora…) só vale para OS faturada pelo portal que ainda não está no espelho.
//  - Peças: o pedido de venda das PPVs da OS como FATURADO (vendas_itens); sem nota ainda, o PPV. Custo de terceiros: requisições Trator-Cliente da OS não cobradas do cliente.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_OS } from '@/lib/pos/constants'
import { getConfigPOS } from '@/lib/pos/config'
import { pecasPorPPVComDesconto } from '@/lib/pos/pecas-ppv'
import { diasDoRelatorio, normalizarTecnico, dataIso, type RelatorioTecnico } from '@/lib/pos/horas-tecnico'
import { parseValorMisto } from '@/lib/marketing/custos'
import { carregarDiretorio } from '@/lib/agenda/server'
import { normTexto } from '@/lib/agenda/regras'
import { SEM_TECNICO, motivoInterna, ehCustoTerceiro, type DiaRegistrado, type InternaFechada, type OSFaturada, type ReqCusto } from './painel'
import { CODIGOS_INTERNOS, CONTA_INTERNO } from '@/lib/pos/omie-espelho'
import { casarNome } from './ocorrencias-painel'

const CODIGOS = CODIGOS_INTERNOS.map((c) => c.codigo)
const normC = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/s+/g, ' ')
/** "ENTREGA TÉCNICA" / "Entrega técnica" → "Entrega Tecnica" (nome da lista de contratos do Omie). */
const contratoOficial = (c: unknown) => CODIGOS.find((x) => normC(x) === normC(c)) || String(c ?? '').trim()

const semZeros = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')
const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

type Rec = Record<string, unknown>

// colunas de desconto do Omie (sql/descontos-omie.sql) — sem elas lê como antes
let semDescOmie = false, semDescVendas = false

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 50000; de += 1000) {
    const { data, error } = await montar(de, de + 999)
    if (error) throw new Error(error.message)
    const l = (data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

/** Nome de exibição do técnico: o do cadastro do portal quando o nome casa (inclusive o "nome de técnico"). */
export async function padronizador() {
  const dir = await carregarDiretorio()
  const porId = new Map(dir.pessoas.map((p) => [p.id, p.nome]))
  const tecnicos = dir.pessoas.filter((p) => p.tecnico).map((p) => p.nome)
  const padronizar = (nome: unknown): string => {
    const s = String(nome ?? '').trim()
    if (!s) return ''
    const id = dir.porNome.get(normTexto(s))
    return (id && porId.get(id)) || normalizarTecnico(s)
  }
  return { tecnicos, padronizar, pessoas: dir.pessoas.map((p) => p.nome) }
}

const COLS_OS = 'Id_Ordem, Ordem_Omie, Os_Cliente, Os_Tecnico, Os_Tecnico2, Servico_Interno, Status, Qtd_HR, Valor_HR, Qtd_KM, Valor_KM, Desconto_Hora, Desconto_KM, Desconto, Valor_Total, ID_PPV, faturado_omie_em, esp_info:Omie_Espelho->info, esp_motivo:Omie_Espelho->descontoMotivo'
const COLS_REL = 'IdOs, Ordem_Servico, TecResp1, TecResp2, DataInicio, InicioHora, FinalHora, DataInicio2, InicioHora2, FinalHora2, DataInicio3, InicioHora3, FinaHora3, TotalHora'

export interface BasePainel {
  tecnicos: string[]
  dias: DiaRegistrado[]
  faturadas: OSFaturada[]
  /** horas registradas de TODAS as datas por OS (para repartir horas cobradas) */
  diasTodos: DiaRegistrado[]
  /** OS internas que aparecem nos relatórios: cliente e por que é interna */
  osInternas: Record<string, { cliente: string; motivo: string }>
  /** OS internas FECHADAS no período (faturadas no Omie com contrato interno, cortesia…) */
  internasFechadas: InternaFechada[]
}

/** Tudo que o painel precisa entre `de` e `ate` (YYYY-MM-DD). */
export async function carregarBase(de: string, ate: string): Promise<BasePainel> {
  const { tecnicos, padronizar } = await padronizador()
  const cfg = await getConfigPOS().catch(() => null) as { valor_hora?: number; valor_km?: number } | null
  const vhPadrao = num(cfg?.valor_hora) || 193, vkPadrao = num(cfg?.valor_km) || 3.6

  // 1) linhas faturadas do Omie (NOVA) nos meses do período → data do faturamento por nº da OS
  const meses: { mes: number; ano: number }[] = []
  for (let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7)); a * 100 + m <= Number(ate.slice(0, 4)) * 100 + Number(ate.slice(5, 7)); m === 12 ? (a++, m = 1) : m++) meses.push({ mes: m, ano: a })
  const itens: Rec[] = []
  for (const { mes, ano } of meses) {
    // valor_desconto (sql/descontos-omie.sql); sem a coluna, lê sem ela
    const cols = 'numero_os, data, mes, ano, tipo, qtde, valor_total, descricao, contrato'
    try { itens.push(...await paginar((x, y) => sb.from('os_servicos_itens').select(semDescOmie ? cols : cols + ', valor_desconto').eq('conta_omie', 'NOVA').eq('mes', mes).eq('ano', ano).range(x, y))) }
    catch (e) { if (semDescOmie || !/valor_desconto/.test((e as Error).message)) throw e; semDescOmie = true; itens.push(...await paginar((x, y) => sb.from('os_servicos_itens').select(cols).eq('conta_omie', 'NOVA').eq('mes', mes).eq('ano', ano).range(x, y))) }
  }
  const omiePorNum = new Map<string, { data: string; horas: number; km: number; vh: number; vk: number; outros: number; contrato: string; texto: string; dh: number; dk: number; dg: number }>()
  for (const i of itens) {
    const d = dataFaturamento(dataIso(i.data), Number(i.mes), Number(i.ano))
    if (!d || d < de || d > ate) continue
    const n = semZeros(i.numero_os)
    const o = omiePorNum.get(n) || { data: d, horas: 0, km: 0, vh: 0, vk: 0, outros: 0, contrato: '', texto: '', dh: 0, dk: 0, dg: 0 }
    if (i.contrato) o.contrato = String(i.contrato)
    if (i.descricao) o.texto += ` ${i.descricao}`
    if (i.tipo === 'HR') { o.horas += num(i.qtde); o.vh += num(i.valor_total); o.dh += num(i.valor_desconto) }
    else if (i.tipo === 'KM') { o.km += num(i.qtde); o.vk += num(i.valor_total); o.dk += num(i.valor_desconto) }
    else { o.outros += num(i.valor_total); o.dg += num(i.valor_desconto) }
    omiePorNum.set(n, o)
  }

  // 2) OS do portal: faturadas pelo portal no período + as que casam com o Omie
  const deIso = `${de}T00:00:00-03:00`, ateIso = `${ate}T23:59:59-03:00`
  const osMap = new Map<string, Rec>()
  for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).gte('faturado_omie_em', deIso).lte('faturado_omie_em', ateIso).range(x, y))) osMap.set(String(o.Id_Ordem), o)
  const nums = [...omiePorNum.keys()]
  for (let i = 0; i < nums.length; i += 200) {
    const pad = nums.slice(i, i + 200).flatMap((n) => [n.padStart(15, '0'), n])
    for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).in('Ordem_Omie', pad).range(x, y))) osMap.set(String(o.Id_Ordem), o)
  }

  // 3) relatórios do app: do período (horas) + das OS faturadas (pesos das horas cobradas)
  const relPeriodo = await paginar((x, y) => sb.from('Ordem_Servico_Tecnicos').select(COLS_REL).gte('DataInicio', somar(de, -20)).lte('DataInicio', ate).range(x, y))
  const idsFat = [...osMap.keys()]
  const relFat: Rec[] = []
  for (let i = 0; i < idsFat.length; i += 200) relFat.push(...await paginar((x, y) => sb.from('Ordem_Servico_Tecnicos').select(COLS_REL).in('Ordem_Servico', idsFat.slice(i, i + 200)).range(x, y)))
  const relatorios = new Map<string, Rec>()
  for (const r of [...relPeriodo, ...relFat]) relatorios.set(String(r.IdOs), r)
  // OS dos relatórios que ainda não vieram (para saber se é interna)
  const faltam = [...new Set([...relatorios.values()].map((r) => String(r.Ordem_Servico || '')).filter((id) => id && !osMap.has(id)))]
  for (let i = 0; i < faltam.length; i += 200) for (const o of await paginar((x, y) => sb.from(TBL_OS).select(COLS_OS).in('Id_Ordem', faltam.slice(i, i + 200)).range(x, y))) osMap.set(String(o.Id_Ordem), o)

  // OS interna: tipo de serviço interno (portal), conta corrente interna ou contrato interno (Omie)
  const internaDe = (o: Rec | undefined) => {
    if (!o) return null
    const info = (o.esp_info && typeof o.esp_info === 'object' ? o.esp_info : {}) as Rec
    return motivoInterna({ servicoInterno: o.Servico_Interno, conta: info.conta, contratos: [info.contrato, omiePorNum.get(semZeros(o.Ordem_Omie))?.contrato] }, CONTA_INTERNO, CODIGOS)
  }
  const osInternas: BasePainel['osInternas'] = {}
  for (const o of osMap.values()) { const m = internaDe(o); if (m) osInternas[String(o.Id_Ordem)] = { cliente: String(o.Os_Cliente || ''), motivo: m } }

  const diasTodos: DiaRegistrado[] = []
  for (const r of relatorios.values()) {
    const os = osMap.get(String(r.Ordem_Servico || ''))
    const interna = !!internaDe(os)
    const base = diasDoRelatorio(r as unknown as RelatorioTecnico)
    for (const t of [r.TecResp1, r.TecResp2]) {
      const tec = padronizar(t)
      if (!tec) continue
      for (const d of base) diasTodos.push({ os: d.os, data: d.data, tecnico: tec, horas: d.horas, interna })
    }
  }

  // 4) peças e custo de terceiros das OS faturadas
  const osFat = [...osMap.values()].filter((o) => {
    if (internaDe(o) || /cancel/i.test(String(o.Status || ''))) return false
    const n = semZeros(o.Ordem_Omie)
    const d = omiePorNum.get(n)?.data || (o.faturado_omie_em ? diaSP(String(o.faturado_omie_em)) : undefined)
    return !!d && d >= de && d <= ate
  })
  const ppvs = osFat.flatMap((o) => String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean))
  const [pecasDet, { valor: pecasFat, desconto: pecasFatDesc }] = await Promise.all([pecasPorPPVComDesconto(ppvs), pecasFaturadasPorPPV(ppvs)])
  const pecas = new Map([...pecasDet].map(([k, v]) => [k, v.total]))
  // CUSTO DE TERCEIROS (regra do José, 16/10/2026): requisição que o técnico pediu como
  // "Trator-Cliente" na OS e que NÃO foi cobrada do cliente (valor_cobrado_cliente vazio/0).
  // Alimentação e abastecimento ficam de fora — são gastos do pós-vendas (gastos-server.ts).
  const custos = new Map<string, Record<string, number>>()
  const reqsPorOS = new Map<string, ReqCusto[]>()
  const ids = osFat.map((o) => String(o.Id_Ordem))
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Requisicao').select('id, ordem_servico, valor_despeza, valor_cobrado_cliente, tipo, setor, status, titulo, fornecedor, data, solicitante, foto_nf')
      .in('ordem_servico', ids.slice(i, i + 200))
    for (const r of (data || []) as Rec[]) {
      if (!ehCustoTerceiro(r)) continue
      const v = parseValorMisto(r.valor_despeza)
      if (!v) continue
      const os = String(r.ordem_servico)
      const m = custos.get(os) || {}
      const tipo = String(r.tipo || 'Outros')
      m[tipo] = (m[tipo] || 0) + v
      custos.set(os, m)
      reqsPorOS.set(os, [...(reqsPorOS.get(os) || []), {
        id: Number(r.id), tipo, valor: v, status: String(r.status || ''), titulo: String(r.titulo || ''), fornecedor: String(r.fornecedor || ''),
        data: String(r.data || '').slice(0, 10), solicitante: padronizar(r.solicitante), nota: r.foto_nf ? String(r.foto_nf) : null,
      }])
    }
  }

  const faturadas: OSFaturada[] = []
  // toda OS do portal (inclusive interna e cancelada) — o que sobra no Omie é só de lá
  const numsDoPortal = new Set([...osMap.values()].map((o) => semZeros(o.Ordem_Omie)).filter(Boolean))
  for (const o of osFat) {
    const n = semZeros(o.Ordem_Omie)
    const om = omiePorNum.get(n)
    const ppvsDaOS = String(o.ID_PPV || '').split(',').map((s) => s.trim()).filter(Boolean)
    // peças: o pedido faturado (nota de peças); sem nota ainda, o valor do PPV
    // o nº do pedido se repete entre anos (PPV-0383 × venda de máquina de 2024): faturado muito acima do PPV não é dele
    const vPecas = ppvsDaOS.reduce((s, p) => { const v = pecas.get(p) || 0, f = pecasFat.get(p); return s + (f != null && f <= v * 3 + 500 ? f : v) }, 0)
    let servico: number, kmValor: number, outros: number, horasCobradas: number, km: number
    if (om) {
      // o que foi faturado no Omie
      servico = om.vh; kmValor = om.vk; outros = om.outros; horasCobradas = om.horas; km = om.km
    } else {
      // faturada pelo portal e ainda fora do espelho: cálculo do portal
      const vh = num(o.Valor_HR) || vhPadrao, vk = num(o.Valor_KM) || vkPadrao
      servico = Math.max(0, num(o.Qtd_HR) * vh - num(o.Desconto_Hora))
      kmValor = Math.max(0, num(o.Qtd_KM) * vk - num(o.Desconto_KM))
      // o que o Valor_Total tiver a mais (requisições cobradas, extras) entra em "outros"
      outros = Math.max(0, num(o.Valor_Total) - servico - kmValor - vPecas)
      horasCobradas = num(o.Qtd_HR); km = num(o.Qtd_KM)
    }
    // faturado da oficina = mão de obra + deslocamento + outros; as PEÇAS ficam à parte (José, 28/10/2026: "pode tirar
    // as peças") — continuam em `pecas` e no PDF da OS
    const bruto = servico + kmValor + outros
    const cp = custos.get(String(o.Id_Ordem)) || {}
    const r2 = (v: number) => Math.round(v * 100) / 100
    // descontos (José, 21/10/2026: "precisa pegar todos"): o que o Omie faturou manda (desconto de cada item da OS
    // e do pedido de peças); o lançado no portal vale quando o Omie não tem (ou ainda não faturou)
    const dPecasPortal = ppvsDaOS.reduce((a, p) => a + (pecasDet.get(p)?.desconto || 0), 0)
    const dPecasOmie = ppvsDaOS.reduce((a, p) => a + (pecasFatDesc.get(p) || 0), 0)
    const descontos = {
      hora: r2(Math.max(num(o.Desconto_Hora), om?.dh || 0)), km: r2(Math.max(num(o.Desconto_KM), om?.dk || 0)),
      geral: r2(Math.max(num(o.Desconto), om?.dg || 0)), pecas: r2(Math.max(dPecasPortal, dPecasOmie)),
    }
    faturadas.push({
      os: String(o.Id_Ordem), numeroOmie: n || null, cliente: String(o.Os_Cliente || ''),
      data: diaDoFechamento(om?.data, o.faturado_omie_em) as string,
      em: o.faturado_omie_em ? String(o.faturado_omie_em) : null,
      tecnicos: [...new Set([o.Os_Tecnico, o.Os_Tecnico2].map(padronizar).filter(Boolean))],
      horasCobradas, km, servico, kmValor, pecas: vPecas,
      outros, bruto,
      custo: Object.values(cp).reduce((s, v) => s + v, 0), custoPorTipo: cp, descontos,
      descontoMotivo: String((o.esp_motivo as { texto?: string } | null)?.texto || "").trim() || null,
      requisicoes: reqsPorOS.get(String(o.Id_Ordem)) || [],
    })
  }
  // OS que só existe no Omie (sem OS no portal): técnico e cliente vêm da Pasta Clientes
  // ("Técnicos: José Antonio de Oliveira // Gabriel Moraes") — sem isso a OS ficava sem técnico e a
  // comissão/faturamento dela iam para "Sem técnico" (achado na ficha do técnico, 19/10/2026)
  // Os técnicos do OMIE de toda OS também vão em `tecnicosOmie`: a comissão sai por eles (o painel do
  // Omie usa o "vendedor" da OS) e às vezes diferem do portal (OS 5293: Gabriel no portal, Danilo no Omie).
  const numsPasta = [...new Set([...omiePorNum.keys(), ...faturadas.map((o) => o.numeroOmie || '')].filter(Boolean))]
  const daPasta = new Map<string, { cliente: string; tecnicos: string[] }>()
  for (let i = 0; i < numsPasta.length; i += 200) {
    const { data } = await sb.from('portal_nt_clientes_os').select('num_os, cliente_nome, vendedor').eq('empresa', 'Nova Tratores').in('num_os', numsPasta.slice(i, i + 200))
    for (const r of (data || []) as Rec[]) daPasta.set(semZeros(r.num_os), { cliente: String(r.cliente_nome || ''), tecnicos: tecnicosDoTexto(r.vendedor, padronizar, tecnicos) })
  }
  for (const f of faturadas) { const t = f.numeroOmie ? daPasta.get(f.numeroOmie)?.tecnicos : undefined; if (t?.length) f.tecnicosOmie = t }
  for (const [n, o] of omiePorNum) {
    if (numsDoPortal.has(n)) continue
    // toda OS faturada que não seja contrato interno ("-pgo" = montadora paga, entra) — inclusive serviço
    // lançado só como texto (sem linha de hora/km) e comissão de venda direta: é a régua do Dashboard de Vendas
    if (!(o.horas > 0 || o.km > 0 || o.outros > 0)) continue
    if (motivoInterna({ contratos: [o.contrato] }, CONTA_INTERNO, CODIGOS)) continue
    // comissão de venda de equipamento (ex.: GTM, venda direta) não é serviço do pós-vendas (José, 17/10/2026)
    if (!(o.horas > 0 || o.km > 0) && /comiss[aã]o/i.test(o.texto)) continue
    faturadas.push({
      os: `OMIE ${n}`, numeroOmie: n, cliente: daPasta.get(n)?.cliente || '', data: o.data, em: null, tecnicos: daPasta.get(n)?.tecnicos || [],
      horasCobradas: o.horas, km: o.km, servico: o.vh, kmValor: o.vk, pecas: 0, outros: o.outros,
      bruto: o.vh + o.vk + o.outros, custo: 0, tecnicosOmie: daPasta.get(n)?.tecnicos,
      descontos: o.dh + o.dk + o.dg > 0 ? { hora: Math.round(o.dh * 100) / 100, km: Math.round(o.dk * 100) / 100, geral: Math.round(o.dg * 100) / 100, pecas: 0 } : undefined,
    })
  }

  // OS internas FECHADAS: as do portal marcadas internas (tipo de serviço, conta ou contrato) e as só do
  // Omie com contrato interno — no mês do faturamento no Omie (ou do carimbo do portal)
  const internasFechadas: InternaFechada[] = []
  for (const o of osMap.values()) {
    const motivo = internaDe(o)
    if (!motivo || /cancel/i.test(String(o.Status || ''))) continue
    const n = semZeros(o.Ordem_Omie)
    const om = omiePorNum.get(n)
    const data = diaDoFechamento(om?.data, o.faturado_omie_em)
    if (!data || data < de || data > ate) continue
    const info = (o.esp_info && typeof o.esp_info === 'object' ? o.esp_info : {}) as Rec
    internasFechadas.push({
      os: String(o.Id_Ordem), numeroOmie: n || null, cliente: String(o.Os_Cliente || ''),
      contrato: contratoOficial(om?.contrato || info.contrato) || (o.Servico_Interno ? 'Tipo de serviço interno' : motivo),
      motivo, data, valor: Math.round((om ? om.vh + om.vk + om.outros : num(o.Valor_Total)) * 100) / 100,
      horas: om ? om.horas : num(o.Qtd_HR), tecnicos: [...new Set([o.Os_Tecnico, o.Os_Tecnico2].map(padronizar).filter(Boolean))],
      valorHoras: Math.round((om ? om.vh : num(o.Qtd_HR) * (num(o.Valor_HR) || vhPadrao)) * 100) / 100,
      tecnicosOmie: n ? daPasta.get(n)?.tecnicos : undefined,
    })
  }
  for (const [n, o] of omiePorNum) {
    if (numsDoPortal.has(n)) continue
    if (!motivoInterna({ contratos: [o.contrato] }, CONTA_INTERNO, CODIGOS)) continue
    internasFechadas.push({ os: `OMIE ${n}`, numeroOmie: n, cliente: daPasta.get(n)?.cliente || '', contrato: contratoOficial(o.contrato), motivo: `contrato ${o.contrato}`, data: o.data, valor: Math.round((o.vh + o.vk + o.outros) * 100) / 100, horas: o.horas, tecnicos: daPasta.get(n)?.tecnicos || [], valorHoras: o.vh })
  }

  return { tecnicos, faturadas, diasTodos, dias: diasTodos.filter((d) => d.data >= de && d.data <= ate), osInternas, internasFechadas }
}

/** "Técnicos: José Antonio de Oliveira // Gabriel Moraes" (vendedor da OS no Omie) → nomes do portal. */
export function tecnicosDoTexto(texto: unknown, padronizar: (n: unknown) => string, cadastro: string[]): string[] {
  const corpo = String(texto ?? '').replace(/^[^:]*t[ée]cnicos?\s*:/i, '')
  const nomes = corpo.split(/\/\/|\/|&|\s+e\s+/i).map((x) => x.trim()).filter((x) => x.length > 2)
  return [...new Set(nomes.map((x) => { const p = padronizar(x); return cadastro.includes(p) ? p : casarNome(x, cadastro) || p }).filter(Boolean))]
}

/** Dia em que a OS fechou: o carimbo do portal (faturado_omie_em) quando cai no MESMO mês do espelho
 *  do Omie (a data do espelho costuma ser a da execução — OS-0826 executada 09/10 e fechada 15/10);
 *  senão o dia do espelho (mês do faturamento); sem espelho, o carimbo. */
function diaDoFechamento(diaOmie: string | undefined, carimbo: unknown): string | null {
  const c = carimbo ? diaSP(String(carimbo)) : null
  if (!diaOmie) return c
  return c && c.slice(0, 7) === diaOmie.slice(0, 7) ? c : diaOmie
}

/** Dia do faturamento: o espelho guarda o MÊS do faturamento (mes/ano) e uma data que pode ser de
 *  outro mês (abertura/execução). Data dentro do mês = ela; antes = dia 1; depois = último dia. */
export function dataFaturamento(data: string | null, mes: number, ano: number): string | null {
  if (!mes || !ano) return data
  const ref = `${ano}-${String(mes).padStart(2, '0')}`
  if (data && data.slice(0, 7) === ref) return data
  if (data && data > ref) return `${ref}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`
  return `${ref}-01`
}

/** PPV → valor FATURADO do pedido de venda (vendas_itens, conta NOVA). Só os que já têm nota. */
async function pecasFaturadasPorPPV(ppvs: string[]): Promise<{ valor: Map<string, number>; desconto: Map<string, number> }> {
  const out = new Map<string, number>(), desc = new Map<string, number>()
  const lista = [...new Set(ppvs)]
  const pedidoDe = new Map<string, string>()
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await sb.from('pedidos').select('id_pedido, pedido_omie').in('id_pedido', lista.slice(i, i + 200))
    for (const p of (data || []) as Rec[]) { const n = semZeros(p.pedido_omie); if (n) pedidoDe.set(String(p.id_pedido), n) }
  }
  const nums = [...new Set(pedidoDe.values())]
  const porPedido = new Map<string, number>(), descPedido = new Map<string, number>()
  for (let i = 0; i < nums.length; i += 200) {
    const fatia = nums.slice(i, i + 200)
    const ler = (cols: string) => paginar((x, y) => sb.from('vendas_itens').select(cols).eq('conta_omie', 'NOVA').eq('familia', 'Peças').in('numero_pedido', fatia).range(x, y))
    let l: Rec[]
    try { l = await ler(semDescVendas ? 'numero_pedido, valor_total' : 'numero_pedido, valor_total, valor_desconto') }
    catch (e) { if (semDescVendas || !/valor_desconto/.test((e as Error).message)) throw e; semDescVendas = true; l = await ler('numero_pedido, valor_total') }
    for (const it of l) { const n = semZeros(it.numero_pedido); porPedido.set(n, (porPedido.get(n) || 0) + num(it.valor_total)); descPedido.set(n, (descPedido.get(n) || 0) + num(it.valor_desconto)) }
  }
  for (const [ppv, n] of pedidoDe) if (porPedido.has(n)) { out.set(ppv, Math.round(porPedido.get(n)! * 100) / 100); desc.set(ppv, Math.round((descPedido.get(n) || 0) * 100) / 100) }
  return { valor: out, desconto: desc }
}

function somar(dia: string, n: number) { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export { SEM_TECNICO }
