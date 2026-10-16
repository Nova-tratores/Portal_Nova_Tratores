// Tratorilson no Centro do Pós-Vendas (José, 16/10/2026) — banco + IA. Regras em ./analise.ts.
// Ele lê os números (horas, faturamento, OS internas, km, ocorrências, agenda), LIGA OS PONTOS
// entre eles e diz a situação atual e o que fazer. Fica no topo do Centro (sem aba própria).
//  - Conhecimento base: CONHECIMENTO abaixo (regras da casa, como ler cada número e como cruzar).
//  - Ensinamentos da gestão: tratorilson_memoria com modulo 'pos/analise' (escopo 'portal').
//  - Última análise: tratorilson_log tipo 'posvendas:analise'. Velha (> 3 h) é refeita sozinha.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { carregarAgenda } from '@/lib/agenda/server'
import type { Autenticado } from '@/lib/auth/server'
import { carregarBase } from './painel-server'
import { agregar, pesosPorOS, resumirGastos, somarDias, ultimasSemanas, ultimosMeses, type LinhaTecnico } from './painel'
import { carregarGastos } from './gastos-server'
import { padronizadorOcorrencias, ocorrenciasEntre } from './ocorrencias-server'
import { escudos, motivos, historicoPorPessoa } from './ocorrencias-painel'
import { agendaPorTecnico, diasDoIntervalo, lerAnalise, DIAS_FUTURO, MODULO_ENSINAMENTOS, type Analise, type ItemFuturo } from './analise'

const TIPO_LOG = 'posvendas:analise'
export const VALIDADE_ANALISE_MS = 3 * 3600_000
// análise pede raciocínio: modelo mais forte que o do chat (centavos por análise)
const MODELO = process.env.OPENAI_MODEL_ANALISE || 'gpt-4o'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const r1 = (n: number) => Math.round((n || 0) * 10) / 10
const r0 = (n: number) => Math.round(n || 0)

// ------------------------------------------------------------------ ensinamentos

export interface Ensinamento { id: number; conteudo: string; criado_por: string | null; updated_at: string | null }

export async function listarEnsinamentos(): Promise<Ensinamento[]> {
  const { data, error } = await sb.from('tratorilson_memoria').select('id, conteudo, criado_por, updated_at')
    .eq('modulo', MODULO_ENSINAMENTOS).eq('ativo', true).order('id')
  if (error) throw new Error(error.message)
  return (data || []) as Ensinamento[]
}

export async function ensinar(conteudo: string, autor: string) {
  const { error } = await sb.from('tratorilson_memoria').insert({ conteudo, ativo: true, escopo: 'portal', modulo: MODULO_ENSINAMENTOS, criado_por: `pos-vendas:${autor}` })
  if (error) throw new Error(error.message)
}

export async function editarEnsinamento(id: number, conteudo: string) {
  const { error } = await sb.from('tratorilson_memoria').update({ conteudo, updated_at: new Date().toISOString() }).eq('id', id).eq('modulo', MODULO_ENSINAMENTOS)
  if (error) throw new Error(error.message)
}

export async function apagarEnsinamento(id: number) {
  const { error } = await sb.from('tratorilson_memoria').update({ ativo: false }).eq('id', id).eq('modulo', MODULO_ENSINAMENTOS)
  if (error) throw new Error(error.message)
}

// ------------------------------------------------------------------ última análise

export interface AnaliseGuardada { analise: Analise; geradaEm: string; por: string | null }

export async function ultimaAnalise(): Promise<AnaliseGuardada | null> {
  const { data } = await sb.from('tratorilson_log').select('created_at, user_nome, resposta').eq('tipo', TIPO_LOG).order('id', { ascending: false }).limit(1)
  const l = (data || [])[0] as { created_at: string; user_nome: string | null; resposta: string } | undefined
  if (!l) return null
  try {
    const j = JSON.parse(l.resposta)
    const analise = j?.analise ? lerAnalise(JSON.stringify(j.analise)) : null // normaliza análises antigas
    return analise ? { analise, geradaEm: l.created_at, por: l.user_nome } : null
  } catch { return null }
}

