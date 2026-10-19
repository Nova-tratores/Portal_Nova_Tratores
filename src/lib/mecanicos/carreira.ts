// Carreira do mecânico (José, 17/10/2026): divisões estilo jogo, de Ferro a Diamante.
//   Ferro 5 → Ferro 1 → Bronze 5 → … → Ouro 1 → Diamante  (21 degraus: nível 0 a 20)
// Regras escolhidas pelo José:
//   - cada MÊS LIMPO (nenhuma ocorrência valendo) sobe 1 degrau;
//   - mês com ocorrência DESCONTA pela gravidade e pode derrubar: cai 1 degrau a cada 10 pontos
//     descontados (arredondando para cima); RETORNO DE SERVIÇO pesa o dobro;
//   - o mês em andamento não conta ainda: a tela mostra o que acontece se fechar assim.
// Puro (sem banco) — testado em __tests__/carreira.test.ts.

export const DIVISOES = [
  { nome: 'Ferro', cor: '#64748b', fundo: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' },
  { nome: 'Bronze', cor: '#b45309', fundo: 'linear-gradient(135deg, #fde3c3, #c2783a)' },
  { nome: 'Prata', cor: '#475569', fundo: 'linear-gradient(135deg, #f8fafc, #a8b4c4)' },
  { nome: 'Ouro', cor: '#a16207', fundo: 'linear-gradient(135deg, #fef3c7, #eab308)' },
] as const
export const DIAMANTE = { nome: 'Diamante', cor: '#0891b2', fundo: 'linear-gradient(135deg, #cffafe, #22d3ee 45%, #a78bfa)' }
export const NIVEL_MAX = DIVISOES.length * 5 // 20 = Diamante
export const PONTOS_POR_QUEDA = 10
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

/** Quanto o mês move a carreira: +1 se limpo; senão −ceil(pontos/10). */
export function movimentoDoMes(pontos: number): number {
  return pontos <= 0 ? 1 : -Math.ceil(pontos / PONTOS_POR_QUEDA)
}

export interface MesCarreira { mes: string; pontos: number; qtd: number; antes: number; depois: number; movimento: number }

/**
 * Caminho mês a mês, a partir de `inicio` (YYYY-MM) até o mês ANTERIOR a `mesAtual`, começando em
 * Ferro 5. `porMes` = pontos (já pesados) e quantidade de ocorrências de cada mês.
 */
export function caminho(inicio: string, mesAtual: string, porMes: Record<string, { pontos: number; qtd: number }>): { meses: MesCarreira[]; nivel: number } {
  const meses: MesCarreira[] = []
  let nivel = 0
  for (let m = inicio; m < mesAtual; m = proximoMes(m)) {
    const x = porMes[m] || { pontos: 0, qtd: 0 }
    const mov = movimentoDoMes(x.pontos)
    const depois = Math.max(0, Math.min(NIVEL_MAX, nivel + mov))
    meses.push({ mes: m, pontos: x.pontos, qtd: x.qtd, antes: nivel, depois, movimento: depois - nivel })
    nivel = depois
  }
  return { meses, nivel }
}

export function proximoMes(m: string): string {
  const [a, mm] = m.split('-').map(Number)
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`
}

/** Linha da carreira de um técnico para a tela. */
export interface CarreiraTecnico {
  tecnico: string
  inicio: string
  nivel: number
  /** se o mês atual fechar como está: nível que fica */
  seFecharAssim: number
  mesAtual: { pontos: number; qtd: number }
  /** sequência de meses limpos seguidos até o mês passado */
  sequencia: number
  historico: MesCarreira[]
}

export function carreiraDe(tecnico: string, inicio: string, mesAtual: string, porMes: Record<string, { pontos: number; qtd: number }>): CarreiraTecnico {
  const c = caminho(inicio, mesAtual, porMes)
  const atual = porMes[mesAtual] || { pontos: 0, qtd: 0 }
  let seq = 0
  for (let i = c.meses.length - 1; i >= 0 && c.meses[i].pontos <= 0; i--) seq++
  return {
    tecnico, inicio, nivel: c.nivel, mesAtual: atual, sequencia: seq, historico: c.meses,
    seFecharAssim: Math.max(0, Math.min(NIVEL_MAX, c.nivel + movimentoDoMes(atual.pontos))),
  }
}
