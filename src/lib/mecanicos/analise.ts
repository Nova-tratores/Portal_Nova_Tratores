// Análise do Tratorilson no Centro do Pós-Vendas (José, 16/10/2026) — regras puras.
// O Tratorilson lê o PASSADO (semanas do painel + ocorrências) e o FUTURO (OS e Lousa
// agendadas nos próximos dias) e devolve o que a gestão precisa fazer. Os "ensinamentos"
// da gestão (tratorilson_memoria, modulo pos/analise) entram como regra no prompt.
import { diaSemana, somarDias } from './painel'

export const MODULO_ENSINAMENTOS = 'pos/analise'
export const DIAS_FUTURO = 14

/** Item da agenda reduzido ao que a análise usa. */
export interface ItemFuturo {
  pessoas: string[]          // nomes (já resolvidos)
  dias: string[]             // YYYY-MM-DD em que o item ocupa a pessoa
  fonte: 'os' | 'lousa' | 'evento' | string
  titulo: string
  situacao?: string | null
  local?: string | null
}

export interface AgendaTecnico {
  tecnico: string
  diasUteis: number
  diasOcupados: number
  livres: string[]           // dias úteis sem nada agendado
  servicos: { dia: string; titulo: string; fonte: string; situacao?: string | null; local?: string | null }[]
}

/** Dias úteis (seg–sex) de `de` a `ate`, inclusive. */
export function listaDiasUteis(de: string, ate: string): string[] {
  const out: string[] = []
  for (let d = de; d <= ate; d = somarDias(d, 1)) { const w = diaSemana(d); if (w >= 1 && w <= 5) out.push(d) }
  return out
}

/** Dias (YYYY-MM-DD, fuso de Brasília) que um intervalo da agenda cobre. Dia inteiro: [ini, fim). */
export function diasDoIntervalo(inicio: string, fim: string, diaInteiro: boolean): string[] {
  const dia = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  const a = dia(inicio)
  // fim exclusivo: um compromisso que termina 00:00 não ocupa o dia seguinte
  const b = diaInteiro ? somarDias(dia(fim), -1) : dia(new Date(Date.parse(fim) - 1).toISOString())
  const out: string[] = []
  for (let d = a; d <= b && out.length < 62; d = somarDias(d, 1)) out.push(d)
  return out.length ? out : [a]
}

/** Agenda dos próximos dias por técnico: o que já está marcado e quais dias úteis estão livres. */
export function agendaPorTecnico(itens: ItemFuturo[], tecnicos: string[], de: string, ate: string): AgendaTecnico[] {
  const uteis = listaDiasUteis(de, ate)
  const nomes = [...new Set([...tecnicos, ...itens.flatMap((i) => i.pessoas)])]
  return nomes.map((t) => {
    const meus = itens.filter((i) => i.pessoas.includes(t))
    const ocupados = new Set(meus.flatMap((i) => i.dias).filter((d) => d >= de && d <= ate))
    const servicos = meus
      .flatMap((i) => i.dias.filter((d) => d >= de && d <= ate).slice(0, 1).map((dia) => ({ dia, titulo: i.titulo, fonte: i.fonte, situacao: i.situacao ?? null, local: i.local ?? null })))
      .sort((a, b) => a.dia.localeCompare(b.dia))
    return {
      tecnico: t,
      diasUteis: uteis.length,
      diasOcupados: uteis.filter((d) => ocupados.has(d)).length,
      livres: uteis.filter((d) => !ocupados.has(d)),
      servicos,
    }
  }).sort((a, b) => a.livres.length - b.livres.length || a.tecnico.localeCompare(b.tecnico, 'pt-BR'))
}

// ------------------------------------------------------------------ resposta da IA

