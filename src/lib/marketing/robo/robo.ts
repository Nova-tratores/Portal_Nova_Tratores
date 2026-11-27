// =============================================================================
// Robô dos posts (26/11/2026). José: "quero fazer tudo automático, conforme vai chegando as datas vai gerando as
// coisas, não precisa gerar tudo de uma vez" · "30 dias" · "3 por semana + as datas comemorativas".
//
// Todo dia (agendador 'marketing-robo-posts', 07:00) olha os próximos 30 dias e acha as VAGAS:
//   - data comemorativa importante (datasAgro, prioridade 2 ou 3);
//   - segunda, quarta e sexta sem data especial.
// Pula a vaga se já tem post naquele dia (feito pela equipe) ou se o robô já fez (caderno mkt_robo — apagar o post
// = descartar; o robô não refaz). Preenche no máximo MARKETING_ROBO_POR_DIA (3) vagas por vez, das mais próximas.
// Para cada vaga: ideia (Claude) → foto de trator do banco → cena (OpenAI, trator real) → arte → post "ideia".
// Variação: a ideia recebe os assuntos recentes; a foto do trator alterna (menos usada, diferente das últimas).
// =============================================================================
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { DATAS_AGRO, type DataAgro } from '../redes/datasAgro'
import type { RedeId } from '../redes/redes'
import { CUSTO_IDEIA_USD, ETAPAS_CAMPANHA, TEMAS_DIA, ideiaParaCampanha, ideiaParaData, ideiaParaDia, type CampanhaDoPost, type EtapaCampanha, type Ideia } from './ideia'
import { CUSTO_CENA_USD, imagemPronta, montarCena } from './cena'
import { PALETAS_EM_ORDEM, type Paleta } from './arte'
import { gerarPecas, guardarCena, type Camadas } from './camadas'
import { ESTILOS_EM_ORDEM, type Estilo, type Posicao } from './paletas'

/** Visual de cada post (José, 26/11: "os posts estão muito semelhantes"): modelo × posição do texto × cor.
 *  Monta as combinações e começa pelas que não saíram nos últimos posts. */
type Visual = { estilo: Estilo; posicao: Posicao; paleta: Paleta }
function filaDeVisuais(ultimos: Partial<Visual>[]): Visual[] {
  const todas: Visual[] = []
  for (const estilo of ESTILOS_EM_ORDEM) for (const paleta of PALETAS_EM_ORDEM) for (const posicao of (estilo === 'cena' ? ['alto', 'baixo'] : ['alto']) as Posicao[]) todas.push({ estilo, posicao, paleta })
  const pontos = (v: Visual) => ultimos.reduce((s, u, i) => s + (u.estilo === v.estilo ? 3 / (i + 1) : 0) + (u.paleta === v.paleta ? 2 / (i + 1) : 0) + (u.posicao === v.posicao ? .5 / (i + 1) : 0), 0) + Math.random() * .3
  // escolhe um por vez, sempre o mais diferente dos anteriores (inclusive dos que acabou de escolher)
  const fila: Visual[] = [], hist = [...ultimos]
  for (let k = 0; k < 10; k++) { const v = [...todas].sort((a, b) => pontos(a) - pontos(b) || 0)[0]; fila.push(v); hist.unshift(v); ultimos = hist }
  return fila
}

const SOCIAIS: RedeId[] = ['instagram', 'facebook', 'tiktok', 'youtube']
const DIAS_FRENTE = 30
/** Teste de 26/11: o robô fez a Black Friday do dia seguinte. Vaga a menos de 3 dias não dá tempo de aprovar. */
const DIAS_MINIMO = 3
const HORA = '09:00'
const POR_VEZ = () => Math.max(1, Math.min(10, Number(process.env.MARKETING_ROBO_POR_DIA) || 3))
export const MSG_SQL_ROBO = 'Robô não ativado: rode sql/marketing-robo.sql no projeto do portal (citrhumdkfivdzbmayde).'

type Vaga = { chave: string; dia: string; tipo: 'data' | 'dia' | 'campanha'; data?: DataAgro; acao?: CampanhaDoPost; etapa?: EtapaCampanha }

