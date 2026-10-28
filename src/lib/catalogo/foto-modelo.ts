// Foto do trator pelo MODELO, a partir do catálogo de peças (`catalogo_modelos.image_url`).
// PURO (testado em __tests__/foto-modelo.test.ts). O modelo chega escrito de vários jeitos
// ("6075E CAB", "6075 E", "6075E-BR-CAB PH2", "Mahindra Jivo", "9500S T3"); aqui vira o
// `slug` do catálogo. Modelo que o catálogo não tem (7095…) devolve null e quem chama
// usa a foto do produto (cadastro do Omie) ou o ícone.

/** slug do `catalogo_modelos` para o modelo escrito. null = o catálogo não tem. */
export function slugCatalogoDoModelo(texto: unknown): string | null {
  const t = String(texto ?? '').toUpperCase().replace(/MAHINDRA/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const p1 = /\bP(?:H)?1\b/.test(t);
  if (/\bJIVO\b/.test(t) || /^2025\b/.test(t)) return 'jivo-2025';
  if (/\b86[-\s]?110\b/.test(t)) return '86-110';
  if (/\b(8000|9500)S?\b/.test(t)) return '8000s-9500s';
  if (/\b6075\s?L\b/.test(t)) return '6075l';
  if (/\b6075/.test(t)) return p1 ? '6075-p1' : '6075-p2';
  if (/\b6065/.test(t)) return p1 ? '6065-p1-2' : '6065';
  if (/\b6060/.test(t)) return '6060-p2';
  if (/\b5050/.test(t)) return '5050';
  return null;
}

/** Fotos de modelo que o catálogo de peças ainda não tem, guardadas no mesmo storage
 *  (bucket `catalogo/modelo/`). 7095: foto oficial da Mahindra Brasil (27/10/2026). */
const FORA_DO_CATALOGO: [RegExp, string][] = [
  [/\b7095\b/, 'modelo/7095.png'],
  // 28/10/2026: OJA 3140 (foto oficial mahindratractor.com) e YTO ESK304 (foto de revenda no Brasil)
  [/\bOJA\b|\b3140\b/, 'modelo/oja-3140.png'],
  [/\bYTO\b|\bE?SK-?304\b/, 'modelo/yto-esk304.jpg'],
];
/** Caminho no bucket `catalogo` da foto de um modelo fora do catálogo; null = não tem. */
export function fotoForaDoCatalogo(texto: unknown): string | null {
  const t = String(texto ?? '').toUpperCase();
  return FORA_DO_CATALOGO.find(([re]) => re.test(t))?.[1] ?? null;
}
