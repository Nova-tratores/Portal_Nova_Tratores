// Parse do conteúdo do QR de uma unidade rastreada — puro (testável).
// O QR carrega a URL /p/<uuid>; aceita também o uuid cru digitado/colado.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Extrai o uuid da unidade do texto do QR: aceita o link completo
 *  (qualquer origin — etiqueta impressa em dev continua válida) ou uuid cru. */
export function extrairUnidadeId(texto: string): string | null {
  const s = String(texto || '').trim()
  const link = s.match(new RegExp(`/p/(${UUID_RE.source})`, 'i'))
  if (link) return link[1].toLowerCase()
  const cru = s.match(new RegExp(`^(${UUID_RE.source})$`, 'i'))
  return cru ? cru[1].toLowerCase() : null
}
