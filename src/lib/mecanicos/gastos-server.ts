// Gastos e custo da equipe do pós-vendas (José, 16/10/2026) — leitura nas fontes.
// Regras trazidas do SistemaCompletoOmie (dashboard-vendedor) e confirmadas pelo José:
//  - O gasto do CARRO vai para o TÉCNICO que abasteceu/pediu; se quem lançou não é técnico, para o DONO do carro: vínculo placa → pessoa em frota_donos_relatorio
//    (o mesmo do sistema do Omie) e tecnico_veiculos (Janela Mecânicos). Sem dono, vai para quem
//    abasteceu (motorista do cartão) ou pediu (solicitante da requisição).
//  - Abastecimento: cartão-frota (planilha em abastecimentos + Rota Exata/Veloe para os dias que a
//    planilha ainda não trouxe) + requisições de abastecimento.
//  - Manutenção do carro: requisições "Veicular Manutenção" / "Frota-Veículos" com manutenção.
//  - Alimentação: requisições de Alimentação.
//  - Entra se a pessoa é técnico OU o gasto é da Oficina (departamento/setor). Comercial e
//    Trator-Loja ficam de fora; lixeira/cancelada não conta.
//  - Equipe: salário + encargos dos técnicos em config_vendedores_relatorio (o "custo fixo RH").
// O custo de terceiros das OS NÃO inclui nada disto (ehCustoTerceiro), então tudo desconta do resultado.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { parseValorMisto } from '@/lib/marketing/custos'
import type { Gasto, MembroEquipe } from './painel'
import { carregarEquipeRH, requisicoesDescontadas } from './rh-server'

/** Quem tem gasto da Oficina e não é técnico (Joaquim, Zezo…) vira este grupo. */
export const OFICINA_GERAL = 'Oficina (geral)'
// tipos de requisição que viram "materiais da oficina" (ferramenta, peça de uso, terceiros fora de OS)
const RE_MATERIAIS = /ferrament|insumo|pe[çc]a|almoxarif|servi[çc]o de terceiro/i
const RE_PAGAMENTO = /^(dinheiro|boleto|pix)$/i
const RE_TXT_ALIM = /aliment|refei[çc]|almo[çc]o|lanche|janta|marmit|restaurante/i
const RE_TXT_ABAST = /abastec|combust|gasolin|diesel|etanol|[aá]lcool|posto/i

