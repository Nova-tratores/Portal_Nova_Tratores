// Fita do tempo do Centro do Pós-Vendas (José, 16/10/2026) — regras puras.
// Navegação ENTRANDO nos períodos: a fita mostra os FILHOS do período escolhido.
//   topo (todos os anos) → barras = anos
//   ano escolhido        → barras = os 12 meses do ano
//   mês/semana/dia       → barras = os dias do mês, agrupados nas semanas (seg–dom)
// Clicar numa barra escolhe aquele período (e a fita desce um nível). A trilha volta.
import { periodos, segundaDa, somarDias, type Escala } from './painel'

export type NivelFita = 'anos' | 'meses' | 'dias'
export type PorDia = Record<string, [number, number, number]> // dia → [bruto, horas cobradas, nº OS]

export interface Soma { bruto: number; horas: number; os: number }
export interface BarraFita extends Soma {
  chave: string
  de: string
  ate: string
  rotulo: string        // completo (dica)
  curto: string         // embaixo da barra
  escala: Escala        // o que vira ao clicar
  futuro: boolean
  fimDeSemana?: boolean
}
export interface SemanaFita { de: string; ate: string; rotulo: string; ini: number; fim: number } // índices das barras do mês

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()

/** Dia a dia do faturamento a partir das OS faturadas da base. */
export function porDiaDe(faturadas: { data: string; bruto: number; horasCobradas: number }[]): PorDia {
  const m: PorDia = {}
  for (const o of faturadas) { const x = (m[o.data] ||= [0, 0, 0]); x[0] += o.bruto; x[1] += o.horasCobradas; x[2]++ }
  return m
}

/**
 * Leitura rápida (sem IA) para a faixa do Tratorilson não ficar vazia: semana e mês até hoje,
 * comparando o mês com o MESMO trecho do mês anterior (do dia 1 até o mesmo dia).
 */
export function leituraRapida(porDia: PorDia, hoje: string): { texto: string; variacao: number | null } {
  const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const seg = segundaDa(hoje)
  const sem = somar(porDia, seg, hoje)
  const ini = `${hoje.slice(0, 8)}01`
  const mes = somar(porDia, ini, hoje)
  const [a, m] = hoje.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const iniAnt = `${pa}-${String(pm).padStart(2, '0')}-01`
  const diaAnt = Math.min(Number(hoje.slice(8, 10)), ultimoDia(pa, pm))
  const ant = somar(porDia, iniAnt, `${iniAnt.slice(0, 8)}${String(diaAnt).padStart(2, '0')}`)
  const variacao = ant.bruto > 0 ? Math.round(((mes.bruto - ant.bruto) / ant.bruto) * 100) : null
  const nomeMes = MESES[m - 1], nomeAnt = MESES[pm - 1]
  const comp = variacao == null ? '' : ` — ${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao)}% contra o mesmo trecho de ${nomeAnt} (${reais(ant.bruto)})`
  return { texto: `Esta semana: ${reais(sem.bruto)} faturados em ${sem.os} OS. ${nomeMes[0].toUpperCase()}${nomeMes.slice(1)} até hoje: ${reais(mes.bruto)}${comp}.`, variacao }
}

/** Soma do dia a dia entre `de` e `ate` (inclusive). */
export function somar(porDia: PorDia, de: string, ate: string): Soma {
  const s = { bruto: 0, horas: 0, os: 0 }
  for (const [d, [b, h, n]] of Object.entries(porDia)) if (d >= de && d <= ate) { s.bruto += b; s.horas += h; s.os += n }
  s.horas = Math.round(s.horas * 10) / 10
  return s
}

export function nivelDa(escala: Escala, topo: boolean): NivelFita {
  return topo ? 'anos' : escala === 'ano' ? 'meses' : 'dias'
}

/** As barras do nível, a partir do período escolhido (`ref`). */
export function barrasFita(nivel: NivelFita, ref: string, porDia: PorDia, hoje: string, anoInicial: number): BarraFita[] {
  const ano = Number(ref.slice(0, 4)), mes = Number(ref.slice(5, 7))
  if (nivel === 'anos') {
    const fim = Number(hoje.slice(0, 4))
    return Array.from({ length: fim - anoInicial + 1 }, (_, i) => {
      const y = anoInicial + i, de = `${y}-01-01`, ate = `${y}-12-31`
      return { chave: String(y), de, ate, rotulo: String(y), curto: String(y), escala: 'ano' as Escala, futuro: de > hoje, ...somar(porDia, de, ate) }
    })
  }
  if (nivel === 'meses') {
    return MESES.map((nome, i) => {
      const m = String(i + 1).padStart(2, '0'), de = `${ano}-${m}-01`, ate = `${ano}-${m}-${String(ultimoDia(ano, i + 1)).padStart(2, '0')}`
      return { chave: de.slice(0, 7), de, ate, rotulo: `${nome} de ${ano}`, curto: nome.slice(0, 3), escala: 'mes' as Escala, futuro: de > hoje, ...somar(porDia, de, ate) }
    })
  }
  return Array.from({ length: ultimoDia(ano, mes) }, (_, i) => {
    const d = `${ano}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    const w = new Date(`${d}T12:00:00Z`).getUTCDay()
    const s = porDia[d]
    return { chave: d, de: d, ate: d, rotulo: `${SEMANA[w]} ${br(d)}`, curto: String(i + 1), escala: 'dia' as Escala, futuro: d > hoje, fimDeSemana: w === 0 || w === 6, bruto: s?.[0] || 0, horas: s?.[1] || 0, os: s?.[2] || 0 }
  })
}

/** Semanas (seg–dom) que tocam o mês, com os índices dos dias do mês que cada uma cobre. */
export function semanasDoMes(dias: BarraFita[]): SemanaFita[] {
  const out: SemanaFita[] = []
  dias.forEach((d, i) => {
    const seg = segundaDa(d.de)
    const ult = out[out.length - 1]
    if (ult && ult.de === seg) ult.fim = i
    else out.push({ de: seg, ate: somarDias(seg, 6), rotulo: `${br(seg)}–${br(somarDias(seg, 6))}`, ini: i, fim: i })
  })
  return out
}

export interface Passo { rotulo: string; escala: Escala | null; ref: string }

/** Trilha para voltar: Anos › 2026 › outubro › 12/10–18/10 › sex 16/10 (o último é o escolhido). */
export function trilha(escala: Escala, ref: string): Passo[] {
  const ano = ref.slice(0, 4), mes = Number(ref.slice(5, 7))
  const t: Passo[] = [{ rotulo: 'Anos', escala: null, ref }, { rotulo: ano, escala: 'ano', ref }]
  if (escala === 'ano') return t
  t.push({ rotulo: MESES[mes - 1], escala: 'mes', ref })
  if (escala === 'mes') return t
  const sem = periodos('semana', ref, 1)[0]
  t.push({ rotulo: `semana ${br(sem.de)}–${br(sem.ate)}`, escala: 'semana', ref })
  if (escala === 'semana') return t
  t.push({ rotulo: `${SEMANA[new Date(`${ref}T12:00:00Z`).getUTCDay()]} ${br(ref)}`, escala: 'dia', ref })
  return t
}
