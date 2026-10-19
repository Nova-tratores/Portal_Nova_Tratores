// ============================================================================
// Máquina numa NF de entrada (recebimentos_nfe) — regra PURA, sem banco.
//
// O ListarRecebimentos da Omie não separa máquina de peça, e o sync gravava
// `maquinas: []` sempre: NF de trator da Mahindra (NCM 8701) chegava com
// qtd_maquinas = 0 e a tela /estoque/recebimentos a classificava como peças.
//
// Regra: o item é máquina pelo NCM — tratores, implementos, colheitadeiras,
// pulverizadores, reboques e quadriciclos. As posições "xx.90" desses capítulos
// são PARTES (843290 marcador de linha, 842490 tanque, 843390 caixa de
// transmissão, 871690 aro) e ficam fora. Conferido em 10/2026 sobre as NFs
// > R$ 5 mil do espelho: implemento barato (afofador R$ 11,7 mil, semeadeira
// R$ 5 mil) continua sendo máquina, por isso não há piso de valor.
// ============================================================================

type Item = Record<string, unknown>;

// Prefixos de NCM (sem pontos) que são máquina.
export const NCM_MAQUINA = [
  '8701',                                   // tratores
  '843210', '843221', '843229', '843231', '843239', '843241', '843242', '843280', // implementos de preparo/plantio/adubação
  '843311', '843319', '843320', '843330', '843340', '843351', '843352', '843353', '843359', '843360', // colheita, segadeiras, enfardadeiras
  '842441', '842449', '842482',             // pulverizadores agrícolas
  '843610', '843680',                       // vagão forrageiro, equipamentos agrícolas
  '843069',                                 // raspadeira agrícola
  '871620',                                 // reboques/carretas agrícolas
  '870321',                                 // quadriciclos
];

export function ncmDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export function ehItemMaquina(item: Item): boolean {
  const ncm = ncmDigitos(item.cNCM ?? item.ncm);
  if (ncm.length < 4) return false;
  return NCM_MAQUINA.some((p) => ncm.startsWith(p));
}

// Quantidade de UNIDADES de máquina do item (nQtde da NF; mínimo 1).
function unidades(item: Item): number {
  const q = Number(item.nQtde ?? item.quantidade);
  return Number.isFinite(q) && q >= 1 ? Math.round(q) : 1;
}

function valorItem(item: Item): number {
  const t = Number(item.vTotal);
  if (Number.isFinite(t) && t > 0) return t;
  const u = Number(item.nValUnit);
  return Number.isFinite(u) ? u * unidades(item) : 0;
}

// Separa as máquinas dos itens da NF. `produtos` continua com TODOS os itens
// (alocação, remessas e robô de classificação leem de lá); `maquinas` é a cópia
// dos itens de máquina, e qtd/valor alimentam as colunas do espelho.
export function separarMaquinas(produtos: Item[]): { maquinas: Item[]; qtd_maquinas: number; valor_maquinas: number } {
  const maquinas = produtos.filter(ehItemMaquina);
  const qtd = maquinas.reduce((s, m) => s + unidades(m), 0);
  const valor = Math.round(maquinas.reduce((s, m) => s + valorItem(m), 0) * 100) / 100;
  return { maquinas, qtd_maquinas: qtd, valor_maquinas: valor };
}

// Chave de um item para juntar `maquinas` + `produtos` sem repetir: linhas novas
// trazem a máquina nas duas listas; as antigas (app legado) só em `maquinas`.
export function chaveItem(item: Item): string {
  const seq = item.nSequencia ?? '';
  return [seq, item.cCodigo ?? '', item.cDescricao ?? '', item.vTotal ?? item.nValUnit ?? ''].join('|');
}

export function juntarItens(maquinas: Item[], produtos: Item[]): Item[] {
  const vistos = new Set(produtos.map(chaveItem));
  return maquinas.filter((m) => !vistos.has(chaveItem(m))).concat(produtos);
}