/** Campanhas que geram posts (José, 27/11/2026): feira, ação de loja e campanha/promoção. Evento interno nunca. */
export const TIPOS_COM_POST = ['feira', 'acao_loja', 'campanha'] as const

/** Os 4 posts de cada campanha que começa nos próximos 30 dias: 7 dias antes, véspera, 1º dia e 1 dia depois do fim.
 *  A chave leva o dia: se a data da campanha mudar, nasce o post da data nova (o da antiga fica para a equipe apagar). */
async function vagasDeCampanhas(hoje: string, soAcao?: string): Promise<Vaga[]> {
  let q = sb.from('mkt_acoes').select('id, nome, tipo, descricao, objetivo, data_inicio, data_fim, local_nome, cidade, uf')
    .in('tipo', [...TIPOS_COM_POST]).not('status', 'in', '(cancelada,realizada)').is('deleted_at', null).not('data_inicio', 'is', null)
  q = soAcao ? q.eq('id', soAcao) : q.lte('data_inicio', somar(hoje, DIAS_FRENTE)).gte('data_inicio', somar(hoje, -10))
  const { data, error } = await q
  if (error) { console.warn('[robo] campanhas:', error.message); return [] }
  const vagas: Vaga[] = []
  for (const a of (data || []) as CampanhaDoPost[]) {
    const ini = a.data_inicio.slice(0, 10), fim = (a.data_fim || a.data_inicio).slice(0, 10)
    const dias: Record<EtapaCampanha, string> = { antes7: somar(ini, -7), vespera: somar(ini, -1), abertura: ini, obrigado: somar(fim, 1) }
    for (const etapa of Object.keys(ETAPAS_CAMPANHA) as EtapaCampanha[]) {
      const dia = dias[etapa]
      // campanha é marcada pela equipe: vale a partir de amanhã (não espera os 3 dias das datas comemorativas)
      if (dia <= hoje || dia > somar(hoje, DIAS_FRENTE + 10)) continue
      vagas.push({ chave: `campanha:${a.id}:${etapa}:${dia}`, dia, tipo: 'campanha', acao: a, etapa })
    }
  }
  return vagas
}
type Foto = { id: string; url: string; etiquetas: string[]; usada_em: number; nota: number | null }

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const somar = (dia: string, n: number) => diaSP(new Date(new Date(`${dia}T12:00:00-03:00`).getTime() + n * 864e5))
const semana = (dia: string) => new Date(`${dia}T12:00:00-03:00`).getUTCDay() // 0 dom … 6 sáb (meio-dia: sem erro de fuso)

/** Vagas dos próximos 30 dias (a partir de amanhã), na ordem do calendário. */
export function vagasDoPeriodo(hoje: string): Vaga[] {
  const ate = somar(hoje, DIAS_FRENTE)
  const vagas: Vaga[] = []
  const diasComData = new Set<string>()
  const de = somar(hoje, DIAS_MINIMO)
  for (const d of DATAS_AGRO) {
    if (d.d < de || d.d > ate || d.prior < 2) continue
    vagas.push({ chave: `data:${d.d}:${d.nome}`, dia: d.d, tipo: 'data', data: d })
    diasComData.add(d.d)
  }
  for (let i = DIAS_MINIMO; i <= DIAS_FRENTE; i++) {
    const dia = somar(hoje, i)
    if ([1, 3, 5].includes(semana(dia)) && !diasComData.has(dia)) vagas.push({ chave: `dia:${dia}`, dia, tipo: 'dia' })
  }
  return vagas.sort((a, b) => a.dia.localeCompare(b.dia))
}

async function tecnicos(): Promise<string[]> {
  const { data } = await sb.from('financeiro_usu').select('nome').eq('funcao', 'Técnico').eq('ativo', true)
  return ((data || []) as { nome: string }[]).map((u) => u.nome.trim()).filter((n) => n && !/teste/i.test(n))
}

