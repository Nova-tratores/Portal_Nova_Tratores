// Previsão de horas da OS pelo TEMPÁRIO (José, 20/10/2026) — SÓ SERVIDOR.
// O Tratorilson lê o que o técnico escreveu no relatório (diagnóstico + serviço realizado), escolhe as atividades
// do tempário que correspondem ao que foi FEITO e soma o tempo. Comparando com as horas apontadas:
//  - muito acima / acima → "horas fantasmas" (levou bem mais que o tempário);
//  - rápido demais → pode ter pulado etapa (risco de retrabalho).
// Guarda em posvendas_os_previsao (sql/posvendas-tempario.sql); só refaz quando o relatório muda.
import { createHash } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { parseHoras } from '@/lib/pos/horas-tecnico'
import { candidatos, compararPrevisao, fmtMin, TEMPARIO, type SituacaoPrevisao } from './tempario'

type Rec = Record<string, unknown>
export interface AtividadePrevista { i: number; codigo: string | null; atividade: string; minutos: number; qtd: number; porque: string }
export interface AlertaPrevisao { nivel: 'vermelho' | 'amarelo' | 'azul'; texto: string }
export interface PrevisaoOS {
  idOrdem: string; atividades: AtividadePrevista[]; minutosPrevistos: number | null; horasRelatorio: number; kmRelatorio: number
  situacao: SituacaoPrevisao; diffHoras: number; alertas: AlertaPrevisao[]; observacao: string | null; geradoEm: string
}
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find/i.test(e.message || ''))
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

/** Relatório do técnico da OS (o enviado; sem ele, o mais novo). Colunas explícitas: select * estoura por causa das fotos. */
export async function relatorioDaOS(idOrdem: string): Promise<Rec | null> {
  const { data } = await sb.from('Ordem_Servico_Tecnicos').select('IdOs, Status, TotalHora, TotalKm, Motivo, ServicoRealizado, Modelo, TipoServico, TecResp1, TecResp2, DataInicio, DataInicio2, DataInicio3')
    .eq('Ordem_Servico', idOrdem).order('IdOs', { ascending: false }).limit(5)
  const ls = (data || []) as Rec[]
  return ls.find((r) => String(r.Status || '').toLowerCase() === 'enviado') || ls[0] || null
}

export function alertasDe(p: { situacao: SituacaoPrevisao; horasRelatorio: number; minutosPrevistos: number | null; diffHoras: number; revisao?: boolean }): AlertaPrevisao[] {
  const prev = p.minutosPrevistos ? fmtMin(p.minutosPrevistos) : ''
  const feito = fmtMin(p.horasRelatorio * 60)
  if (p.revisao) return [{ nivel: 'azul', texto: 'Revisão, entrega técnica ou montagem: o tempo segue o plano próprio, não o tempário.' }]
  if (p.situacao === 'muito_acima') return [{ nivel: 'vermelho', texto: `Levou ${feito}; o tempário prevê ${prev} (+${fmtMin(p.diffHoras * 60)}). Possíveis horas fantasmas — confira com o técnico.` }]
  if (p.situacao === 'acima') return [{ nivel: 'amarelo', texto: `Levou ${feito}; o tempário prevê ${prev} (+${fmtMin(p.diffHoras * 60)}).` }]
  if (p.situacao === 'rapido') return [{ nivel: 'amarelo', texto: `Feito em ${feito}; o tempário prevê ${prev}. Bem mais rápido que o normal — confira se nenhuma etapa ficou de fora (risco de retrabalho).` }]
  if (p.situacao === 'sem_previsao') return [{ nivel: 'azul', texto: 'Não achei este serviço no tempário — sem previsão de horas.' }]
  return []
}

async function escolherNoTempario(texto: string, modelo: string): Promise<{ atividades: AtividadePrevista[]; observacao: string | null }> {
  const cands = candidatos(texto, 60)
  if (!cands.length) return { atividades: [], observacao: null }
  const lista = cands.map((c, k) => `${k + 1}. ${c.atividade}${c.sistema ? ` [${c.sistema}${c.subsistema ? ' / ' + c.subsistema : ''}]` : ''} — ${c.minutos} min`).join('\n')
  const r = await chamarIA({
    temperature: 0.1, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Você é o planejador da oficina de tratores Mahindra da Nova Tratores. Recebe o que o mecânico escreveu no relatório e uma lista NUMERADA de atividades do tempário (tempo padrão de cada serviço). Escolha SÓ as atividades que correspondem ao que foi efetivamente FEITO (não ao que foi só diagnosticado), sem repetir atividades que se sobrepõem (se uma atividade já inclui a outra, fique só com a maior). Informe a quantidade quando o texto disser (ex.: os dois lados = 2). Entrega técnica, montagem de máquina nova, inspeção de pré-entrega, conferência de itens e revisões NÃO estão no tempário: se o serviço for só isso, devolva lista vazia. Itens que só estavam FALTANDO ou foram só apontados não contam. Se nada da lista corresponder, devolva lista vazia. Responda só JSON: {"atividades":[{"n":número,"qtd":1,"porque":"trecho curto do relatório"}],"observacao":"uma frase sobre o serviço ou o que não está no tempário"}' },
      { role: 'user', content: `Modelo: ${modelo || 'não informado'}\n\nRELATÓRIO DO MECÂNICO:\n${texto.slice(0, 3000)}\n\nATIVIDADES DO TEMPÁRIO:\n${lista}` },
    ],
  })
  let j: { atividades?: { n: number; qtd?: number; porque?: string }[]; observacao?: string } = {}
  try { j = JSON.parse(r.choices?.[0]?.message?.content || '{}') } catch { j = {} }
  const vistas = new Set<number>()
  const atividades: AtividadePrevista[] = []
  for (const a of j.atividades || []) {
    const c = cands[Number(a.n) - 1]
    if (!c || !c.minutos || vistas.has(c.i)) continue
    vistas.add(c.i)
    atividades.push({ i: c.i, codigo: c.codigo, atividade: c.atividade, minutos: c.minutos, qtd: Math.min(10, Math.max(1, Math.round(Number(a.qtd) || 1))), porque: String(a.porque || '').slice(0, 160) })
  }
  return { atividades, observacao: j.observacao ? String(j.observacao).slice(0, 300) : null }
}

