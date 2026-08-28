// Grau de perigo de uma pendência da frota.
//
// Por que isto existe: "farol queimado" e "volante que perde a firmeza a
// 140 km/h" hoje contam igual na lista de pendências abertas — o carro com sete
// itens leves parece pior que o carro com um item que mata. A gravidade separa
// os dois e permite contar por carro.
//
// Regra de preenchimento (decidida com o usuário): a gravidade NASCE sugerida
// pelo componente da taxonomia e pode ser corrigida na hora, inclusive nas
// pendências que o sistema abre sozinho (checklist, requisição, OS).
//
// Módulo PURO: sem import de servidor, roda no vitest.

export type Gravidade = 'leve' | 'media' | 'grave' | 'critica'

export const GRAVIDADES: Gravidade[] = ['leve', 'media', 'grave', 'critica']

export const GRAVIDADE_LABEL: Record<Gravidade, string> = {
  leve: 'Leve',
  media: 'Média',
  grave: 'Grave',
  critica: 'Crítica',
}

/** Explica o critério — é o texto que aparece ao escolher, pra não virar gosto pessoal. */
export const GRAVIDADE_AJUDA: Record<Gravidade, string> = {
  leve: 'Incomoda ou desgasta, não afeta a segurança. Pode esperar a próxima manutenção.',
  media: 'Atrapalha o uso ou piora se demorar. Resolver nas próximas semanas.',
  grave: 'Afeta a segurança ou pode deixar o carro na estrada. Resolver com prioridade.',
  critica: 'Risco de acidente: o carro NÃO deveria rodar até resolver.',
}

export const GRAVIDADE_COR: Record<Gravidade, { bg: string; cor: string; forte: string }> = {
  leve: { bg: '#f1f5f9', cor: '#475569', forte: '#94a3b8' },
  media: { bg: '#fef3c7', cor: '#92400e', forte: '#f59e0b' },
  grave: { bg: '#ffedd5', cor: '#9a3412', forte: '#f97316' },
  critica: { bg: '#fee2e2', cor: '#991b1b', forte: '#dc2626' },
}

/** Ordem de urgência (crítica primeiro) — usada pra ordenar listas e escolher a cor do sistema. */
export const PESO: Record<Gravidade, number> = { critica: 4, grave: 3, media: 2, leve: 1 }

export function ehGravidade(v: unknown): v is Gravidade {
  return typeof v === 'string' && (GRAVIDADES as string[]).includes(v)
}

/**
 * Sugestão por SISTEMA da taxonomia.
 *
 * Nenhum padrão é "crítica" de propósito: crítica quer dizer "não rode com este
 * carro", e isso é decisão de quem viu o problema, não de uma tabela. Um
 * componente de freio pode estar com desgaste normal (média) ou sem pastilha
 * nenhuma (crítica) — o mesmo componente, riscos diferentes.
 */
const POR_SISTEMA: Record<string, Gravidade> = {
  'Freios': 'grave',
  'Direção': 'grave',
  'Itens de segurança': 'grave',
  'Suspensão': 'media',
  'Rodas e Pneus': 'media',
  'Motor': 'media',
  'Transmissão': 'media',
  'Elétrica': 'media',
  'Ar-condicionado': 'leve',
  'Carroceria': 'leve',
  'Interior': 'leve',
  'Outros': 'media',
}

/**
 * Ajustes por PALAVRA do componente/subsistema, quando o sistema sozinho erra
 * demais. Ex.: "Tapetes e forrações" é Interior (leve) e continua leve; "Cinto
 * de segurança" é Interior no cadastro mas é item de vida.
 */
const POR_PALAVRA: { termos: string[]; gravidade: Gravidade }[] = [
  { termos: ['cinto', 'airbag', 'freio de mão', 'freio de mao'], gravidade: 'grave' },
  { termos: ['pneu', 'roda', 'estepe'], gravidade: 'grave' },
  { termos: ['farol', 'lanterna', 'seta', 'pisca', 'luz de freio'], gravidade: 'media' },
  { termos: ['tapete', 'forração', 'forracao', 'porta-copo', 'estética', 'estetica'], gravidade: 'leve' },
]

// A faixa dentro dos colchetes são as marcas de acento combinantes
// (U+0300–U+036F), escritas como caracteres — é o mesmo padrão do resto do
// projeto. São INVISÍVEIS no editor e uma ferramenta que corrompa o arquivo as
// quebraria sem aviso, então o teste de gravidade exercita "Direção" e
// "forração" de propósito: se a faixa se perder, ele acusa.
const semAcento = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Gravidade sugerida para um componente da taxonomia. */
export function gravidadePadrao(c: {
  sistema?: string | null
  subsistema?: string | null
  componente?: string | null
} | null | undefined): Gravidade {
  if (!c) return 'media' // sem componente classificado: meio-termo, nunca "leve"
  const texto = semAcento(`${c.subsistema || ''} ${c.componente || ''}`)
  for (const regra of POR_PALAVRA) {
    if (regra.termos.some((t) => texto.includes(semAcento(t)))) return regra.gravidade
  }
  return POR_SISTEMA[String(c.sistema || '')] || 'media'
}

/**
 * Gravidade EFETIVA de uma pendência: o que ficou gravado nela manda; sem isso,
 * cai no padrão do componente. Pendência antiga (anterior à migração) continua
 * aparecendo classificada, sem precisar de backfill.
 */
export function gravidadeDaPendencia(
  pend: { gravidade?: string | null; componente_id?: string | null },
  componentesPorId?: Map<string, { sistema?: string | null; subsistema?: string | null; componente?: string | null }>,
): Gravidade {
  if (ehGravidade(pend.gravidade)) return pend.gravidade
  const c = pend.componente_id ? componentesPorId?.get(pend.componente_id) : null
  return gravidadePadrao(c)
}

export interface ContagemGravidade {
  leve: number
  media: number
  grave: number
  critica: number
  total: number
  /** a mais urgente presente (null quando não há nenhuma) */
  pior: Gravidade | null
}

/** Conta as pendências por gravidade — é o placar por carro. */
export function contarPorGravidade(
  pends: { gravidade?: string | null; componente_id?: string | null }[],
  componentesPorId?: Map<string, { sistema?: string | null; subsistema?: string | null; componente?: string | null }>,
): ContagemGravidade {
  const out: ContagemGravidade = { leve: 0, media: 0, grave: 0, critica: 0, total: 0, pior: null }
  for (const p of pends) {
    const g = gravidadeDaPendencia(p, componentesPorId)
    out[g] += 1
    out.total += 1
    if (!out.pior || PESO[g] > PESO[out.pior]) out.pior = g
  }
  return out
}

/** Ordena da mais urgente pra menos (empate mantém a ordem de entrada). */
export function ordenarPorGravidade<T extends { gravidade?: string | null; componente_id?: string | null }>(
  pends: T[],
  componentesPorId?: Map<string, { sistema?: string | null; subsistema?: string | null; componente?: string | null }>,
): T[] {
  return [...pends].sort(
    (a, b) => PESO[gravidadeDaPendencia(b, componentesPorId)] - PESO[gravidadeDaPendencia(a, componentesPorId)],
  )
}
