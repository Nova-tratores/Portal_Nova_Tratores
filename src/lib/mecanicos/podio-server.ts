// Pódio dos meses (José, 20/10/2026): o pódio do mês só abre depois que a COMISSÃO daquele mês foi
// fechada no RH; dá para ver os meses anteriores (quem sempre ganha ou perde). SÓ SERVIDOR: aqui só o que
// a base do pós-vendas (que a tela já tem) não traz — comissão lançada no RH e pontos das ocorrências.
// Faturado, horas e OS de cada mês a tela calcula com montarPainel (só OS faturadas).
import { padronizadorOcorrencias, ocorrenciasEntre } from './ocorrencias-server'
import { comissoesRH } from './rh-server'
import { comCache } from './cache'
import { GRUPOS } from './painel'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somarMes = (m: string, n: number) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm - 1 + n, 1)).toISOString().slice(0, 7) }

/** Status do RH que contam como comissão FECHADA. */
export const STATUS_FECHADA = ['aprovada', 'lancada_omie', 'paga']

export interface MesPodio {
  mes: string
  /** comissão do mês fechada no RH (todas aprovadas/lançadas/pagas) */
  fechado: boolean
  /** técnicos com a comissão ainda em rascunho ou esperando aprovação */
  pendentes: string[]
  comissao: Record<string, { valor: number; status: string }>
  /** pontos descontados no mês (ocorrências que valem) */
  pontos: Record<string, number>
  ocorrencias: Record<string, number>
}

export async function podioMeses(n = 12, forcar = false): Promise<{ meses: MesPodio[] }> {
  const r = await comCache(`podio3:${n}`, 10 * 60_000, () => gerar(n), forcar)
  return r.dados
}

async function gerar(n: number) {
  const hoje = hojeSP(), atual = hoje.slice(0, 7)
  const lista = Array.from({ length: n }, (_, i) => somarMes(atual, -i))
  const { tecnicos, padronizar } = await padronizadorOcorrencias()
  const [rh, ocs] = await Promise.all([
    comissoesRH(lista, padronizar, tecnicos).catch(() => ({} as Awaited<ReturnType<typeof comissoesRH>>)),
    ocorrenciasEntre(`${lista[lista.length - 1]}-01`, hoje, padronizar).catch(() => []),
  ])
  const meses: MesPodio[] = lista.map((mes) => {
    const comissao: MesPodio['comissao'] = {}
    // só os mecânicos (Garantia/Outros — Vinicius, José Ortiz — não entram no pódio nem travam o fechamento)
    for (const [t, porMes] of Object.entries(rh)) if (porMes[mes] && !GRUPOS[t]) comissao[t] = porMes[mes]
    const pendentes = Object.entries(comissao).filter(([, c]) => !STATUS_FECHADA.includes(c.status)).map(([t]) => t)
    const pontos: Record<string, number> = {}, ocorrencias: Record<string, number> = {}
    for (const o of ocs) {
      if (!o.data.startsWith(mes) || GRUPOS[o.tecnico]) continue
      ocorrencias[o.tecnico] = (ocorrencias[o.tecnico] || 0) + 1
      if (o.vale) pontos[o.tecnico] = (pontos[o.tecnico] || 0) + o.pontos
    }
    return { mes, fechado: mes < atual && Object.keys(comissao).length > 0 && pendentes.length === 0, pendentes, comissao, pontos, ocorrencias }
  })
  return { meses }
}
