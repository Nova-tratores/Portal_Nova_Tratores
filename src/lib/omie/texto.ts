// A API da Omie devolve textos ESCAPADOS em HTML na saída (12" vira 12&quot;,
// O'RING vira O&apos;RING), mas armazena e espera texto puro. Toda leitura de
// texto vindo da API deve passar por aqui antes de exibir/comparar/regravar.
// (Gravar o texto escapado de volta faz a Omie armazenar &quot; LITERAL —
// aconteceu na 1ª rodada da cópia descricao→descr_detalhada em 14/07/2026.)
export function decodeOmieTexto(s: unknown): string {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}
