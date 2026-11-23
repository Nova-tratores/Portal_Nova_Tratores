// =============================================================================
// MARKETING — categoria SUGERIDA do custo que vem de um documento (Requisição,
// conta a pagar). Lib PURA, testada em __tests__/categorizar.test.ts.
//
// Antes (até 23/11/2026) todo custo importado caía em "Outro": o "FRETE DE
// TRATORES" de R$ 1.500 do IRRIGASHOW não aparecia como frete.
//
// Ordem de confiança:
//   1. a DESCRIÇÃO (o que foi comprado — "ALMOÇO" no posto é alimentação);
//   2. o TIPO da requisição, que uma pessoa escolheu (Alimentação, Combustível…);
//   3. o FORNECEDOR (um "AUTO POSTO" sem descrição útil é combustível).
// A categoria fica marcada como "sugerida" até alguém confirmar na tela.
// =============================================================================
import type { CategoriaCusto } from './tipos';

type Regra = { cat: CategoriaCusto; re: RegExp };

// Ordem importa: frete antes de pessoal ("fretes ... + diária" é frete).
const REGRAS: Regra[] = [
  { cat: 'frete',       re: /\bfrete|munck|caminh[aã]o|carreta|guincho|reboque/ },
  { cat: 'hospedagem',  re: /hotel|pousada|hosped|hostel/ },
  { cat: 'alimentacao', re: /almo[cç]|alimenta|refei[cç]|lanche|jantar|restaurante|marmit|consumo|bebida|churrasc|padaria|caf[eé] da manh/ },
  { cat: 'combustivel', re: /combust|abastec|gasolina|diesel|etanol|\bposto\b/ },
  { cat: 'impresso',    re: /gr[aá]fica|banner|impress|panfleto|folder|adesivo|cart[aã]o de visita|flyer/ },
  { cat: 'brinde',      re: /brinde|camiseta|\bbon[eé]s?\b|caneta|chaveiro|squeeze/ },
  { cat: 'montagem',    re: /montagem|desmontagem|\blona|tenda|gazebo/ },
  { cat: 'locacao',     re: /loca[cç][aã]o|aluguel/ },
  { cat: 'midia',       re: /an[uú]ncio|r[aá]dio|jornal|outdoor|impulsion|tr[aá]fego pago|google ads|meta ads/ },
  { cat: 'patrocinio',  re: /patroc/ },
  { cat: 'pessoal',     re: /di[aá]ria|ajuda de custo|hora extra|freelan|recepcionista|promotor/ },
  { cat: 'estande',     re: /estande|\bstand\b/ },
];

/** Tipo da requisição (escolhido por uma pessoa no módulo Requisições) → categoria. */
const POR_TIPO_REQUISICAO: Record<string, CategoriaCusto> = {
  alimentacao: 'alimentacao',
  combustivel: 'combustivel',
  hospedagem: 'hospedagem',
  frete: 'frete',
  brindes: 'brinde',
  brinde: 'brinde',
  grafica: 'impresso',
  publicidade: 'midia',
};

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// as regras são escritas com acento opcional ([aã]); comparar no texto sem acento e com acento dá no mesmo
const casa = (texto: string): CategoriaCusto | null => {
  if (!texto.trim()) return null;
  const t = texto.toLowerCase();
  const sem = norm(texto);
  for (const r of REGRAS) if (r.re.test(t) || r.re.test(sem)) return r.cat;
  return null;
};

export function sugerirCategoria(doc: { descricao?: unknown; tipoRequisicao?: unknown; fornecedor?: unknown }): CategoriaCusto {
  return (
    casa(String(doc.descricao ?? '')) ??
    POR_TIPO_REQUISICAO[norm(doc.tipoRequisicao).replace(/[^a-z]/g, '')] ??
    casa(String(doc.fornecedor ?? '')) ??
    'outro'
  );
}