export type TipoDestaque = 'bom' | 'atencao' | 'critico'
export interface Analise {
  /** uma frase que resume a situação agora (vai na faixa do topo) */
  manchete: string
  situacao: TipoDestaque
  resumo: string
  /** ligando os pontos: horas × faturamento × ocorrências × agenda */
  conexoes: { titulo: string; texto: string }[]
  destaques: { titulo: string; texto: string; tipo: TipoDestaque }[]
  porTecnico: {
    tecnico: string; leitura: string; acao: string
    situacao: TipoDestaque
    pontosFortes: string[]; atencao: string[]
    /** 2 a 3 dicas práticas do que fazer com ele */
    dicas: string[]
    /** como puxar a conversa com ele (uma frase respeitosa) */
    conversa: string
  }[]
  proximosDias: { leitura: string; alertas: string[] }
  acoes: { oque: string; quem: string; quando: string; porque: string; prioridade: 'alta' | 'media' | 'baixa' }[]
}

const txt = (v: unknown, max = 600) => String(v ?? '').trim().slice(0, max)
const textos = (v: unknown, max: number) => (Array.isArray(v) ? v : []).slice(0, max).map((x) => txt(x, 300)).filter(Boolean)
const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[]

/** Lê o JSON da IA sem confiar no formato: campo faltando vira vazio, nunca quebra a tela. */
export function lerAnalise(bruto: string): Analise | null {
  let j: Record<string, unknown>
  try {
    const m = bruto.match(/\{[\s\S]*\}/)
    j = JSON.parse(m ? m[0] : bruto)
  } catch { return null }
  if (!j || typeof j !== 'object') return null
  const pd = (j.proximosDias && typeof j.proximosDias === 'object' ? j.proximosDias : {}) as Record<string, unknown>
  const a: Analise = {
    manchete: txt(j.manchete, 240),
    situacao: (['bom', 'atencao', 'critico'].includes(String(j.situacao)) ? j.situacao : 'atencao') as TipoDestaque,
    resumo: txt(j.resumo, 1200),
    conexoes: lista(j.conexoes).slice(0, 8).map((c) => ({ titulo: txt(c.titulo, 120), texto: txt(c.texto, 700) })).filter((c) => c.texto),
    destaques: lista(j.destaques).slice(0, 8).map((d) => ({
      titulo: txt(d.titulo, 120), texto: txt(d.texto),
      tipo: (['bom', 'atencao', 'critico'].includes(String(d.tipo)) ? d.tipo : 'atencao') as TipoDestaque,
    })).filter((d) => d.titulo || d.texto),
    porTecnico: lista(j.porTecnico).slice(0, 20).map((t) => ({
      tecnico: txt(t.tecnico, 80), leitura: txt(t.leitura), acao: txt(t.acao),
      situacao: (['bom', 'atencao', 'critico'].includes(String(t.situacao)) ? t.situacao : 'atencao') as TipoDestaque,
      pontosFortes: textos(t.pontosFortes, 4), atencao: textos(t.atencao, 4), dicas: textos(t.dicas, 4), conversa: txt(t.conversa, 400),
    })).filter((t) => t.tecnico),
    proximosDias: { leitura: txt(pd.leitura, 1000), alertas: (Array.isArray(pd.alertas) ? pd.alertas : []).slice(0, 10).map((x) => txt(x, 300)).filter(Boolean) },
    acoes: lista(j.acoes).slice(0, 12).map((x) => ({
      oque: txt(x.oque, 300), quem: txt(x.quem, 80), quando: txt(x.quando, 80), porque: txt(x.porque, 300),
      prioridade: (['alta', 'media', 'baixa'].includes(String(x.prioridade)) ? x.prioridade : 'media') as 'alta' | 'media' | 'baixa',
    })).filter((x) => x.oque).sort((a, b) => ['alta', 'media', 'baixa'].indexOf(a.prioridade) - ['alta', 'media', 'baixa'].indexOf(b.prioridade)),
  }
  if (!a.manchete) a.manchete = a.resumo.split(/(?<=[.!?])\s/)[0] || ''
  return a.resumo || a.destaques.length || a.acoes.length ? a : null
}
