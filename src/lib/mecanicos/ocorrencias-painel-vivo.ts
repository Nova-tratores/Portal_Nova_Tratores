// Radar de Ocorrências do pós-vendas — a conta do mês (antes dentro de /api/mecanicos/ocorrencias-painel).
// Fica guardada (comCache): a tela abre na hora com o último resultado e ele se refaz por trás; o robô do
// painel deixa o mês atual pronto (José, 22/10/2026: "deixa ela já carregada").
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { padronizadorOcorrencias, ocorrenciasEntre, COLS_OCORRENCIA as COLS } from '@/lib/mecanicos/ocorrencias-server'
import { paraOcorrencia, escudos, motivos, limitesMes, mesesAte, historicoPorPessoa, CATS, type Cat } from '@/lib/mecanicos/ocorrencias-painel'
import { comCache, esquecer } from '@/lib/mecanicos/cache'

export const mesSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
const PREFIXO = 'ocpainel:'
const VALIDADE_MS = 2 * 60_000

export async function montarOcorrenciasPainel(mes: string) {
  const meses = mesesAte(mes, 6)
  const [de] = limitesMes(meses[0])
  const [ini, fim] = limitesMes(mes)
  const [{ tecnicos, padronizar }, rPend] = await Promise.all([
    padronizadorOcorrencias(),
    sb.from('tecnico_justificativas').select('id_ocorrencia').eq('status', 'pendente').not('id_ocorrencia', 'is', null).limit(500),
  ])
  // só técnicos (José, 17/10/2026: "outro dia a gente faz de todos os usuários")
  const ehTec = new Set(tecnicos)
  const janela = (await ocorrenciasEntre(de, fim, padronizar)).filter((o) => ehTec.has(o.tecnico))

  // defesas pendentes de ocorrências fora da janela de 6 meses também entram na fila
  const idsPend = [...new Set(((rPend.data || []) as { id_ocorrencia: number }[]).map((j) => j.id_ocorrencia))]
  const naJanela = new Set(janela.map((o) => o.id))
  const faltam = idsPend.filter((id) => !naJanela.has(id))
  let antigas: typeof janela = []
  if (faltam.length) {
    const r = await sb.from('tecnico_ocorrencias').select(COLS).in('id', faltam)
    antigas = (r.data || []).map((o) => paraOcorrencia(o as Record<string, unknown>, padronizar)).filter((o) => ehTec.has(o.tecnico))
  }

  const doMes = janela.filter((o) => o.data >= ini && o.data <= fim)
  const linhas = escudos(doMes, tecnicos)
  const serie = meses.map((m) => {
    const [a, b] = limitesMes(m)
    const porCat = Object.fromEntries(CATS.map((c) => [c, 0])) as Record<Cat, number>
    let qtd = 0
    for (const o of janela) if (o.data >= a && o.data <= b && o.vale) { porCat[o.categoria] += o.pontos; qtd++ }
    return { mes: m, qtd, ...porCat }
  })
  // antigas × atuais: mês a mês por pessoa + média dos meses anteriores
  const historico = historicoPorPessoa(janela, meses, tecnicos)

  const pendentes = [...janela, ...antigas]
    .filter((o) => o.defesas.some((d) => d.status === 'pendente'))
    .sort((a, b) => {
      const da = a.defesas.find((d) => d.status === 'pendente')?.criadaEm || ''
      const db = b.defesas.find((d) => d.status === 'pendente')?.criadaEm || ''
      return da.localeCompare(db)
    })

  return { mes, periodo: { de: ini, ate: fim }, ocorrencias: doMes, linhas, motivos: motivos(doMes), serie, pendentes, meses, historico }
}

export function ocorrenciasPainelComCache(mes: string, forcar = false) {
  return comCache(PREFIXO + mes, VALIDADE_MS, () => montarOcorrenciasPainel(mes), forcar)
}

/** Julgou uma defesa: a próxima leitura refaz a conta (não mostra o julgamento velho). */
export function esquecerOcorrenciasPainel() {
  return esquecer([PREFIXO])
}
