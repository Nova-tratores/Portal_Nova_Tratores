// =============================================================================
// QR DA GARANTIA POR TRATOR — regras PURAS (testadas). Sem banco.
//
// Adesivo de 30 × 30 mm, um código por trator (todas as cópias iguais).
// Conteúdo do QR em MAIÚSCULAS: o QR usa o modo alfanumérico, que só tem
// maiúsculas — "HTTPS://PORTAL.NOVATRATORES.COM/GARANTIA/K7P2QX" (47 caracteres)
// cabe numa grade de 29 × 29 com a correção Q (25 % de dano). Um caractere a
// mais e a grade sobe para 33 × 33. O middleware leva /GARANTIA/ para /garantia/.
// =============================================================================

/** Sem 0/O, 1/I/L, 5/S, 8/B, Z: dá para ler e digitar sem confundir. */
export const ALFABETO_CODIGO = '234679ACDEFGHJKMNPQRTUVWXY';
export const TAMANHO_CODIGO = 6;
export const PREFIXO_QR = 'HTTPS://PORTAL.NOVATRATORES.COM/GARANTIA/';
export const CORRECAO_QR = 'Q' as const;

/** Medidas do adesivo (mm). 29 módulos × 0,875 mm = 25,375 mm: 7 pontos em 203 dpi. */
export const ADESIVO_MM = 30;
export const MODULO_MM = 0.875;

const RE_CODIGO = new RegExp(`^[${ALFABETO_CODIGO}]{${TAMANHO_CODIGO}}$`);

/** `aleatorio(n)` devolve inteiro em [0, n). No servidor: crypto.randomInt. */
export function gerarCodigo(aleatorio: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < TAMANHO_CODIGO; i++) s += ALFABETO_CODIGO[aleatorio(ALFABETO_CODIGO.length)];
  return s;
}

/** Normaliza o que veio na URL ("k7p2qx" → "K7P2QX"); inválido → null. */
export function normalizarCodigo(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return RE_CODIGO.test(s) ? s : null;
}

export function conteudoQR(codigo: string): string {
  return PREFIXO_QR + codigo;
}

/** Link "normal" para mostrar na tela (o QR leva a versão maiúscula). */
export function linkDoCodigo(codigo: string): string {
  return `https://portal.novatratores.com/garantia/${codigo}`;
}

/** Só o final do chassi vai para a página pública (o chassi inteiro não). */
export function finalPublico(chassis: string): string {
  return String(chassis ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4);
}

/**
 * Adesivo em SVG com medidas reais em mm (a gráfica abre no tamanho certo).
 * `modulos[l][c]` = true é quadradinho preto. Fundo branco; o QR fica no centro.
 */
export function svgAdesivo(modulos: boolean[][]): string {
  const n = modulos.length;
  const lado = n * MODULO_MM;
  const margem = (ADESIVO_MM - lado) / 2;
  if (margem < 0) throw new Error(`QR de ${n} módulos não cabe em ${ADESIVO_MM} mm`);
  const r = (x: number) => Math.round(x * 10000) / 10000;
  // um retângulo por sequência de pretos na linha: arquivo pequeno, sem frestas
  const partes: string[] = [];
  for (let l = 0; l < n; l++) {
    let c = 0;
    while (c < n) {
      if (!modulos[l][c]) { c++; continue; }
      let fim = c;
      while (fim + 1 < n && modulos[l][fim + 1]) fim++;
      partes.push(`M${r(margem + c * MODULO_MM)} ${r(margem + l * MODULO_MM)}h${r((fim - c + 1) * MODULO_MM)}v${MODULO_MM}h${r(-(fim - c + 1) * MODULO_MM)}z`);
      c = fim + 1;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${ADESIVO_MM}mm" height="${ADESIVO_MM}mm" viewBox="0 0 ${ADESIVO_MM} ${ADESIVO_MM}" shape-rendering="crispEdges"><rect width="${ADESIVO_MM}" height="${ADESIVO_MM}" fill="#ffffff"/><path fill="#000000" d="${partes.join('')}"/></svg>\n`;
}

/** Tira o que quebra o filtro do PostgREST (vírgula, parênteses, curingas). */
export function limparBusca(q: unknown): string {
  return String(q ?? '').replace(/[,()%*"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Horas de revisão registradas (texto do banco) → números únicos em ordem. */
export function revisoesFeitas(horas: unknown[]): number[] {
  const set = new Set<number>();
  for (const h of horas) {
    const n = Number(String(h ?? '').replace(/[^\d]/g, ''));
    if (Number.isFinite(n) && n > 0 && n <= 20000) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/** Lote de adesivos impressos antes de ter trator. */
export const LOTE_MAX = 500;

/** Quantidade pedida para o lote: inteiro entre 1 e LOTE_MAX, senão null. */
export function quantidadeLote(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= LOTE_MAX ? n : null;
}

/** Nome do lote pela hora de criação (fuso de Brasília): "L-20261112-1530". */
export function nomeLote(agora: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `L-${v('year')}${v('month')}${v('day')}-${v('hour')}${v('minute')}`;
}