// ------------------------------------------------------------------ dados para a IA

const resumoLinha = (l: LinhaTecnico) => ({
  tecnico: l.tecnico, meta_h: r0(l.meta), trabalhadas_app_h: r1(l.trabalhadas), em_os_cliente_h: r1(l.cliente), internas_h: r1(l.internas),
  faturadas_h: r1(l.faturadas), ociosas_h: r1(l.ociosas), fim_de_semana_h: r1(l.extras), km: r0(l.km), os_faturadas: r1(l.os),
  servico: r0(l.servico), km_valor: r0(l.kmValor), pecas: r0(l.pecas), bruto: r0(l.bruto), custo_terceiros: r0(l.custo), liquido: r0(l.liquido),
})

/** Tudo que o Tratorilson precisa: 8 semanas, 6 meses, ocorrências (6 meses), OS internas e agenda dos próximos dias. */
export async function montarContexto(auth: Autenticado) {
  const hoje = hojeSP()
  const semanas = ultimasSemanas(hoje, 8)
  const meses = ultimosMeses(hoje, 6)
  const de = semanas[0].de < meses[0].de ? semanas[0].de : meses[0].de
  const ate = semanas[semanas.length - 1].ate
  const futuroAte = somarDias(hoje, DIAS_FUTURO)
  const mesAtual = meses[meses.length - 1]

  const { padronizar, tecnicos: tecOc } = await padronizadorOcorrencias()
  const [base, ocs, agenda, gastos] = await Promise.all([
    carregarBase(de, ate),
    ocorrenciasEntre(meses[0].de, mesAtual.ate, padronizar),
    carregarAgenda(auth, hoje, futuroAte, 'tecnicos'),
    carregarGastos(meses[0].de, hoje, padronizar),
  ])
  const ocor = { ocs, tecnicos: tecOc }
  const pesos = pesosPorOS(base.diasTodos)
  // período em andamento conta só até hoje (senão a meta dos dias que nem chegaram vira ociosidade)
  const passo = (b: { de: string; ate: string; rotulo: string }) => {
    const fim = b.ate > hoje ? hoje : b.ate
    const r = agregar(b.de, fim, base.tecnicos, base.dias, base.faturadas, pesos)
    return { periodo: `${b.rotulo} (${b.de} a ${fim}${fim !== b.ate ? ', EM ANDAMENTO' : ''})`, total: resumoLinha({ ...r.total, tecnico: 'TOTAL' }), linhas: r.linhas }
  }
  const semanasR = semanas.map(passo)
  const mesesR = meses.map(passo)

  // agenda: só o que está em aberto (OS concluída/cancelada fica esmaecida e não conta)
  const nomePorId = new Map(agenda.pessoas.map((p) => [p.id, p.nome]))
  const itens: ItemFuturo[] = agenda.itens.filter((i) => !i.esmaecido && ['os', 'lousa', 'evento'].includes(i.fonte)).map((i) => ({
    pessoas: i.pessoas.map((p) => nomePorId.get(p) || p),
    dias: diasDoIntervalo(i.inicio, i.fim, i.diaInteiro),
    fonte: i.fonte,
    titulo: i.titulo,
    situacao: i.detalhes?.find(([k]) => k === 'Situação' || k === 'Lousa')?.[1] ?? null,
    local: i.local ?? null,
  }))
  const agendaTec = agendaPorTecnico(itens, agenda.pessoas.map((p) => p.nome), hoje, futuroAte)

  // ocorrências
  const mesesChave = meses.map((m) => m.de.slice(0, 7))
  const historico = historicoPorPessoa(ocor.ocs, mesesChave, ocor.tecnicos)
  const ocMes = ocor.ocs.filter((o) => o.data >= mesAtual.de)
  const escMes = escudos(ocMes, ocor.tecnicos)

  // OS internas trabalhadas no mês (horas do app)
  const internas = new Map<string, { os: string; motivo: string; cliente: string; horas: number; tecnicos: Set<string> }>()
  for (const d of base.dias) {
    if (!d.interna || d.data < mesAtual.de) continue
    const info = base.osInternas[d.os]
    const x = internas.get(d.os) || { os: d.os, motivo: info?.motivo || 'interna', cliente: info?.cliente || '', horas: 0, tecnicos: new Set<string>() }
    x.horas += d.horas; x.tecnicos.add(d.tecnico); internas.set(d.os, x)
  }

  // FICHA por pessoa: os pontos já ligados (horas × faturamento × ocorrências × agenda)
  const linhaMes = mesesR[mesesR.length - 1].linhas
  const nomes = [...new Set([...linhaMes.map((l) => l.tecnico), ...escMes.filter((e) => e.qtd > 0).map((e) => e.tecnico)])]
  const fichas = nomes.map((t) => {
    const l = linhaMes.find((x) => x.tecnico === t)
    const e = escMes.find((x) => x.tecnico === t)
    const h = historico.find((x) => x.tecnico === t)
    const a = agendaTec.find((x) => x.tecnico === t)
    const ocsT = ocMes.filter((o) => o.tecnico === t)
    return {
      pessoa: t,
      // técnico = marcado no cadastro OU tem hora no app nas 8 semanas (Nicolas não está marcado no portal)
      e_tecnico_de_campo: base.tecnicos.includes(t) || base.diasTodos.some((d) => d.tecnico === t),
      mes_atual: l ? resumoLinha(l) : null,
      horas_por_semana_8sem: semanasR.map((s) => { const x = s.linhas.find((y) => y.tecnico === t); return x ? { faturadas: r1(x.faturadas), trabalhadas_app: r1(x.trabalhadas), internas: r1(x.internas) } : null }),
      bruto_por_mes_6m: mesesR.map((m) => r0(m.linhas.find((y) => y.tecnico === t)?.bruto || 0)),
      ocorrencias: {
        pontos_restantes_no_mes: e?.saldo ?? 100,
        qtd_por_mes_6m: h?.qtd || [], pontos_por_mes_6m: h?.pontos || [],
        media_qtd_meses_anteriores: h?.mediaQtdAntes ?? 0,
        defesas_aguardando: e?.pendentes || 0,
        do_mes: ocsT.map((o) => ({ data: o.data, motivo: o.rotulo, categoria: o.categoria, pontos: o.pontos, automatica: o.origem === 'auto', vale: o.vale, os: o.idOrdem })),
      },
      gastos_por_mes_6m: meses.map((m) => { const g = resumirGastos(gastos, m.de, m.ate).porPessoa.find((x) => x.pessoa === t); return g ? { abastecimento: r0(g.abastecimento), alimentacao: r0(g.alimentacao), litros: r0(g.litros) } : null }),
      agenda_14_dias: a ? { dias_uteis: a.diasUteis, dias_ocupados: a.diasOcupados, servicos: a.servicos.slice(0, 8).map((s) => `${s.dia} ${s.titulo}`) } : null,
    }
  })

  return {
    hoje,
    meses_6: mesesChave,
    semanas: semanasR.map((s) => ({ periodo: s.periodo, total: s.total })),
    meses: mesesR.map((m) => ({ periodo: m.periodo, total: m.total })),
    gastos_por_mes_6m: meses.map((m) => { const g = resumirGastos(gastos, m.de, m.ate > hoje ? hoje : m.ate); return { mes: m.rotulo, abastecimento: r0(g.abastecimento), alimentacao: r0(g.alimentacao), litros: r0(g.litros), fora_das_os: r0(g.foraDasOS) } }),
    os_internas_do_mes: [...internas.values()].map((x) => ({ ...x, horas: r1(x.horas), tecnicos: [...x.tecnicos] })),
    ocorrencias_do_mes_motivos: motivos(ocMes).slice(0, 10),
    defesas_aguardando_total: escMes.reduce((s, e) => s + e.pendentes, 0),
    fichas,
    agenda_sem_tecnico: agendaTec.find((a) => a.tecnico === 'Sem técnico')?.servicos.slice(0, 10) || [],
  }
}