/** Previsão da OS (do cache se o relatório não mudou). `forcar` refaz. Sem a tabela, calcula e não guarda. */
export async function preverOS(idOrdem: string, opts: { forcar?: boolean } = {}): Promise<PrevisaoOS | null> {
  const rel = await relatorioDaOS(idOrdem)
  if (!rel) return null
  const texto = [rel.Motivo && `Diagnóstico: ${rel.Motivo}`, rel.ServicoRealizado && `Serviço realizado: ${rel.ServicoRealizado}`].filter(Boolean).join('\n')
  const horas = parseHoras(rel.TotalHora), km = num(rel.TotalKm)
  const hash = createHash('sha1').update(`${texto}|${horas}|${TEMPARIO.length}`).digest('hex')
  let semTabela = false
  if (!opts.forcar) {
    const { data, error } = await sb.from('posvendas_os_previsao').select('*').eq('id_ordem', idOrdem).maybeSingle()
    if (error && falta(error)) semTabela = true
    const c = data as Rec | null
    if (c && c.texto_hash === hash) return {
      idOrdem, atividades: (c.atividades as AtividadePrevista[]) || [], minutosPrevistos: c.minutos_previstos == null ? null : Number(c.minutos_previstos),
      horasRelatorio: Number(c.horas_relatorio) || 0, kmRelatorio: km, situacao: c.situacao as SituacaoPrevisao, diffHoras: Number(c.diff_horas) || 0,
      alertas: (c.alertas as AlertaPrevisao[]) || [], observacao: (c.observacao as string) || null, geradoEm: String(c.gerado_em),
    }
  }
  // revisão, entrega técnica e montagem têm tempo próprio (plano de revisão / valor fixo) — fora do tempário
  const revisao = /revis|entrega|montag|pr[eé].?entrega/i.test(`${rel.TipoServico || ''} ${String(rel.ServicoRealizado || '').slice(0, 80)}`)
  const esc = !texto || revisao ? { atividades: [], observacao: null } : await escolherNoTempario(texto, String(rel.Modelo || ''))
  const minutos = esc.atividades.length ? esc.atividades.reduce((s, a) => s + a.minutos * a.qtd, 0) : null
  const cmp = compararPrevisao(horas, minutos)
  const situacao: SituacaoPrevisao = revisao ? 'sem_previsao' : cmp.situacao
  const alertas = alertasDe({ situacao, horasRelatorio: horas, minutosPrevistos: minutos, diffHoras: cmp.diffHoras, revisao })
  const p: PrevisaoOS = { idOrdem, atividades: esc.atividades, minutosPrevistos: minutos, horasRelatorio: horas, kmRelatorio: km, situacao, diffHoras: cmp.diffHoras, alertas, observacao: esc.observacao, geradoEm: new Date().toISOString() }
  if (!semTabela) await sb.from('posvendas_os_previsao').upsert({
    id_ordem: idOrdem, texto_hash: hash, atividades: p.atividades, minutos_previstos: minutos, horas_relatorio: horas, km_relatorio: km,
    situacao, diff_horas: cmp.diffHoras, alertas, observacao: p.observacao, gerado_em: p.geradoEm,
  }).then(() => {}, () => {})
  return p
}

/** Previsões já guardadas de várias OS (para o painel de horas fantasmas, sem chamar a IA). */
export async function previsoesGuardadas(ids: string[]): Promise<Map<string, PrevisaoOS>> {
  const out = new Map<string, PrevisaoOS>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('posvendas_os_previsao').select('*').in('id_ordem', ids.slice(i, i + 200))
    if (error) { if (falta(error)) throw new Error('sem a tabela posvendas_os_previsao'); return out }
    for (const c of (data || []) as Rec[]) out.set(String(c.id_ordem), {
      idOrdem: String(c.id_ordem), atividades: (c.atividades as AtividadePrevista[]) || [], minutosPrevistos: c.minutos_previstos == null ? null : Number(c.minutos_previstos),
      horasRelatorio: Number(c.horas_relatorio) || 0, kmRelatorio: Number(c.km_relatorio) || 0, situacao: c.situacao as SituacaoPrevisao, diffHoras: Number(c.diff_horas) || 0,
      alertas: (c.alertas as AlertaPrevisao[]) || [], observacao: (c.observacao as string) || null, geradoEm: String(c.gerado_em),
    })
  }
  return out
}
