// Segunda camada de proteção contra duplicados na importação do CSV.
//
// A primeira camada é o índice único do banco (placa + data_transacao +
// litros, ON CONFLICT DO NOTHING): reenviar o MESMO arquivo não duplica nada
// — verificado em produção em 02/09/2026 (probe de reenvio: 0 inseridos;
// zero duplicatas nas 1.235 linhas).
//
// O furo que esta camada fecha: a operadora reexporta o relatório com uma
// CORREÇÃO (litros ajustados, hora deslocada) — a chave muda e a MESMA
// transação entraria de novo. O código de AUTORIZAÇÃO da operadora é a
// identidade real da transação, então linha cuja autorização já está no banco
// (ou repetida dentro do próprio arquivo) é pulada e contada como duplicada.
//
// Por que em código e NÃO como segundo índice único no banco: o insert usa
// ON CONFLICT na chave placa+data+litros; violar um OUTRO índice não cai no
// DO NOTHING — aborta o chunk inteiro com erro pro usuário. A checagem aqui
// filtra antes e mantém o erro impossível. Nota: ~44% dos registros antigos
// vieram SEM autorização — esses seguem protegidos só pela chave do índice.
//
// PURO: sem import de servidor, testável no vitest.

export interface ComAutorizacao {
  autorizacao?: string | null
}

const norm = (a: unknown) => String(a ?? '').trim()

/** Autorizações não-vazias de um conjunto de linhas (pra consultar o banco). */
export function autorizacoesDe(linhas: ComAutorizacao[]): string[] {
  const out = new Set<string>()
  for (const l of linhas) {
    const a = norm(l.autorizacao)
    if (a) out.add(a)
  }
  return [...out]
}

export interface ResultadoSeparacao<T> {
  aceitas: T[]
  /** puladas por autorização já existente no banco ou repetida no arquivo */
  puladas: T[]
}

/**
 * Separa as linhas do arquivo: entra quem tem autorização inédita (ou nenhuma);
 * fica de fora quem repete uma autorização já no banco OU já aceita neste mesmo
 * arquivo. Linha sem autorização NUNCA é pulada aqui — a proteção dela é a
 * chave única do banco.
 */
export function separarPorAutorizacao<T extends ComAutorizacao>(
  linhas: T[],
  existentesNoBanco: Iterable<string>,
): ResultadoSeparacao<T> {
  const vistas = new Set<string>()
  for (const a of existentesNoBanco) {
    const n = norm(a)
    if (n) vistas.add(n)
  }
  const aceitas: T[] = []
  const puladas: T[] = []
  for (const l of linhas) {
    const a = norm(l.autorizacao)
    if (a && vistas.has(a)) {
      puladas.push(l)
      continue
    }
    if (a) vistas.add(a)
    aceitas.push(l)
  }
  return { aceitas, puladas }
}

// ── detalhamento das duplicadas (pedido do usuário: VER quais foram e poder
//    substituir pelo valor corrigido do arquivo) ────────────────────────────

/** Chave do índice único do banco. `litros` normalizado por VALOR (10.0 = 10.000). */
export function chaveAbastecimento(l: { placa?: unknown; data_transacao?: unknown; litros?: unknown }): string {
  return `${String(l.placa ?? '').trim().toUpperCase()}|${String(l.data_transacao ?? '')}|${Number(l.litros)}`
}

export interface CampoDiferente { campo: string; rotulo: string; de: string; para: string }

const CAMPOS_COMPARADOS: { campo: string; rotulo: string; numerico?: boolean }[] = [
  { campo: 'data_transacao', rotulo: 'Data/hora' },
  { campo: 'litros', rotulo: 'Litros', numerico: true },
  { campo: 'valor_total', rotulo: 'Valor pago', numerico: true },
  { campo: 'valor_unitario', rotulo: 'Preço/L', numerico: true },
  { campo: 'combustivel', rotulo: 'Combustível' },
  { campo: 'hodometro', rotulo: 'Hodômetro', numerico: true },
  { campo: 'posto_nome', rotulo: 'Posto' },
  { campo: 'motorista_nome', rotulo: 'Motorista' },
]

/**
 * O que mudou entre o registro JÁ importado e a linha do arquivo. Lista vazia
 * = linhas idênticas no que importa (não há o que substituir). Números
 * comparados por VALOR — "45.5" e 45.50 não são diferença.
 */
export function diferencasEntre(
  existente: Record<string, unknown>,
  linha: Record<string, unknown>,
): CampoDiferente[] {
  const out: CampoDiferente[] = []
  for (const c of CAMPOS_COMPARADOS) {
    const de = existente[c.campo]
    const para = linha[c.campo]
    const iguais = c.numerico
      ? (de == null && para == null) || (de != null && para != null && Number(de) === Number(para))
      : String(de ?? '').trim() === String(para ?? '').trim()
    if (!iguais) {
      out.push({ campo: c.campo, rotulo: c.rotulo, de: String(de ?? '—'), para: String(para ?? '—') })
    }
  }
  return out
}