/** Foto de trator para a cena: combina com as etiquetas da ideia, é pouco usada e não saiu nos últimos posts. */
async function escolherFoto(ideia: Ideia, evitar: string[]): Promise<Foto | null> {
  const { data } = await sb.from('mkt_fotos').select('id, url, etiquetas, usada_em, nota').contains('etiquetas', ['trator']).eq('ia_status', 'ok').limit(300)
  const fotos = ((data || []) as Foto[]).filter((f) => (f.nota ?? 3) >= 2)
  if (!fotos.length) return null
  const pontos = (f: Foto) => ideia.fotos.filter((e) => f.etiquetas.includes(e)).length * 2 + (f.nota ?? 3) - f.usada_em * 1.5 - (evitar.includes(f.id) ? 20 : 0) + Math.random()
  return fotos.sort((a, b) => pontos(b) - pontos(a))[0]
}

const notasDoRobo = (i: Ideia, vaga: Vaga) => [
  `Criado pelo robô de posts (${vaga.tipo === 'data' ? `data: ${vaga.data?.nome}` : vaga.tipo === 'campanha' ? `campanha: ${vaga.acao?.nome}, ${ETAPAS_CAMPANHA[vaga.etapa!].nome}` : 'dia comum'}). Confira antes de aprovar.`,
  i.por_que && `Por que: ${i.por_que}`,
  i.confirmar.length ? `Conferir:\n${i.confirmar.map((c) => `- ${c}`).join('\n')}` : '',
  i.formato !== 'feed' ? `Formato sugerido: ${i.formato}.` : '',
  i.roteiro.length ? `Roteiro (${i.formato}):\n${i.roteiro.map((c, k) => `${k + 1}. ${c}`).join('\n')}` : '',
].filter(Boolean).join('\n\n')

/** Faz uma vaga inteira. Devolve o id do post. */
async function fazerVaga(vaga: Vaga, ctx: { tecnicos: string[]; recentes: string[]; fotosRecentes: string[]; temaDia: string; visual: Visual }) {
  const ideia = vaga.tipo === 'data'
    ? await ideiaParaData(vaga.data!, { tecnicos: ctx.tecnicos, recentes: ctx.recentes })
    : vaga.tipo === 'campanha'
      ? await ideiaParaCampanha(vaga.acao!, vaga.etapa!, vaga.dia, { tecnicos: ctx.tecnicos, recentes: ctx.recentes })
      : await ideiaParaDia(vaga.dia, ctx.temaDia, { tecnicos: ctx.tecnicos, recentes: ctx.recentes })
  // feira e ação de loja = "Evento"; campanha/promoção = "Promoção" (post de condição só sai depois de aprovado)
  const etiqueta = vaga.tipo === 'data' ? 'data' : vaga.tipo === 'campanha' ? (vaga.acao!.tipo === 'campanha' ? 'promocao' : 'evento') : null

  const foto = await escolherFoto(ideia, ctx.fotosRecentes)
  if (!foto) throw new Error('O Banco de fotos não tem foto de trator etiquetada. Envie fotos de tratores em Conteúdo → Banco de fotos.')
  const base = Buffer.from(await (await fetch(foto.url, { signal: AbortSignal.timeout(30_000) })).arrayBuffer())
  // camadas (José, 26/11): a cena fica guardada à parte; texto, cor e posição podem ser editados no Marketing
  const camadas: Camadas = {
    cena: await guardarCena(await montarCena(base, ideia.cena)),
    data: vaga.data ? { nome: vaga.data.nome.replace(/\s*\(.*\)$/, ''), dia: vaga.dia.slice(8, 10) + '/' + vaga.dia.slice(5, 7) }
      // campanha: a linha de cima da arte mostra o dia em que ela começa + o nome
      : vaga.acao ? { nome: vaga.acao.nome.slice(0, 40), dia: vaga.acao.data_inicio.slice(8, 10) + '/' + vaga.acao.data_inicio.slice(5, 7) } : null,
    titulo: ideia.arte_titulo, frase: ideia.arte_frase, destaque: ideia.arte_destaque || '',
    paleta: ctx.visual.paleta, posicao: ctx.visual.posicao, estilo: ctx.visual.estilo, foto_id: foto.id, cena_pedido: ideia.cena.slice(0, 1000),
  }
  // todas as redes (José, 26/11): feed 1080×1350, em pé 1080×1920 e vídeo em pé (TikTok e Shorts só aceitam vídeo)
  const pecas = await gerarPecas(camadas)
  const midia: Record<string, string> = { feed: pecas.feed, vertical: pecas.vertical, ...(pecas.video ? { video: pecas.video } : {}) }

  const post = {
    titulo: ideia.titulo.slice(0, 120),
    legenda: `${ideia.legenda.trim()}\n\n${ideia.hashtags.join(' ')}`.slice(0, 5000),
    redes: SOCIAIS, formato: 'feed', midia,
    quando: new Date(`${vaga.dia}T${HORA}:00-03:00`).toISOString(),
    status: 'ideia', resultado: {}, notas: notasDoRobo(ideia, vaga),
    criado_por: 'Robô de posts', atualizado_por: 'Robô de posts',
  }
  let r = await sb.from('site_posts').insert({ ...post, arte: camadas, etiqueta_tipo: etiqueta }).select('id').single()
  // SQL da Fase 4 (etiqueta_tipo) ou das camadas (arte) ainda não rodou: grava sem a coluna que falta
  if (r.error && /etiqueta_tipo|arte/.test(r.error.message)) r = await sb.from('site_posts').insert(/arte/.test(r.error.message) ? { ...post, etiqueta_tipo: etiqueta } : { ...post, arte: camadas }).select('id').single()
  if (r.error && /etiqueta_tipo|arte/.test(r.error.message)) r = await sb.from('site_posts').insert(post).select('id').single()
  if (r.error) throw new Error(`criar o post: ${r.error.message}`)

  await sb.from('mkt_fotos').update({ usada_em: foto.usada_em + 1 }).eq('id', foto.id)
  return { postId: String(r.data.id), ideia, fotoId: foto.id }
}

