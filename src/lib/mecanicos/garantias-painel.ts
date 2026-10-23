// Garantias na Janela Mecânicos (bloco 04) — contas PURAS (José, 22/10/2026):
//  - período por Dia · Mês · Ano com setas (padrão = mês de hoje), sempre pela data de FECHAMENTO
//    (finalizada_em; sem ela, a última mexida) — a mesma data que o bloco já usava;
//  - destino das rejeitadas: "o que aconteceu com elas, se foi cobrado do cliente ou ficou para a gente
//    como despesa". Vem de garantias.cobranca_status (sql/add-cobranca-cliente.sql):
//      paga             → cobrado do cliente, pago
//      cobrada          → cobrado do cliente, a receber
//      nao_cobrar       → ficou como despesa da loja (cortesia decidida pelo garantista)
//      baixada_prejuizo → ficou como despesa da loja (cobrou e o cliente não pagou)
//      pendente / nao_aplicavel / vazio → sem definição

export type Escala = 'dia' | 'mes' | 'ano'
/** Janela [de, ate) em datas YYYY-MM-DD do horário de Brasília. */
export type Janela = { escala: Escala; ref: string; de: string; ate: string; rotulo: string }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (a: number, m: number, d: number) => `${a}-${p2(m)}-${p2(d)}`
function partes(ref: string) { const [a, m, d] = ref.slice(0, 10).split('-').map(Number); return { a, m: m || 1, d: d || 1 } }
function somaDias(ref: string, n: number) {
  const { a, m, d } = partes(ref)
  const x = new Date(Date.UTC(a, m - 1, d + n))
  return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate())
}

/** Data (YYYY-MM-DD) de Brasília de um timestamp ISO; data pura passa direto. */
export function diaBR(ts: string | null | undefined): string | null {
  if (!ts) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return ts.slice(0, 10) || null
  return new Date(t - 3 * 3_600_000).toISOString().slice(0, 10) // Brasília = UTC-3 (sem horário de verão)
}

export function janela(escala: Escala, ref: string): Janela {
  const { a, m, d } = partes(ref)
  if (escala === 'dia') {
    const de = iso(a, m, d)
    const sem = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
    return { escala, ref: de, de, ate: somaDias(de, 1), rotulo: `${sem}, ${p2(d)}/${p2(m)}/${a}` }
  }
  if (escala === 'mes') {
    return { escala, ref: iso(a, m, 1), de: iso(a, m, 1), ate: m === 12 ? iso(a + 1, 1, 1) : iso(a, m + 1, 1), rotulo: `${MESES[m - 1]} de ${a}` }
  }
  return { escala, ref: iso(a, 1, 1), de: iso(a, 1, 1), ate: iso(a + 1, 1, 1), rotulo: String(a) }
}

/** Anda `passo` dias/meses/anos a partir da janela. */
export function andar(j: Janela, passo: number): Janela {
  const { a, m } = partes(j.de)
  if (j.escala === 'dia') return janela('dia', somaDias(j.de, passo))
  if (j.escala === 'mes') { const t = a * 12 + (m - 1) + passo; return janela('mes', iso(Math.floor(t / 12), (t % 12) + 1, 1)) }
  return janela('ano', iso(a + passo, 1, 1))
}

/** Troca a escala mantendo o dia de referência (o de hoje, se ele cair dentro da janela atual). */
export function trocarEscala(j: Janela, escala: Escala, hoje: string): Janela {
  return janela(escala, dentro(hoje, j) ? hoje : j.de)
}

export function dentro(dia: string | null | undefined, j: Pick<Janela, 'de' | 'ate'>): boolean {
  return !!dia && dia >= j.de && dia < j.ate
}

/** A janela é a atual (contém hoje) — a seta "para frente" para aqui. */
export const ehAtual = (j: Janela, hoje: string) => dentro(hoje, j)

// ---------------------------------------------------------------------------
export type Destino = 'pago' | 'a_receber' | 'despesa' | 'sem_definicao'
export const DESTINOS: { k: Destino; rotulo: string; sub: string; cor: string }[] = [
  { k: 'pago', rotulo: 'Cobrado do cliente · pago', sub: 'o cliente já pagou', cor: '#047857' },
  { k: 'a_receber', rotulo: 'Cobrado do cliente · a receber', sub: 'cobrança lançada, esperando o pagamento', cor: '#0891b2' },
  { k: 'despesa', rotulo: 'Ficou como despesa da loja', sub: 'cortesia ou cobrança não recebida', cor: '#dc2626' },
  { k: 'sem_definicao', rotulo: 'Sem definição', sub: 'rejeitada e nada registrado na cobrança', cor: '#94a3b8' },
]

export function destinoRejeicao(cobrancaStatus: string | null | undefined): Destino {
  switch (cobrancaStatus) {
    case 'paga': return 'pago'
    case 'cobrada': return 'a_receber'
    case 'nao_cobrar': case 'baixada_prejuizo': return 'despesa'
    default: return 'sem_definicao'
  }
}

export const ROTULO_COBRANCA: Record<string, string> = {
  nao_aplicavel: 'não se aplica', nao_cobrar: 'não cobrar (cortesia — despesa da loja)', pendente: 'pendente (sem definição)',
  cobrada: 'cobrada do cliente (a receber)', paga: 'paga pelo cliente', baixada_prejuizo: 'baixada como prejuízo (despesa da loja)',
}

export type RejeitadaBase = { id: string; esperado: number; pago: number; cobranca: { status: string; valor: number } }

/** Valor negado pela fábrica (o que não foi pago do esperado). */
export const negado = (g: Pick<RejeitadaBase, 'esperado' | 'pago'>) => Math.max(0, (g.esperado || 0) - (g.pago || 0))

/** R$ de uma rejeitada no destino dela: cobrado = valor da cobrança (sem valor, o negado);
 *  despesa = o negado (baixada com valor de cobrança = esse valor); sem definição = o negado. */
export function valorNoDestino(g: RejeitadaBase): number {
  const d = destinoRejeicao(g.cobranca.status)
  const cob = g.cobranca.valor || 0
  if (d === 'pago' || d === 'a_receber') return cob > 0 ? cob : negado(g)
  if (g.cobranca.status === 'baixada_prejuizo' && cob > 0) return cob
  return negado(g)
}

export type FatiaDestino<T> = { k: Destino; rotulo: string; sub: string; cor: string; n: number; valor: number; itens: T[] }

/** Rejeitadas por destino (sempre as 4 fatias, na ordem de DESTINOS) + totais. `naoCobrado` = parte do valor
 *  negado que ficou de fora das cobranças (cobrou menos do que a fábrica negou). */
export function agruparPorDestino<T extends RejeitadaBase>(rej: T[]) {
  const fatias: FatiaDestino<T>[] = DESTINOS.map((d) => ({ ...d, n: 0, valor: 0, itens: [] }))
  let naoCobrado = 0
  for (const g of rej) {
    const k = destinoRejeicao(g.cobranca.status)
    const f = fatias.find((x) => x.k === k)!
    f.n++; f.valor += valorNoDestino(g); f.itens.push(g)
    if ((k === 'pago' || k === 'a_receber') && g.cobranca.valor > 0) naoCobrado += Math.max(0, negado(g) - g.cobranca.valor)
  }
  for (const f of fatias) f.valor = Math.round(f.valor * 100) / 100
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  return { fatias, n: rej.length, total: Math.round(total * 100) / 100, naoCobrado: Math.round(naoCobrado * 100) / 100 }
}
