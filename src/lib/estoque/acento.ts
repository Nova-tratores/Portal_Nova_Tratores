// Texto do Omie que chega com a codificação dobrada (UTF-8 lido como Latin-1): "PeÃ§as" em vez de "Peças",
// "VagÃµes", "PrecisÃ£o". Achado em 09/11/2026: 10.287 produtos com a família assim e o painel do Visual
// Estoque mostrando 0 peças (procura "Peças").
// Só troca quando dá para desfazer sem perder nada — "REVISÃO" (já certo) continua igual.
export function consertarAcento(texto: string): string
export function consertarAcento(texto: string | null | undefined): string | null | undefined
export function consertarAcento(texto: string | null | undefined) {
  if (!texto || !/[ÃÂ]/.test(texto)) return texto
  // todo caractere precisa caber em 1 byte (senão não é o caso de codificação dobrada)
  if ([...texto].some((c) => c.charCodeAt(0) > 0xff)) return texto
  const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)))
  let novo: string
  try { novo = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return texto }
  return novo !== texto ? novo : texto
}