/** O que o Tratorilson SABE do pós-vendas — escrito com as regras levantadas com o José em 16/10/2026. */
export const CONHECIMENTO = `Você é o Tratorilson, o analista do Pós-Vendas da Nova Tratores (concessionária Mahindra em Piraju/SP; atende tratores e implementos no campo e na oficina: revisões, manutenção, garantia, entrega técnica e montagens).
Seu leitor é o gestor do pós-vendas. Ele quer entender EM 1 MINUTO como está a empresa agora e o que fazer.

COMO LER OS NÚMEROS
- Meta: 8 h por dia útil (seg–sex) por técnico = 40 h/semana. Sábado/domingo é extra.
- trabalhadas_app_h: horas que o técnico registrou no relatório do app. ATENÇÃO: o relatório só é gravado quando o técnico CONCLUI o serviço no app, então a semana atual (e às vezes a anterior) sempre aparece com poucas horas — serviço em andamento ainda não está lá. Para medir a produção use as semanas FECHADAS (as mais antigas das 8).
- faturadas_h: horas COBRADAS em OS JÁ FATURADAS no período. A OS fatura dias ou semanas depois do serviço, então semana/mês em andamento SEMPRE tem poucas faturadas. Não chame isso de queda sem olhar as trabalhadas.
- internas_h: horas em OS INTERNA = não cobrada do cliente (tipo de serviço interno no portal, conta corrente interna ou contrato interno no Omie: entrega técnica, revisão pré-entrega, cortesia oficina/comercial, garantia assumida pela Nova). É custo da empresa; algumas são investimento (entrega técnica de máquina vendida).
- ociosas_h = meta − faturadas − internas.
- Valor: bruto = serviço (horas) + km + peças das OS; custo_terceiros = requisições/compras ligadas à OS; líquido = bruto − custo. OS com 2 técnicos: valor e km divididos.
- km: deslocamento cobrado. Muito km com pouco serviço = viagem cara.
- GASTOS do pós-vendas: abastecimento (cartão-frota do departamento Oficina + requisições de abastecimento) e alimentação (requisições da OS e da Oficina). A alimentação ligada a OS já está no custo de terceiros da OS; fora_das_os é o que ainda não foi descontado. O cartão-frota é importado por arquivo — mês atual pode estar incompleto.
- Ligue gastos com produção: abastecimento alto com pouco km cobrado/pouca hora faturada = carro rodando sem gerar receita (ou uso fora do serviço); compare gasto ÷ faturado entre pessoas e meses.

COMO DIAGNOSTICAR HORA OCIOSA (o ponto mais importante)
- Só tire conclusão de hora ociosa em semana FECHADA (lembre do atraso do relatório e do faturamento).
- faturadas MAIOR que trabalhadas_app → o técnico NÃO registra no app todas as horas que depois são cobradas (a hora cobrada vem da OS). Isso NÃO é atraso de faturamento; é falta de apontamento no app.
- trabalhadas_app alta e faturadas baixa → o serviço FOI feito mas NÃO FATUROU: problema administrativo (OS paradas esperando faturar). Ação: cobrar faturamento das OS concluídas.
- trabalhadas_app baixa e agenda vazia → falta serviço. Ação: captar (revisões a vencer, clientes parados, pós-venda ativo).
- trabalhadas_app baixa mas agenda cheia/serviço acontecendo → o técnico NÃO está apontando horas no app (combina com ocorrência "Apontamento de horas incorreto"/"Falta de informação"). Ação: cobrar o preenchimento.
- muitas internas → a oficina está trabalhando de graça; ver se é entrega técnica (normal em mês de venda de máquina) ou cortesia/garantia NT (custo).

OCORRÊNCIAS (pontuação)
- Cada pessoa começa o mês com 100 pontos. Ocorrências tiram pontos fixos por motivo. Categorias: OS (retorno de serviço, falta de informação, saída sem OS, apontamento de horas, não pediu requisição), PV (peças), RH (atraso, falta, EPI, organização), Frota (excesso de velocidade, abastecimento por requisição, consumo anormal, multa, carro sujo, checklist).
- Automáticas (velocidade 115+ km/h, abastecimento por requisição, consumo) vêm do rastreador: repetição = hábito, não acidente.
- Defesa (justificativa) aguardando = a gestão precisa julgar; acumular defesas é falha de gestão.
- Compare o mês com a média dos meses anteriores: subiu = piorando.

LIGUE OS PONTOS (é isso que a gestão quer de você)
- Ocorrência de OS (falta de informação, apontamento incorreto, sem requisição, saída sem OS) explica hora não faturada, custo sem controle e retrabalho → mostre a ligação com os números daquela pessoa.
- Retorno de serviço = retrabalho: hora gasta sem faturar e cliente insatisfeito.
- Excesso de velocidade/consumo + muito km = risco e custo de frota.
- Pessoa com muitas ocorrências E produção baixa = caso de conversa individual; muitas ocorrências com produção alta = sobrecarga ou pressa.
- Agenda dos próximos 14 dias quase vazia: pode ser falta de serviço OU a equipe não está lançando na Lousa/OS com previsão — diga qual hipótese os dados apoiam e recomende registrar a agenda.
- Algumas pessoas nas ocorrências não são técnicos de campo (comercial, administrativo): trate só pela pontuação.

REGRAS
- Use SÓ os dados recebidos. Nunca invente número, cliente, OS ou causa. Cite números concretos (h, R$, pontos, dias, OS).
- Cada conexão e cada pessoa precisa citar PELO MENOS 2 números dos dados (ex.: "22 h no app na semana de 14/09, mas só 6 h faturadas; 2 ocorrências de falta de informação = −12 pts"). Frase genérica sem número não serve.
- Compare semanas fechadas entre si e o mês com os meses anteriores (bruto_por_mes_6m, qtd_por_mes_6m) para dizer se melhorou ou piorou.
- Período EM ANDAMENTO está incompleto: compare com cuidado (proporcional aos dias).
- Os ENSINAMENTOS DA GESTÃO valem como regra acima do seu julgamento.
- Português simples, frases curtas, sem jargão de TI. Seja direto: o gestor prefere a verdade.

Responda APENAS um JSON:
{"manchete":"1 frase com a situação de agora","situacao":"bom|atencao|critico","resumo":"3 a 5 frases","conexoes":[{"titulo":"","texto":"ligando 2 ou mais números/ocorrências"}],"destaques":[{"titulo":"","texto":"","tipo":"bom|atencao|critico"}],"porTecnico":[{"tecnico":"","leitura":"o que os números e as ocorrências dele dizem juntos","acao":""}],"proximosDias":{"leitura":"","alertas":[""]},"acoes":[{"oque":"","quem":"","quando":"","porque":""}]}`

