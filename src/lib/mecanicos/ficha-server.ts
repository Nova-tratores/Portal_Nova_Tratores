// Ficha completa do técnico (José, 19/10/2026: "em cada card que a gente clicar tem que vir
// informações completas dos técnicos: RH, OS, requisição, frota, ocorrência, a pontuação, e lá
// dentro já fazer a comissão dele"). SÓ SERVIDOR — junta as fontes num objeto só:
//  - RH (banco do RH): cadastro, férias, faltas/atrasos (ponto), descontos, caixinha, comissões
//    lançadas mês a mês e o motivo de cada ajuste de OS. Salário e % de comissão SAEM (pedido do José, 20/10/2026).
//  - Comissão OS por OS: ./comissao-detalhe.ts (regra do painel do Omie + ajustes manuais).
//  - OS: faturadas, internas e esperando faturar do mês; horas do app do técnico por dia.
//  - Requisições: as que ele pediu no mês e as das OS dele.
//  - Frota: carro(s) dele (vínculo do técnico + dono do carro), rodagem do mês, gastos e pendências.
//  - Ocorrências: 12 meses, com defesas; pontos do mês e a liga da carreira.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarDiretorio } from '@/lib/agenda/server'
import { carregarBase } from './painel-server'
import { carregarPendencias } from './pendencias-server'
import { carregarGastos, carregarPctComissao, donosDosCarros } from './gastos-server'
import { clienteRH } from './rh-server'
import { padronizadorOcorrencias, ocorrenciasEntre } from './ocorrencias-server'
import { casarNome, BASE_PONTOS } from './ocorrencias-painel'
import { carreiraEComissoes } from './carreira-server'
import { comissaoDoTecnico, chaveDoTecnico, type MotivoAjuste, type Recebida } from './comissao-detalhe'
import { previsaoPagamento } from './comissao'
import { comCache, aquecer } from './cache'
import { GRUPOS } from './painel'
import { ajustesDeComissao, pctsDasOS } from './comissao-server'
import { lerRegrasComissao } from './regras-comissao-server'
import { ehGarantista, comissaoDoGarantista, ehLarissa, comissaoDaLarissa } from './comissao-escritorio-server'