type Rec = Record<string, unknown>
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
// nome vazio não vira pessoa (o padronizador devolveria "Sem nome")
const nomeDe = (padronizar: (n: unknown) => string, n: unknown) => (String(n ?? '').trim() ? padronizar(n) : '')
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const RE_PLACA = /([A-Z]{3})-?(\d)([A-Z0-9])(\d{2})/i
// "donos" que não são pessoas (carro do setor, caminhão…)
const NAO_PESSOA = /^(COMERCIAL|SEM MOTORISTA|DEPARTAMENTO|\d|CARGO)/i

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 100000; de += 1000) {
    const { data, error } = await montar(de, de + 999)
    if (error) throw new Error(error.message)
    const l = (data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

/** placa (limpa) → pessoa (nome padronizado). frota_donos_relatorio primeiro; tecnico_veiculos completa. */
async function donosDosCarros(padronizar: (n: unknown) => string, tecnicos: Set<string>) {
  const [donos, vinc] = await Promise.all([
    sb.from('frota_donos_relatorio').select('chave, dono'),
    sb.from('tecnico_veiculos').select('tecnico_nome, placa'),
  ])
  const mapa = new Map<string, string>()
  for (const r of (donos.data || []) as Rec[]) {
    const dono = String(r.dono || '').trim()
    if (!dono || NAO_PESSOA.test(dono)) continue
    mapa.set(placaLimpa(r.chave), padronizar(dono))
  }
  for (const r of (vinc.data || []) as Rec[]) {
    const p = placaLimpa(r.placa), t = padronizar(r.tecnico_nome)
    if (!p || !t) continue
    // carro com 2 vínculos: fica o técnico ativo
    if (!mapa.has(p) || (!tecnicos.has(mapa.get(p)!) && tecnicos.has(t))) mapa.set(p, t)
  }
  return mapa
}

export async function carregarGastos(de: string, ate: string, padronizar: (n: unknown) => string, tecnicos: Set<string>): Promise<Gasto[]> {
  const [dono, cartao, reqs, placas] = await Promise.all([
    donosDosCarros(padronizar, tecnicos),
    paginar((x, y) => sb.from('abastecimentos').select('id, data_transacao, motorista_nome, valor_total, litros, placa, departamento')
      .gte('data_transacao', `${de}T00:00:00-03:00`).lte('data_transacao', `${ate}T23:59:59-03:00`).range(x, y)),
    paginar((x, y) => sb.from('Requisicao').select('id, data, tipo, setor, solicitante, valor_despeza, status, ordem_servico, litros_combustivel, veiculo, titulo, obs')
      .gte('data', de).lte('data', ate).range(x, y)),
    sb.from('SupaPlacas').select('IdPlaca, NumPlaca'),
  ])
  const devolvido = await requisicoesDescontadas().catch(() => new Map<number, number>())
  // Cartão-frota pela ROTA EXATA (transações Veloe que o sistema do Omie grava todo dia em
  // despesas_relatorio, origem ROTAEXATA): são as MESMAS transações da planilha, mas chegam sozinhas.
  // Entram só as que a planilha ainda não tem (mesma placa + valor + dia).
  const rota = await paginar((x, y) => sb.from('despesas_relatorio').select('id, data_iso, vendedor, veiculo, valor, dados_completos')
    .eq('origem', 'ROTAEXATA').gte('data_iso', de).lte('data_iso', `${ate}T23:59:59`).range(x, y)).catch(() => [] as Rec[])
  const placaPorId = new Map(((placas.data || []) as Rec[]).map((p) => [String(p.IdPlaca), placaLimpa(String(p.NumPlaca || '').split('-').pop())]))
  const out: Gasto[] = []

  for (const a of cartao) {
    const valor = Number(a.valor_total) || 0
    if (!valor || !a.data_transacao) continue
    const placa = placaLimpa(a.placa)
    // técnico que abasteceu fica com o gasto; o dono do carro só vale para quem não é técnico
    // (o vínculo da Frota pode estar velho: Saveiro do Danilo ainda constava do Nicolas, demitido)
    const motorista = nomeDe(padronizar, a.motorista_nome)
    let pessoa = (tecnicos.has(motorista) && motorista) || dono.get(placa) || motorista || 'Sem motorista'
    if (!tecnicos.has(pessoa)) {
      if (String(a.departamento || '').toUpperCase() !== 'OFICINA') continue
      pessoa = OFICINA_GERAL
    }
    out.push({ data: diaSP(String(a.data_transacao)), pessoa, tipo: 'abastecimento', origem: 'cartao', valor, litros: Number(a.litros) || 0, naOS: false, ref: `cartao:${a.id}`, placa })
  }

  const naPlanilha = new Set(out.filter((g) => g.origem === 'cartao').map((g) => `${g.data}|${g.placa}|${g.valor.toFixed(2)}`))
  const naPlanilhaSemDia = new Set(cartao.map((a) => `${placaLimpa(a.placa)}|${(Number(a.valor_total) || 0).toFixed(2)}`))
  for (const t of rota) {
    const valor = Number(t.valor) || 0
    const data = String(t.data_iso || '').slice(0, 10)
    if (!valor || !data) continue
    const placa = placaLimpa(t.veiculo)
    if (naPlanilha.has(`${data}|${placa}|${valor.toFixed(2)}`) || naPlanilhaSemDia.has(`${placa}|${valor.toFixed(2)}`)) continue
    const motorista = nomeDe(padronizar, t.vendedor)
    const pessoa = (tecnicos.has(motorista) && motorista) || dono.get(placa) || ''
    if (!tecnicos.has(pessoa)) continue // sem departamento na Rota Exata: só técnico (ou carro de técnico)
    const dc = (t.dados_completos || {}) as Rec
    out.push({ data, pessoa, tipo: 'abastecimento', origem: 'cartao', valor, litros: Number(dc.litros) || 0, naOS: false, ref: `rota:${t.id}`, placa })
  }

  for (const r of reqs) {
    if (/lixeira|cancel/i.test(String(r.status || ''))) continue
    const setor = String(r.setor || '')
    if (/trator.?loja/i.test(setor)) continue
    const tipoReq = String(r.tipo || '').trim()
    const texto = `${r.titulo || ''} ${r.obs || ''}`
    const frota = /frota-ve[ií]culos|veicular manuten/i.test(tipoReq)
    const pagamento = RE_PAGAMENTO.test(tipoReq)
    // classifica: tipo da requisição primeiro; "Dinheiro/Boleto/Pix" e "Frota-Veículos" pelo texto
    let tipo: Gasto['tipo'] | null = null
    if (/aliment/i.test(tipoReq) || (pagamento && RE_TXT_ALIM.test(texto))) tipo = 'alimentacao'
    else if (/abastec/i.test(tipoReq) || ((frota || pagamento) && RE_TXT_ABAST.test(texto))) tipo = 'abastecimento'
    else if (frota) tipo = 'manutencao'
    else if (RE_MATERIAIS.test(tipoReq) || pagamento) tipo = 'materiais'
    if (!tipo) continue
    // Trator-Cliente é custo da OS (terceiros) — só a alimentação da viagem é gasto do pós-vendas
    if (/trator-cliente/i.test(setor) && tipo !== 'alimentacao') continue
    // materiais e pagamentos avulsos: só da Oficina
    if ((tipo === 'materiais') && !/oficina/i.test(setor)) continue
    const ehAlim = tipo === 'alimentacao'
    // o que o funcionário devolveu (desconto em folha / caixinha) não é custo da empresa
    const valor = parseValorMisto(r.valor_despeza) - (devolvido.get(Number(r.id)) || 0)
    if (valor <= 0.009 || !r.data) continue
    let placa = ''
    if (!ehAlim) {
      const v = String(r.veiculo ?? '').trim()
      placa = placaPorId.get(v) || (RE_PLACA.test(v) ? placaLimpa(v.match(RE_PLACA)![0]) : '')
      if (!placa) { const m = `${r.titulo || ''} ${r.obs || ''}`.match(RE_PLACA); if (m) placa = placaLimpa(m[0]) }
    }
    const solicitante = nomeDe(padronizar, r.solicitante)
    let pessoa = (tecnicos.has(solicitante) && solicitante) || (placa && dono.get(placa)) || solicitante || 'Sem solicitante'
    const daOficina = ehAlim ? /trator-cliente|oficina/i.test(setor) : /oficina/i.test(setor)
    if (!tecnicos.has(pessoa)) {
      if (!daOficina) continue
      pessoa = OFICINA_GERAL
    }
    out.push({
      data: String(r.data).slice(0, 10), pessoa, tipo, origem: 'requisicao', valor,
      // só conta quando chegou ao financeiro (mesma regra do TCO da Frota)
      aberto: !/^financeiro$/i.test(String(r.status || '').trim()) || undefined,
      litros: Number(r.litros_combustivel) || 0, naOS: false, ref: `req:${r.id}${r.ordem_servico ? ` · ${r.ordem_servico}` : ''}`, placa: placa || undefined,
    })
  }
  return out
}

/** Equipe do pós-vendas: o RH (salário, comissão, rescisão); sem o RH, config_vendedores_relatorio. */
export async function carregarEquipe(padronizar: (n: unknown) => string, tecnicos: Set<string>): Promise<(MembroEquipe & { nomeRh: string })[]> {
  try {
    const rh = await carregarEquipeRH(padronizar, [...tecnicos])
    if (rh && rh.length) return rh
  } catch (e) { console.error('[pos-equipe] RH', (e as Error).message) }
  const { data, error } = await sb.from('config_vendedores_relatorio').select('nome, salario, encargos, admissao, demissao')
  if (error) throw new Error(error.message)
  const porPessoa = new Map<string, MembroEquipe & { nomeRh: string }>()
  for (const r of (data || []) as Rec[]) {
    const salario = Number(r.salario) || 0, encargos = Number(r.encargos) || 0
    if (salario + encargos <= 0) continue
    const pessoa = padronizar(r.nome)
    if (!tecnicos.has(pessoa)) continue
    const m = { pessoa, nomeRh: String(r.nome || ''), salario, encargos, admissao: (r.admissao as string) || null, demissao: (r.demissao as string) || null }
    const atual = porPessoa.get(pessoa)
    // mais de um cadastro da mesma pessoa: fica o ativo / o mais recente
    if (!atual || (atual.demissao && !m.demissao) || (m.admissao || '') > (atual.admissao || '')) porPessoa.set(pessoa, m)
  }
  return [...porPessoa.values()]
}

/** % de comissão de cada técnico (config_vendedores_relatorio, a mesma do painel do Omie). */
export async function carregarPctComissao(padronizar: (n: unknown) => string, tecnicos: Set<string>): Promise<Record<string, number>> {
  const { data } = await sb.from('config_vendedores_relatorio').select('nome, cargo, comissao')
  const out: Record<string, number> = {}
  for (const c of (data || []) as Rec[]) {
    const v = Number(String(c.comissao ?? '').replace(',', '.')) || 0
    if (v <= 0 || String(c.cargo || '').toUpperCase() === 'VENDEDOR') continue
    const p = padronizar(c.nome)
    if (tecnicos.has(p)) out[p] = v
  }
  return out
}
