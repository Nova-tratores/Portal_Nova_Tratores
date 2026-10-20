// QUADRO DA LOUSA — regras puras (sem banco). Usadas pela rota /api/lousa/quadro.
// Dias_Execucao da OS = lista separada por vírgula; cada entrada é "YYYY-MM-DD" ou
// "YYYY-MM-DD HH:MM-HH:MM" (o horário vai junto e é mantido ao mudar o dia).
import { addDias, diaDaSemana } from '@/lib/salas/regras'

const DIA = /^(\d{4}-\d{2}-\d{2})(.*)$/

/** Muda os dias da OS em `delta` dias, mantendo o horário de cada entrada; domingo pula para segunda (ou sábado, voltando). */
export function deslocarDiasExecucao(lista: string, delta: number): string {
  return lista.split(',').map((s) => s.trim()).filter(Boolean).map((e) => {
    const m = DIA.exec(e)
    if (!m) return e
    let d = addDias(m[1], delta)
    if (diaDaSemana(d) === 0) d = addDias(d, delta >= 0 ? 1 : -1)
    return d + m[2]
  }).join(',')
}

/** Primeiro dia (YYYY-MM-DD) de uma lista Dias_Execucao, ou null. */
export function primeiroDia(lista: string | null | undefined): string | null {
  const ds = String(lista || '').split(',').map((s) => DIA.exec(s.trim())?.[1]).filter((x): x is string => !!x).sort()
  return ds[0] || null
}

/** Diferença em dias entre dois YYYY-MM-DD. */
export const difDias = (de: string, ate: string) => Math.round((new Date(ate + 'T12:00:00Z').getTime() - new Date(de + 'T12:00:00Z').getTime()) / 86_400_000)

/**
 * Técnicos da OS depois de arrastar o cartão da linha de `de` para a linha de `para`:
 * troca só quem estava na linha de onde o cartão saiu (OS com 2 técnicos mantém o outro).
 * Nomes comparados sem caixa/acento; gravados como estão em `para`.
 */
export function trocarTecnico(atuais: [string | null, string | null], de: string | null, para: string): [string | null, string | null] {
  const n = (s: string | null) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
  const [t1, t2] = atuais
  if (n(para) && (n(t1) === n(para) || n(t2) === n(para))) {
    // já está na OS: se o cartão saiu da linha do outro, a OS fica só com quem recebeu
    if (de && n(de) !== n(para)) return n(t1) === n(de) ? [t2, null] : n(t2) === n(de) ? [t1, null] : [t1, t2]
    return [t1, t2]
  }
  if (de && n(t2) === n(de)) return [t1, para]
  return [para, t2]
}

/** número de texto do POS ("1", "3.6", "1,5") — vazio/lixo = 0 */
export const numeroOS = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

/** só o que o cliente pediu (linha "Solicitação do cliente:" do Serv_Solicitado), sem o resto */
export function lerSolicitacao(texto: string | null | undefined): string {
  const m = /solicita[cç][aã]o do cliente:[ \t]*([\s\S]*?)(?:\n\s*servi[cç]o realizado:|$)/i.exec(texto || '')
  return m ? m[1].trim() : ''
}

/**
 * Troca SÓ a solicitação do cliente dentro do Serv_Solicitado
 * ("Modelo… Chassis… Horimetro…\n\nSolicitação do cliente: X\nServiço Realizado: Y"),
 * mantendo modelo, chassi, horímetro e o serviço realizado. Sem o marcador, acrescenta.
 */
export function trocarSolicitacao(texto: string | null | undefined, nova: string): string {
  const t = String(texto || '')
  const limpa = nova.trim()
  const re = /(solicita[cç][aã]o do cliente:)[ \t]*([\s\S]*?)(\n\s*servi[cç]o realizado:|$)/i
  if (re.test(t)) return t.replace(re, (_m, rot: string, _v: string, fim: string) => `${rot} ${limpa}${fim}`)
  return t.trim() ? `${t.trimEnd()}\n\nSolicitação do cliente: ${limpa}\nServiço Realizado: ` : `Solicitação do cliente: ${limpa}\nServiço Realizado: `
}

/** novo Valor_Total quando horas/km mudam: soma a diferença × valor da hora/km da OS */
export function novoValorTotal(total: unknown, horas: { antes: unknown; depois: unknown; valor: number }, km: { antes: unknown; depois: unknown; valor: number }): number {
  const v = numeroOS(total) + (numeroOS(horas.depois) - numeroOS(horas.antes)) * horas.valor + (numeroOS(km.depois) - numeroOS(km.antes)) * km.valor
  return Math.round(Math.max(0, v) * 100) / 100
}
