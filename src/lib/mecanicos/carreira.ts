// Carreira do mecânico: divisões estilo jogo, de Ferro a Diamante.
//   Ferro 5 → Ferro 1 → Bronze 5 → … → Ouro 1 → Diamante  (21 degraus: nível 0 a 20)
// Regra por PONTOS (José, 22/10/2026 — antes era +1 degrau por mês limpo):
//   - cada OS fechada SEM problema (sem ocorrência valendo e sem pendência) dá 5 pontos a cada
//     técnico da OS;
//   - cada ocorrência que vale DESCONTA os pontos dela; RETORNO DE SERVIÇO pesa o dobro;
//   - o saldo nunca fica abaixo de zero; cada 50 pontos de saldo = 1 degrau (José, 23/10/2026: com 100
//     ninguém saía do Ferro — o Gabriel, com 368, era Ferro 2);
//   - "nível" = saldo até o fim do mês passado; "se fechar assim" = contando o mês em andamento.
// Puro (sem banco) — testado em __tests__/carreira.test.ts.

export const DIVISOES = [
  { nome: 'Ferro', cor: '#64748b', fundo: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' },
  { nome: 'Bronze', cor: '#b45309', fundo: 'linear-gradient(135deg, #fde3c3, #c2783a)' },
  { nome: 'Prata', cor: '#475569', fundo: 'linear-gradient(135deg, #f8fafc, #a8b4c4)' },
  { nome: 'Ouro', cor: '#a16207', fundo: 'linear-gradient(135deg, #fef3c7, #eab308)' },
] as const
export const DIAMANTE = { nome: 'Diamante', cor: '#0891b2', fundo: 'linear-gradient(135deg, #cffafe, #22d3ee 45%, #a78bfa)' }
export const NIVEL_MAX = DIVISOES.length * 5 // 20 = Diamante
/** pontos que cada OS fechada sem problema dá ao técnico (escolha do José, 22/10/2026) */
export const PONTOS_POR_OS = 5
/** saldo de pontos para subir 1 degrau */
export const PONTOS_POR_DEGRAU = 50
export const PESO_RETORNO = 2

export interface Patente { nivel: number; divisao: string; sub: number | null; nome: string; cor: string; fundo: string }

/** Nível 0..20 → "Ferro 5" … "Ouro 1", "Diamante". */
export function patente(nivel: number): Patente {
  const n = Math.max(0, Math.min(NIVEL_MAX, Math.round(nivel)))
  if (n >= NIVEL_MAX) return { nivel: n, divisao: DIAMANTE.nome, sub: null, nome: DIAMANTE.nome, cor: DIAMANTE.cor, fundo: DIAMANTE.fundo }
  const d = DIVISOES[Math.floor(n / 5)]
  const sub = 5 - (n % 5)
  return { nivel: n, divisao: d.nome, sub, nome: `${d.nome} ${sub}`, cor: d.cor, fundo: d.fundo }
}

/** Pontos de uma ocorrência que contam na carreira (retorno de serviço vale o dobro). */
export function pesoOcorrencia(o: { pontos: number; vale: boolean; subcategoria?: string | null }): number {
  if (!o.vale) return 0
  return o.subcategoria === 'retorno_servico' ? o.pontos * PESO_RETORNO : o.pontos
}

/** Degrau do saldo de pontos: 50 pontos = 1 degrau, até o Diamante. */
export function nivelDoSaldo(saldo: number): number {
  return Math.max(0, Math.min(NIVEL_MAX, Math.floor(Math.max(0, saldo) / PONTOS_POR_DEGRAU)))
}

/** O que entra de cada mês: pontos já pesados das ocorrências que valem, quantas foram, e as OS limpas. */
export interface MesEntrada { pontos: number; qtd: number; osLimpas?: number }

export interface MesCarreira {
  mes: string
  /** pontos descontados (já pesados) */
  pontos: number
  qtd: number
  /** OS fechadas sem problema no mês e os pontos que deram */
  osLimpas: number
  ganhos: number
  saldoAntes: number
  saldo: number
  antes: number
  depois: number
  movimento: number
}

/** Um mês aplicado sobre o saldo (nunca abaixo de zero). */
function aplicar(mes: string, saldo: number, x: MesEntrada): MesCarreira {
  const osLimpas = x.osLimpas || 0, ganhos = osLimpas * PONTOS_POR_OS
  const novo = Math.max(0, saldo + ganhos - x.pontos)
  const antes = nivelDoSaldo(saldo), depois = nivelDoSaldo(novo)
  return { mes, pontos: x.pontos, qtd: x.qtd, osLimpas, ganhos, saldoAntes: saldo, saldo: novo, antes, depois, movimento: depois - antes }
}

/**
 * Caminho mês a mês, de `inicio` (YYYY-MM) até o mês ANTERIOR a `mesAtual`, começando com saldo 0 (Ferro 5).
 */
export function caminho(inicio: string, mesAtual: string, porMes: Record<string, MesEntrada>): { meses: MesCarreira[]; nivel: number; saldo: number } {
  const meses: MesCarreira[] = []
  let saldo = 0
  for (let m = inicio; m < mesAtual; m = proximoMes(m)) {
    const r = aplicar(m, saldo, porMes[m] || { pontos: 0, qtd: 0 })
    meses.push(r)
    saldo = r.saldo
  }
  return { meses, nivel: nivelDoSaldo(saldo), saldo }
}

export function proximoMes(m: string): string {
  const [a, mm] = m.split('-').map(Number)
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`
}

/** Linha da carreira de um técnico para a tela. */
export interface CarreiraTecnico {
  tecnico: string
  inicio: string
  /** degrau com os meses fechados */
  nivel: number
  /** saldo de pontos até o fim do mês passado */
  saldo: number
  /** se o mês atual fechar como está: degrau e saldo */
  seFecharAssim: number
  saldoAgora: number
  /** mês em andamento: descontos (já pesados), quantidade de ocorrências, OS limpas e pontos ganhos */
  mesAtual: { pontos: number; qtd: number; osLimpas: number; ganhos: number }
  /** OS limpas na carreira toda (com o mês atual) */
  osLimpasTotal: number
  /** meses seguidos sem ocorrência até o mês passado */
  sequencia: number
  /** quanto falta de saldo para o próximo degrau (0 no Diamante) */
  faltaProximo: number
  historico: MesCarreira[]
}

export function carreiraDe(tecnico: string, inicio: string, mesAtual: string, porMes: Record<string, MesEntrada>): CarreiraTecnico {
  const c = caminho(inicio, mesAtual, porMes)
  const x = porMes[mesAtual] || { pontos: 0, qtd: 0 }
  const agora = aplicar(mesAtual, c.saldo, x)
  let seq = 0
  for (let i = c.meses.length - 1; i >= 0 && c.meses[i].qtd <= 0; i--) seq++
  const nAgora = nivelDoSaldo(agora.saldo)
  return {
    tecnico, inicio, nivel: c.nivel, saldo: c.saldo, seFecharAssim: nAgora, saldoAgora: agora.saldo,
    mesAtual: { pontos: x.pontos, qtd: x.qtd, osLimpas: agora.osLimpas, ganhos: agora.ganhos },
    osLimpasTotal: c.meses.reduce((s2, m) => s2 + m.osLimpas, 0) + agora.osLimpas,
    sequencia: seq, historico: c.meses,
    faltaProximo: nAgora >= NIVEL_MAX ? 0 : (nAgora + 1) * PONTOS_POR_DEGRAU - agora.saldo,
  }
}

/** Chave da OS para casar portal × Omie × ocorrência: sem "OS-", sem "OMIE", sem zeros à esquerda. */
export function chaveOS(v: unknown): string {
  return String(v ?? '').trim().replace(/^OS-?/i, '').replace(/^OMIE\s*/i, '').replace(/^0+(?=\d)/, '')
}

/**
 * OS limpas por técnico e mês (mês = data em que a OS fechou/faturou). Uma OS é "com problema" quando o nº
 * do portal OU o do Omie está em `comProblema` (ocorrência valendo ou pendência). Cada técnico da OS conta 1.
 */
export function contarOSLimpas(
  os: { os: string; numeroOmie: string | null; data: string; tecnicos: string[] }[],
  comProblema: Set<string>,
): Record<string, Record<string, number>> {
  const r: Record<string, Record<string, number>> = {}
  const vistas = new Set<string>()
  for (const o of os) {
    const ks = [chaveOS(o.os), chaveOS(o.numeroOmie)].filter(Boolean)
    const id = ks[0] || ''
    if (!id || vistas.has(id)) continue
    vistas.add(id)
    if (ks.some((k) => comProblema.has(k))) continue
    const mes = o.data.slice(0, 7)
    for (const t of new Set(o.tecnicos)) { const m = (r[t] ||= {}); m[mes] = (m[mes] || 0) + 1 }
  }
  return r
}
