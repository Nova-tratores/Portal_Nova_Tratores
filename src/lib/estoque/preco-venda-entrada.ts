// Preço de venda sugerido ao dar entrada numa nota (decisão do usuário, 13/11/2026):
//   Máquinas = custo × 1,20 · Peças = custo × 2. Garantia, almoxarifado e combustível
//   não mexem no preço. O preço da Omie SÓ SOBE (nunca baixa um preço já ajustado) e a
//   pessoa confere/edita na janela de "Dar entrada" antes de gravar.
//
// Custo do item = o TOTAL DA NOTA repartido entre os itens na proporção do que cada um
// pesa (valor − desconto + IPI + ST). Assim frete, seguro e outras despesas — que a Omie
// às vezes traz só no total — entram no custo de cada peça sem depender de onde vieram.
// Por unidade de estoque (qtde recebida), não da nota.
//
// Puro: usado pela tela (sugestão) e pelo servidor (gravação).

export const FATOR_PRECO: Record<string, number> = { maquinas: 1.2, pecas: 2 };

export function fatorDoTipo(tipo: string | null | undefined): number | null {
  return (tipo && FATOR_PRECO[tipo]) || null;
}

export interface ItemCusto {
  nSequencia: number | string | null;
  qtde: number;            // da nota
  qtdeEstoque?: number | null; // recebida em unidade de estoque (vale mais que a da nota)
  precoUnit: number;
  vDesconto?: number | null;
  valIPI?: number | null;
  valST?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function base(it: ItemCusto): number {
  return Math.max(0, (Number(it.qtde) || 0) * (Number(it.precoUnit) || 0) - (Number(it.vDesconto) || 0))
    + (Number(it.valIPI) || 0) + (Number(it.valST) || 0);
}

/** Custo unitário de cada item (chave = nSequencia). Sem total da nota, usa a própria base. */
export function custosUnitarios(itens: ItemCusto[], totalNFe: number | null | undefined): Record<string, number> {
  const bases = itens.map(base);
  const soma = bases.reduce((s, b) => s + b, 0);
  const total = Number(totalNFe) > 0 ? Number(totalNFe) : soma;
  const out: Record<string, number> = {};
  itens.forEach((it, i) => {
    const qtd = Number(it.qtdeEstoque) > 0 ? Number(it.qtdeEstoque) : Number(it.qtde) || 0;
    if (qtd <= 0 || soma <= 0) return;
    out[String(it.nSequencia)] = Math.round((total * bases[i] / soma / qtd) * 10000) / 10000;
  });
  return out;
}

/** Preço novo = custo × fator (2 casas) e se ele sobe o preço atual. */
export function sugerirPreco(custoUnit: number | null | undefined, fator: number | null, precoAtual: number | null | undefined) {
  if (!fator || !(Number(custoUnit) > 0)) return null;
  const novo = r2(Number(custoUnit) * fator);
  const atual = Number(precoAtual) || 0;
  return { novo, atual, sobe: novo > atual + 0.004 };
}

/** O servidor relê o preço na Omie antes de gravar: só grava se o pedido for maior. */
export function deveGravar(pedido: number, atualNaOmie: number): boolean {
  return Number(pedido) > 0 && Number(pedido) > (Number(atualNaOmie) || 0) + 0.004;
}