/** Uma rodada do robô. `max` = quantas vagas no máximo (padrão MARKETING_ROBO_POR_DIA).
 *  `soAcao`: só os posts daquela campanha (chamado logo depois de criar/editar a campanha). */
export async function rodarRobo(max = POR_VEZ(), soAcao?: string): Promise<{ resumo: string; pulado?: string; feitos: string[]; erros: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) return { resumo: '', pulado: 'sem ANTHROPIC_API_KEY', feitos: [], erros: [] }
  if (!imagemPronta()) return { resumo: '', pulado: 'sem OPENAI_API_KEY', feitos: [], erros: [] }

  const hoje = diaSP(new Date())
  const campanhas = await vagasDeCampanhas(hoje, soAcao)
  const diasDeCampanha = new Set(campanhas.map((v) => v.dia))
  // campanhas primeiro; num dia com post de campanha não entra o post de dia comum
  const vagas = soAcao ? campanhas : [...campanhas, ...vagasDoPeriodo(hoje).filter((v) => v.tipo === 'data' || !diasDeCampanha.has(v.dia))]
  const ate = somar(hoje, DIAS_FRENTE + 10)

  const { data: caderno, error } = await sb.from('mkt_robo').select('chave, status, tema, foto_id, dia, criado_em').order('criado_em', { ascending: false }).limit(500)
  if (error) throw new Error(/mkt_robo|does not exist|schema cache/i.test(error.message) ? MSG_SQL_ROBO : error.message)
  const feitas = new Set(((caderno || []) as { chave: string; status: string }[]).filter((c) => c.status === 'feito').map((c) => c.chave))

  // dias que já têm post (feito pela equipe ou pelo robô)
  const { data: posts } = await sb.from('site_posts').select('titulo, quando').gte('quando', `${hoje}T00:00:00-03:00`).lte('quando', `${ate}T23:59:59-03:00`)
  const diasComPost = new Set(((posts || []) as { quando: string }[]).map((p) => diaSP(new Date(p.quando))))

  // post de campanha sai mesmo se o dia já tem outro post; os demais só em dia vazio. Campanha não conta no limite do dia.
  const pendentes = vagas.filter((v) => !feitas.has(v.chave) && (v.tipo === 'campanha' || !diasComPost.has(v.dia)))
  const fila = [...pendentes.filter((v) => v.tipo === 'campanha').slice(0, 8), ...pendentes.filter((v) => v.tipo !== 'campanha').slice(0, max)]
  if (!fila.length) return { resumo: '', pulado: `calendário dos próximos ${DIAS_FRENTE} dias já preenchido`, feitos: [], erros: [] }

  // contexto para variar
  const ultimos = (caderno || []) as { tema: string | null; foto_id: string | null; status: string }[]
  const { data: titulos } = await sb.from('site_posts').select('titulo').gte('quando', `${somar(hoje, -30)}T00:00:00-03:00`).limit(60)
  const recentes = [...ultimos.filter((c) => c.status === 'feito' && c.tema).slice(0, 15).map((c) => c.tema as string), ...((titulos || []) as { titulo: string }[]).map((t) => t.titulo)].slice(0, 30)
  const fotosRecentes = ultimos.filter((c) => c.foto_id).slice(0, 4).map((c) => c.foto_id as string)
  // visual alternando (modelo × cor × posição): começa pelo mais diferente dos últimos posts do robô
  const { data: ultArtes } = await sb.from('site_posts').select('arte').eq('criado_por', 'Robô de posts').order('criado_em', { ascending: false }).limit(6)
  const visuais = filaDeVisuais(((ultArtes || []) as { arte?: Partial<Visual> | null }[]).map((p) => p.arte || {}))
  const ctx = { tecnicos: await tecnicos(), recentes, fotosRecentes, temaDia: '', visual: visuais[0] }
  const usadosDia = ultimos.filter((c) => c.tema).map((c) => (c.tema as string).toLowerCase())

  const feitos: string[] = [], erros: string[] = []
  for (const [n, vaga] of fila.entries()) {
    ctx.visual = visuais[n % visuais.length]
    ctx.temaDia = TEMAS_DIA.find((t) => !usadosDia.some((u) => u.includes(t.split(' ')[0]))) || TEMAS_DIA[Math.floor(Math.random() * TEMAS_DIA.length)]
    try {
      const r = await fazerVaga(vaga, ctx)
      // mkt_robo.tipo só aceita 'data'/'dia' (check do SQL): campanha entra como 'data'; a chave "campanha:..." diferencia
      await sb.from('mkt_robo').upsert({ chave: vaga.chave, dia: vaga.dia, tipo: vaga.tipo === 'dia' ? 'dia' : 'data', tema: r.ideia.tema, post_id: r.postId, foto_id: r.fotoId, cena: r.ideia.cena.slice(0, 1000), status: 'feito', erro: null, custo_usd: CUSTO_IDEIA_USD + CUSTO_CENA_USD })
      ctx.recentes.unshift(r.ideia.tema); ctx.fotosRecentes.unshift(r.fotoId); usadosDia.unshift(r.ideia.tema.toLowerCase())
      feitos.push(`${vaga.dia.slice(8)}/${vaga.dia.slice(5, 7)} ${r.ideia.arte_titulo}`)
    } catch (e) {
      const m = (e as Error).message.slice(0, 300)
      await sb.from('mkt_robo').upsert({ chave: vaga.chave, dia: vaga.dia, tipo: vaga.tipo === 'dia' ? 'dia' : 'data', status: 'erro', erro: m })
      erros.push(`${vaga.dia}: ${m}`)
      if (/Banco de fotos|ANTHROPIC|OPENAI|quota|billing|limit/i.test(m)) break   // problema geral: não adianta tentar as outras
    }
  }
  if (!feitos.length && erros.length) throw new Error(erros.join(' | '))
  return { resumo: `${feitos.length} post(s) no calendário: ${feitos.join(' · ')}${erros.length ? ` · erros: ${erros.join(' | ')}` : ''}`, feitos, erros }
}