/** Gera a análise agora, guarda no log e devolve. */
export async function gerarAnalise(auth: Autenticado, autor: string): Promise<AnaliseGuardada> {
  const [contexto, ens] = await Promise.all([montarContexto(auth), listarEnsinamentos()])
  const ensinamentos = ens.length ? ens.map((e, i) => `${i + 1}. ${e.conteudo}`).join('\n') : '(nenhum ensinamento cadastrado ainda)'
  const resp = await chamarIA({
    model: MODELO,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CONHECIMENTO },
      { role: 'user', content: `ENSINAMENTOS DA GESTÃO:\n${ensinamentos}\n\nDADOS (JSON):\n${JSON.stringify(contexto)}` },
    ],
  })
  const texto = String(resp?.choices?.[0]?.message?.content || '')
  const analise = lerAnalise(texto)
  if (!analise) throw new Error('O Tratorilson não conseguiu montar a análise. Tente de novo.')
  const geradaEm = new Date().toISOString()
  await sb.from('tratorilson_log').insert({ user_id: auth.userId || null, user_nome: autor, tipo: TIPO_LOG, pergunta: 'Análise do pós-vendas', resposta: JSON.stringify({ analise }) })
  return { analise, geradaEm, por: autor }
}

// uma geração por vez no processo (várias telas abertas não pagam a IA em dobro)
let gerando: Promise<AnaliseGuardada> | null = null
export function gerarUmaVez(auth: Autenticado, autor: string): Promise<AnaliseGuardada> {
  if (!gerando) gerando = gerarAnalise(auth, autor).finally(() => { gerando = null })
  return gerando
}
export const estaGerando = () => !!gerando
