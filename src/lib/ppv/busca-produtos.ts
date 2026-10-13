// Busca de produtos por texto livre (PostgREST) — PURA.
// Cada palavra precisa aparecer no código OU na descrição (todas as palavras,
// em qualquer ordem). Acento não importa ("óleo" acha "OLEO") e vírgula,
// parênteses e aspas — que quebram o filtro or=/and= do PostgREST — viram espaço.
// Antes (até 13/10/2026) o termo ia cru com "%" no lugar do espaço: "filtro oleo"
// derrubava a consulta (o "%" vira código de URL) e "rolamento 6205" não achava nada.

/** Tira acento: "Óleo Hidráulico" → "Oleo Hidraulico". */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Palavras da busca, já limpas (sem acento, sem caracteres que quebram o filtro). */
export function palavrasBusca(termo: string): string[] {
  return semAcento(String(termo || ''))
    .replace(/[,()"'*\\:]/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6)
}

/**
 * Parâmetro de filtro PostgREST (já codificado para a URL), ou "" sem busca.
 * Ex.: "filtro óleo" → and=(or(codigo.ilike.*filtro*,descricao.ilike.*filtro*),or(...oleo...))
 */
export function filtroBuscaProdutos(termo: string, colunas: string[] = ['codigo', 'descricao']): string {
  const palavras = palavrasBusca(termo)
  if (!palavras.length) return ''
  const grupo = (p: string) => `or(${colunas.map((c) => `${c}.ilike.*${p}*`).join(',')})`
  return `and=${encodeURIComponent(`(${palavras.map(grupo).join(',')})`)}`
}