type Rec = Record<string, unknown>
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somarMes = (m: string, n: number) => { const [a, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(a, mm - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const fimDoMes = (m: string) => { const [a, mm] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, '0')}` }
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const num = (v: unknown) => { const s = String(v ?? '').replace(/[^\d,.-]/g, ''); const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100

export type FichaTecnico = Awaited<ReturnType<typeof montarFicha>>

const chaveFicha = (nome: string, mes: string) => `ficha13:${nome}:${mes}`
const VALIDADE_FICHA = 15 * 60_000

/** A ficha sai SEMPRE do que está gravado no banco (posvendas_painel_cache); o robô do servidor regrava
 *  a cada 10 min (aquecerFichas) — abrir o card não espera cálculo (José, 20/10/2026). */
export async function fichaTecnico(nome: string, mes: string, forcar = false) {
  const r = await comCache(chaveFicha(nome, mes), VALIDADE_FICHA, () => montarFicha(nome, mes), forcar)
  return { ...r.dados, geradoEm: r.geradoEm }
}

/** Robô: deixa gravada a ficha de cada mecânico do mês atual e do anterior (um por vez). */
export async function aquecerFichas() {
  const hoje = hojeSP(), mes = hoje.slice(0, 7)
  const { tecnicos, padronizar } = await padronizadorOcorrencias()
  const pct = await carregarPctComissao(padronizar, new Set(tecnicos)).catch(() => ({} as Record<string, number>))
  const nomes = Object.keys(pct).filter((t) => !GRUPOS[t])
  for (const m of [mes, somarMes(mes, -1)]) for (const n of nomes) await aquecer(chaveFicha(n, m), VALIDADE_FICHA, () => montarFicha(n, m))
  return nomes.length
}

async function montarFicha(nome: string, mes: string) {
  const hoje = hojeSP()
  const avisos: string[] = []
  const { tecnicos, padronizar } = await padronizadorOcorrencias()
  const setTec = new Set(tecnicos)
  const dir = await carregarDiretorio()
  const pessoa = dir.pessoas.find((p) => p.nome === nome) || null
  const deMes = `${mes}-01`, ateMes = fimDoMes(mes) < hoje ? fimDoMes(mes) : hoje
  // janela maior que o mês: OS com a data mudada por ajuste (data_ref) podem vir de 2 meses antes
  const deJan = `${somarMes(mes, -2)}-01`, ateJan = fimDoMes(somarMes(mes, 1)) < hoje ? fimDoMes(somarMes(mes, 1)) : hoje

  const pegar = async <T,>(rot: string, f: () => Promise<T>, vazio: T): Promise<T> => {
    try { return await f() } catch (e) { avisos.push(`${rot}: ${e instanceof Error ? e.message : String(e)}`); return vazio }
  }

  const [base, pctTodos, carreira, ocs, rh, frota] = await Promise.all([
    comCache(`ficha-base4:${deJan}:${ateJan}`, 10 * 60_000, () => carregarBase(deJan, ateJan)).then((x) => x.dados),
    pegar('% de comissão', () => carregarPctComissao(padronizar, setTec), {} as Record<string, number>),
    pegar('carreira', () => carreiraEComissoes(), null),
    pegar('ocorrências', async () => (await ocorrenciasEntre(`${somarMes(hoje.slice(0, 7), -11)}-01`, hoje, padronizar)).filter((o) => o.tecnico === nome), []),
    pegar('RH', () => dadosRH(nome, pessoa?.id || null, tecnicos), null),
    pegar('frota', () => dadosFrota(nome, padronizar, setTec, deMes, ateMes), null),
  ])
  const pct = pctTodos[nome] || 0

  // ---------- OS do mês
  const minhas = base.faturadas.filter((o) => o.tecnicos.includes(nome))
  const pend = await pegar('OS esperando faturar', () => carregarPendencias(new Set(base.faturadas.map((o) => o.os)), padronizar), [])
  const minhasPend = pend.filter((p) => p.tecnicos.includes(nome))

  // ---------- ajustes manuais (comissoes_os_relatorio) das OS da janela + motivo (log do RH)
  const dele = (o: { tecnicos: string[]; tecnicosOmie?: string[] }) => o.tecnicos.includes(nome) || !!o.tecnicosOmie?.includes(nome)
  // OS que outro técnico dividiu com este (pedido esperando o diretor ou já autorizado) — José, 29/10/2026
  const recebidas = new Map<string, Recebida>()
  const { data: peds } = await sb.from('posvendas_comissoes').select('tecnico, status, linhas').eq('mes', mes).in('status', ['aguardando', 'espelhada']).neq('tecnico', nome)
  for (const p of (peds || []) as { tecnico: string; status: string; linhas: { os: string; numero: string; acao: string; divisao?: Record<string, number> | null; horasDiv?: Record<string, number> | null }[] }[]) {
    for (const l of p.linhas || []) {
      if (!l.divisao || l.acao === 'nao') continue
      const k = Object.keys(l.divisao).find((c) => c === nome || chaveDoTecnico(c, nome))
      if (k == null || !(Number(l.divisao[k]) > 0)) continue
      const r: Recebida = { de: p.tecnico, valor: Number(l.divisao[k]), horas: l.horasDiv?.[k] ?? null, status: p.status === 'espelhada' ? 'autorizada' : 'pedido' }
      recebidas.set(l.numero || l.os, r); recebidas.set(l.os, r)
    }
  }
  // divisões salvas na ficha (antes do pedido): as que este técnico fez voltam para a tela; as que deram horas a ele
  // entram como recebidas (o pedido, quando existe, vale mais)
  const divisoes: Record<string, { horas: Record<string, number> | null; valores: Record<string, number>; motivo: string; em: string; por: string | null }> = {}
  const { data: dvs } = await sb.from('posvendas_divisoes').select('os, numero, de_tecnico, horas, valores, motivo, atualizado_em, salvo_por').eq('mes', mes)
  for (const dv of (dvs || []) as { os: string; numero: string; de_tecnico: string; horas: Record<string, number> | null; valores: Record<string, number>; motivo: string; atualizado_em: string; salvo_por: string | null }[]) {
    if (dv.de_tecnico === nome) { divisoes[dv.os] = { horas: dv.horas, valores: dv.valores, motivo: dv.motivo, em: dv.atualizado_em, por: dv.salvo_por }; continue }
    const k = Object.keys(dv.valores || {}).find((c) => c === nome || chaveDoTecnico(c, nome))
    if (k == null || !(Number(dv.valores[k]) > 0) || recebidas.has(dv.numero)) continue
    const r: Recebida = { de: dv.de_tecnico, valor: Number(dv.valores[k]), horas: dv.horas?.[k] ?? null, status: 'salva' }
    recebidas.set(dv.numero, r); recebidas.set(dv.os, r)
  }
  const numeros = [...new Set([...[...base.faturadas, ...base.internasFechadas].filter(dele).flatMap((o) => [o.numeroOmie || o.os, o.os]), ...recebidas.keys()].filter(Boolean))] as string[]
  const ajustes = await ajustesDeComissao(numeros)
  const motivos = new Map<string, MotivoAjuste>()
  for (const l of rh?.ajustesOS || []) if (!motivos.has(l.numero)) motivos.set(l.numero, { motivo: l.motivo, por: l.por, em: l.em, de: l.de })

  const regras = await lerRegrasComissao().catch(() => undefined)
  const pctPorOS = await pctsDasOS([...new Set([...base.faturadas, ...base.internasFechadas, ...pend].map((o) => o.os))]).catch(() => new Map())
  // garantista (função na Administração): a comissão é a das garantias e revisões do mês, na mesma ficha (29/10/2026)
  const garantista = pessoa ? await ehGarantista(pessoa.id).catch(() => false) : false
  const larissa = !garantista && ehLarissa(nome)
  const comissao = garantista ? await comissaoDoGarantista(nome, mes, hoje) : larissa ? await comissaoDaLarissa(nome, mes, hoje) : comissaoDoTecnico({ tecnico: nome, mes, hoje, pct, faturadas: base.faturadas, internas: base.internasFechadas, pendencias: pend, ajustes, motivos, regras, pctPorOS, recebidas })
  const oficial = rh?.comissoes.find((c) => c.mes === mes) || null

  // ---------- horas do app (relatório do técnico) no mês
  const dias = base.diasTodos.filter((d) => d.tecnico === nome && d.data >= deMes && d.data <= ateMes)
  const porDia = new Map<string, { horas: number; os: Set<string>; interna: number }>()
  for (const d of dias) {
    const x = porDia.get(d.data) || { horas: 0, os: new Set<string>(), interna: 0 }
    x.horas += d.horas; x.os.add(d.os); if (d.interna) x.interna += d.horas; porDia.set(d.data, x)
  }

  const osMes = minhas.filter((o) => o.data >= deMes && o.data <= ateMes).map((o) => {
    const n = Math.max(1, o.tecnicos.length)
    return {
      os: o.os, numeroOmie: o.numeroOmie, cliente: o.cliente, data: o.data, tecnicos: o.tecnicos, garantia: !!o.garantia, nota: o.nota ?? null,
      horas: r2(o.horasCobradas), km: r2(o.km), servico: r2(o.servico), kmValor: r2(o.kmValor), pecas: r2(o.pecas), bruto: r2(o.bruto), parte: r2(o.bruto / n), custo: r2(o.custo),
      requisicoes: (o.requisicoes || []).map((q) => ({ id: q.id, titulo: q.titulo, valor: q.valor })),
      descontos: o.descontos ? { hora: r2(o.descontos.hora), km: r2(o.descontos.km), geral: r2(o.descontos.geral), pecas: r2(o.descontos.pecas) } : null,
      descontoMotivo: o.descontoMotivo ?? null,
    }
  }).sort((a, b) => b.data.localeCompare(a.data))
  const internasMes = base.internasFechadas.filter((x) => x.tecnicos.includes(nome) && x.data >= deMes && x.data <= ateMes)
    .map((x) => ({ os: x.os, numeroOmie: x.numeroOmie, cliente: x.cliente, data: x.data, contrato: x.contrato, motivo: x.motivo, horas: r2(x.horas), valor: r2(x.valor) }))

  // ---------- requisições: pedidas por ele no mês + as das OS dele no mês
  const requisicoes = await pegar('requisições', () => requisicoesDo(nome, padronizar, deMes, ateMes, [...osMes.map((o) => o.os), ...minhasPend.map((p) => p.os)]), [])

  // ---------- ocorrências / pontos
  const doMes = ocs.filter((o) => o.data.startsWith(mes))
  const pontosMes = doMes.filter((o) => o.vale).reduce((s, o) => s + o.pontos, 0)
  const car = carreira?.carreira.find((c) => c.tecnico === nome) || null

  // OS que só existe no Omie abre pela impressão do Omie, que pede o código interno da OS (cod_os)
  const numsOmie = [...new Set([...comissao.linhas.map((l) => l.os), ...osMes.map((o) => o.os), ...internasMes.map((o) => o.os)].filter((o) => o.startsWith('OMIE ')).map((o) => o.slice(5)))]
  const codOmie: Record<string, string> = {}
  if (numsOmie.length) {
    const { data } = await sb.from('portal_nt_clientes_os').select('num_os, cod_os').eq('empresa', 'Nova Tratores').in('num_os', numsOmie)
    for (const x of (data || []) as Rec[]) if (x.cod_os) codOmie[String(x.num_os)] = String(x.cod_os)
  }

  return {
    nome, mes, hoje, avisos, codOmie,
    /** divisões de OS salvas por este técnico no mês (chave = id da OS) */
    divisoes,
    /** é garantista do pós-vendas: comissão por garantias e revisões, sem metas de técnico */
    garantista,
    /** é do escritório (garantista ou Larissa): sem caixinha, sem metas de técnico, OS sem dividir */
    escritorio: garantista || larissa,
    /** técnicos com % de comissão (para dividir a comissão de uma OS) */
    equipe: Object.entries(pctTodos).map(([t, p]) => ({ nome: t, pct: p })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    foto: pessoa?.avatar_url || carreira?.fotos?.[nome] || null,
    pontos: { saldo: Math.max(0, BASE_PONTOS - pontosMes), base: BASE_PONTOS, descontados: pontosMes, nivel: car?.nivel ?? null, seFecharAssim: car?.seFecharAssim ?? null, sequencia: car?.sequencia ?? 0, saldoLiga: car?.saldoAgora ?? 0, ganhosMes: car?.mesAtual.ganhos ?? 0, osLimpasMes: car?.mesAtual.osLimpas ?? 0, faltaProximo: car?.faltaProximo ?? 0, historico: (car?.historico || []).slice(-6) },
    rh: rh ? { ...rh, ajustesOS: undefined } : null,
    comissao: { ...comissao, oficial, pagamento: previsaoPagamento(mes), historico: rh?.comissoes || [] },
    os: {
      faturadas: osMes, internas: internasMes,
      aguardando: minhasPend.map((p) => ({ os: p.os, tipo: p.tipo, status: p.status, cliente: p.cliente, dataRef: p.dataRef, dias: p.dias, maoDeObra: r2(p.maoDeObra), total: r2(p.total), garantia: p.garantia, tecnicos: p.tecnicos })),
      dias: [...porDia.entries()].sort().map(([data, x]) => ({ data, horas: r2(x.horas), interna: r2(x.interna), os: [...x.os] })),
      horasApp: r2(dias.reduce((s, d) => s + d.horas, 0)),
    },
    requisicoes,
    frota,
    ocorrencias: ocs.map((o) => ({ id: o.id, data: o.data, rotulo: o.rotulo, cor: o.cor, categoria: o.categoria, pontos: o.pontos, vale: o.vale, descricao: o.descricao, idOrdem: o.idOrdem, defesas: o.defesas.map((d) => ({ status: d.status, texto: d.texto, descontar: d.descontar, avaliadoPor: d.avaliadoPor })) })),
  }
}

// ============================================================================ RH
async function dadosRH(nome: string, userId: string | null, cadastro: string[]) {
  const c = clienteRH()
  if (!c) return null
  const fun = await c.from('rh_funcionarios').select('id, nome, cargo, departamento, data_admissao, data_demissao, tipo_contrato, status, telefone, email, cidade, data_nascimento, matricula, portal_user_id, empresa, salario_bruto, comissao_percentual')
  if (fun.error) throw new Error(fun.error.message)
  const todos = (fun.data || []) as Rec[]
  let f = userId ? todos.find((x) => x.portal_user_id === userId) : undefined
  if (!f) {
    const cand = todos.filter((x) => chaveDoTecnico(String(x.nome), nome) || casarNome(String(x.nome), cadastro) === nome)
    f = cand.find((x) => x.status !== 'demitido') || cand[0]
  }
  if (!f) return null
  const id = String(f.id)
  const umAno = `${somarMes(hojeSP().slice(0, 7), -11)}-01`
  const [ferias, ponto, descontos, comissoes, logs, caixinha, uniformes] = await Promise.all([
    c.from('rh_ferias_periodos_aquisitivos').select('inicio, fim, dias_direito, dias_gozados, dias_vendidos, status').eq('funcionario_id', id).order('inicio', { ascending: false }),
    c.from('rh_ponto_eventos').select('data, tipo, quantidade, unidade, observacao, status').eq('funcionario_id', id).gte('data', umAno).order('data', { ascending: false }),
    c.from('rh_descontos').select('descricao, valor, competencia_mes, competencia_ano, status, fonte').eq('funcionario_id', id).order('competencia_ano', { ascending: false }).order('competencia_mes', { ascending: false }).limit(40),
    c.from('rh_comissoes').select('competencia_mes, competencia_ano, valor, status, origem_tipo, origem_descricao').eq('funcionario_id', id).not('status', 'in', '(cancelada,rejeitada)').order('competencia_ano', { ascending: false }).order('competencia_mes', { ascending: false }).limit(24),
    c.from('rh_comissao_os_log').select('numero_os, campo, valor_de, valor_para, motivo, usuario_nome, criado_em').eq('funcionario_id', id).order('criado_em', { ascending: false }).limit(400),
    c.from('rh_caixinha_mov').select('tipo, valor, competencia_mes, competencia_ano, descricao').eq('funcionario_id', id).order('criado_em', { ascending: false }).limit(60),
    c.from('rh_uniforme_entregas').select('data_entrega, assinado').eq('funcionario_id', id).order('data_entrega', { ascending: false }),
  ])
  const mesDe = (r: Rec) => `${r.competencia_ano}-${String(r.competencia_mes).padStart(2, '0')}`
  const porMes = new Map<string, { mes: string; valor: number; status: string; origem: string }>()
  for (const r of (comissoes.data || []) as Rec[]) {
    const m = mesDe(r), x = porMes.get(m) || { mes: m, valor: 0, status: String(r.status), origem: String(r.origem_descricao || '') }
    x.valor = r2(x.valor + num(r.valor)); porMes.set(m, x)
  }
  const cx = (caixinha.data || []) as Rec[]
  const saldoCaixinha = r2(cx.reduce((s, m) => s + (String(m.tipo) === 'contribuicao' ? num(m.valor) : -num(m.valor)), 0))
  const adm = f.data_admissao ? String(f.data_admissao).slice(0, 10) : null
  return {
    id, nomeRh: String(f.nome), cargo: (f.cargo as string) || null, departamento: (f.departamento as string) || null,
    admissao: adm, demissao: f.data_demissao ? String(f.data_demissao).slice(0, 10) : null,
    tipoContrato: (f.tipo_contrato as string) || null, status: (f.status as string) || null,
    salario: num(f.salario_bruto) || null,
    /** % de comissão gravada no RH (null = segue o painel do Omie) */
    comissaoPctRH: f.comissao_percentual == null ? null : num(f.comissao_percentual),
    telefone: (f.telefone as string) || null, cidade: (f.cidade as string) || null, matricula: (f.matricula as string) || null,
    aniversario: f.data_nascimento ? String(f.data_nascimento).slice(5, 10) : null,
    ferias: ((ferias.data || []) as Rec[]).map((p) => ({ inicio: String(p.inicio), fim: String(p.fim), direito: num(p.dias_direito), gozados: num(p.dias_gozados), vendidos: num(p.dias_vendidos), status: String(p.status), saldo: num(p.dias_direito) - num(p.dias_gozados) - num(p.dias_vendidos) })),
    ponto: ((ponto.data || []) as Rec[]).filter((p) => p.status !== 'cancelado').map((p) => ({ data: String(p.data), tipo: String(p.tipo), quantidade: num(p.quantidade), unidade: String(p.unidade || ''), obs: (p.observacao as string) || '' })),
    descontos: ((descontos.data || []) as Rec[]).filter((d) => d.status !== 'cancelado').map((d) => ({ mes: mesDe(d), descricao: String(d.descricao || ''), valor: num(d.valor), status: String(d.status), caixinha: d.fonte === 'caixinha' })),
    comissoes: [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes)),
    caixinha: { saldo: saldoCaixinha, movimentos: cx.length },
    uniformes: ((uniformes.data || []) as Rec[]).map((u) => ({ data: String(u.data_entrega), assinado: !!u.assinado })),
    ajustesOS: ((logs.data || []) as Rec[]).map((l) => ({ numero: String(l.numero_os), campo: String(l.campo), de: (l.valor_de as string) || null, para: (l.valor_para as string) || null, motivo: String(l.motivo || ''), por: (l.usuario_nome as string) || null, em: String(l.criado_em) })),
  }
}

// ============================================================================ requisições
async function requisicoesDo(nome: string, padronizar: (n: unknown) => string, de: string, ate: string, osIds: string[]) {
  const cols = 'id, titulo, tipo, setor, solicitante, data, status, valor_despeza, valor_cobrado_cliente, ordem_servico, fornecedor, litros_combustivel, veiculo'
  const primeiro = nome.split(' ')[0]
  const [pedidas, dasOS] = await Promise.all([
    sb.from('Requisicao').select(cols).gte('data', de).lte('data', ate).ilike('solicitante', `%${primeiro}%`).limit(500),
    osIds.length ? sb.from('Requisicao').select(cols).in('ordem_servico', osIds.slice(0, 300)).limit(500) : Promise.resolve({ data: [] as Rec[] }),
  ])
  const out = new Map<number, Rec & { minha: boolean; daOS: boolean }>()
  for (const r of (pedidas.data || []) as Rec[]) if (padronizar(r.solicitante) === nome) out.set(Number(r.id), { ...r, minha: true, daOS: false })
  for (const r of (dasOS.data || []) as Rec[]) { const x = out.get(Number(r.id)); if (x) x.daOS = true; else out.set(Number(r.id), { ...r, minha: false, daOS: true }) }
  return [...out.values()].filter((r) => !/lixeira/i.test(String(r.status || ''))).map((r) => ({
    id: Number(r.id), titulo: String(r.titulo || ''), tipo: String(r.tipo || ''), setor: String(r.setor || ''), solicitante: String(r.solicitante || ''),
    data: String(r.data || '').slice(0, 10), status: String(r.status || ''), valor: num(r.valor_despeza), cobrado: num(r.valor_cobrado_cliente),
    os: (r.ordem_servico as string) || null, fornecedor: (r.fornecedor as string) || null, litros: num(r.litros_combustivel), minha: r.minha, daOS: r.daOS,
  })).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)
}

// ============================================================================ frota
async function dadosFrota(nome: string, padronizar: (n: unknown) => string, tecnicos: Set<string>, de: string, ate: string) {
  // carro EM USO pelo que aconteceu de verdade (José, 20/10/2026: "o Danilo não tem mais vínculo com esses carros"):
  // abastecimento no cartão e requisição veicular dele nos 45 dias até o fim do mês. O cadastro (vínculo do técnico
  // e dono do carro) só vale quando não há uso registrado — e a diferença aparece como aviso.
  const donos = await donosDosCarros(padronizar, tecnicos)
  const cadastro = [...donos.entries()].filter(([, t]) => t === nome).map(([p]) => p)
  const desde = (() => { const d = new Date(`${ate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 45); return d.toISOString().slice(0, 10) })()
  const [cart, reqs] = await Promise.all([
    sb.from('abastecimentos').select('data_transacao, motorista_nome, placa').gte('data_transacao', `${desde}T00:00:00-03:00`).lte('data_transacao', `${ate}T23:59:59-03:00`).limit(5000),
    sb.from('Requisicao').select('solicitante, veiculo, data, tipo').ilike('tipo', '%Veicular%').gte('data', desde).lte('data', ate).limit(3000),
  ])
  const sp = await sb.from('SupaPlacas').select('IdPlaca, NumPlaca')
  // só a placa ("SAVEIRO - TKY6E68" → "TKY6E68")
  const soPlaca = (t: unknown) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').match(/\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/)?.[0] ?? ''
  const porId = new Map(((sp.data || []) as Rec[]).map((x) => [String(x.IdPlaca), soPlaca(x.NumPlaca)]))
  const deTexto = (v: unknown) => porId.get(String(v)) || soPlaca(v)
  const uso = new Map<string, { ultimo: string; vezes: number; fontes: Set<string> }>()
  const marcar = (placa: string, dia: string, fonte: string) => {
    if (!placa || /^CLI/.test(placa)) return
    const x = uso.get(placa) || { ultimo: '', vezes: 0, fontes: new Set<string>() }
    x.vezes++; x.fontes.add(fonte); if (dia > x.ultimo) x.ultimo = dia; uso.set(placa, x)
  }
  for (const a of (cart.data || []) as Rec[]) if (padronizar(a.motorista_nome) === nome) marcar(placaLimpa(a.placa), String(a.data_transacao).slice(0, 10), 'cartão-frota')
  for (const q of (reqs.data || []) as Rec[]) if (padronizar(q.solicitante) === nome) marcar(deTexto(q.veiculo), String(q.data || '').slice(0, 10), 'requisição')
  // em uso = o mais usado (empate: o mais recente); outro só entra com pelo menos metade do uso do principal
  // (abastecer uma ou duas vezes o carro de um colega não faz o carro ser dele)
  const ordem = [...uso.entries()].sort((a, b) => b[1].vezes - a[1].vezes || b[1].ultimo.localeCompare(a[1].ultimo))
  const recente = ordem.reduce((m, [, x]) => (x.ultimo > m ? x.ultimo : m), '')
  const dias = (d1: string, d2: string) => (Date.parse(d1) - Date.parse(d2)) / 86_400_000
  // e quem ele largou há mais de 20 dias (trocou de carro) não conta mais
  const vivos = ordem.filter(([, x]) => dias(recente, x.ultimo) <= 20)
  const emUso = vivos.filter(([, x], i) => i === 0 || (x.vezes >= 2 && x.vezes >= vivos[0][1].vezes / 2)).map(([p]) => p)
  const placas = emUso.length ? emUso : cadastro
  const vinculo = { emUso, cadastro, soCadastro: !emUso.length && cadastro.length > 0, divergente: emUso.length > 0 && cadastro.some((c) => !emUso.includes(c)) }
  // checklist do carro (veiculo_checklist, um por mês) — José, 28/10/2026: "coloca o checklist do mês ali também"
  const variantes = placas.flatMap((p) => [p, p.replace(/^([A-Z]{3})/, '$1-')])
  const [veic, diasF, pend, gastos, chks] = await Promise.all([
    placas.length ? sb.from('frota_veiculos').select('id, placa, marca, modelo, descricao, ano, tipo_veiculo, status') : Promise.resolve({ data: [] as Rec[] }),
    placas.length ? sb.from('frota_dias').select('placa, data, km_total, km_odometro, tempo_ligado_min, tempo_movimento_min, vel_max, paradas_cliente, paradas_atipicas, litros').gte('data', de).lte('data', ate).limit(5000) : Promise.resolve({ data: [] as Rec[] }),
    placas.length ? sb.from('frota_pendencias').select('placa, titulo, descricao, status, aberta_em, gravidade, origem').eq('status', 'aberta').limit(500) : Promise.resolve({ data: [] as Rec[] }),
    carregarGastos(de, ate, padronizar, tecnicos).catch(() => []),
    placas.length ? sb.from('veiculo_checklist').select('id, placa, tecnico_nome, mes_referencia, status, score_confianca, km, fim_em').in('placa', variantes).order('mes_referencia', { ascending: false }).limit(60) : Promise.resolve({ data: [] as Rec[] }),
  ])
  const mesRef = de.slice(0, 7)
  const ps = new Set(placas)
  const meus = gastos.filter((g) => g.pessoa === nome)
  const carros = placas.map((p) => {
    const v = ((veic.data || []) as Rec[]).find((x) => placaLimpa(x.placa) === p)
    const dd = ((diasF.data || []) as Rec[]).filter((d) => placaLimpa(d.placa) === p)
    const km = dd.reduce((s, d) => s + num(d.km_total), 0)
    const u = uso.get(p)
    return {
      ultimoUso: u?.ultimo || null, usoVezes: u?.vezes || 0, usoFontes: u ? [...u.fontes] : [],
      placa: p, modelo: [v?.marca, v?.modelo || v?.descricao].filter(Boolean).join(' ') || null, ano: (v?.ano as string) || null, tipo: (v?.tipo_veiculo as string) || null,
      km: r2(km), diasRodados: dd.filter((d) => num(d.km_total) > 0).length,
      ligadoH: r2(dd.reduce((s, d) => s + num(d.tempo_ligado_min), 0) / 60), movimentoH: r2(dd.reduce((s, d) => s + num(d.tempo_movimento_min), 0) / 60),
      velMax: Math.max(0, ...dd.map((d) => num(d.vel_max))), paradasAtipicas: dd.reduce((s, d) => s + num(d.paradas_atipicas), 0),
      odometro: Math.max(0, ...dd.map((d) => num(d.km_odometro))) || null,
      checklists: ((chks.data || []) as Rec[]).filter((x) => placaLimpa(x.placa) === p && String(x.mes_referencia || '') <= mesRef).slice(0, 4).map((x) => ({
        id: String(x.id), mes: String(x.mes_referencia || ''), tecnico: (x.tecnico_nome as string) || null, status: String(x.status || ''), score: x.score_confianca == null ? null : num(x.score_confianca), km: x.km == null ? null : num(x.km), em: (x.fim_em as string) || null,
      })),
      mesRef,
      pendencias: ((pend.data || []) as Rec[]).filter((x) => placaLimpa(x.placa) === p).map((x) => ({ titulo: String(x.titulo || ''), descricao: String(x.descricao || ''), desde: String(x.aberta_em || '').slice(0, 10), gravidade: (x.gravidade as string) || null })),
    }
  })
  const soma = (t: string) => r2(meus.filter((g) => g.tipo === t && !g.aberto).reduce((s, g) => s + g.valor, 0))
  return {
    carros, vinculo,
    gastos: { abastecimento: soma('abastecimento'), litros: r2(meus.filter((g) => g.tipo === 'abastecimento' && !g.aberto).reduce((s, g) => s + g.litros, 0)), manutencao: soma('manutencao'), alimentacao: soma('alimentacao'), materiais: soma('materiais'), emAberto: r2(meus.filter((g) => g.aberto).reduce((s, g) => s + g.valor, 0)) },
    lancamentos: meus.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 80).map((g) => ({ data: g.data, tipo: g.tipo, origem: g.origem, valor: r2(g.valor), litros: r2(g.litros), placa: g.placa || null, ref: g.ref || null, aberto: !!g.aberto, outroCarro: !!g.placa && !ps.has(placaLimpa(g.placa)) })),
  }
}
