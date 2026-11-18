// =====================================================================
// LIÇÃO 1 — EXEMPLO
// Este é o arquivo REAL  src/lib/requisicoes/itens-compra.ts
// reescrito em JavaScript, POR EXTENSO e comentado.
// Rode:  node estudo/licao-01-desresumindo/exemplo.js
// =====================================================================


// ---------------------------------------------------------------------
// 1) num: transforma texto digitado em número.
//    "1.250,50" -> 1250.5     "abc" -> 0     "" -> 0
//
//    NO PORTAL (resumido, 1 linha):
//    export const num = (v: string) => { const s = String(v || '').replace(...); ... }
// ---------------------------------------------------------------------
function num(valorDigitado) {
  // "|| ''" = se vier vazio/nulo, usa texto vazio
  let texto = String(valorDigitado || '');

  // apaga tudo que não for dígito, vírgula ou ponto  (ex.: "R$ 10" -> "10")
  texto = texto.replace(/[^\d,.]/g, '');

  if (texto === '') {
    return 0;
  }

  if (texto.includes(',')) {
    // formato brasileiro: "1.250,50" -> tira os pontos -> "1250,50" -> troca vírgula -> "1250.50"
    texto = texto.replace(/\./g, '').replace(',', '.');
  }

  const numero = parseFloat(texto);

  // se não deu número válido (NaN), devolve 0
  if (isNaN(numero)) {
    return 0;
  }
  return numero;
}


// ---------------------------------------------------------------------
// 2) brl: formata número como dinheiro.   1250.5 -> "R$ 1.250,50"
//    NO PORTAL:  export const brl = (v: number) => v.toLocaleString('pt-BR', {...})
// ---------------------------------------------------------------------
function brl(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


// ---------------------------------------------------------------------
// 3) itemUsado: o item foi preenchido? (tem link OU produto OU valor)
//    NO PORTAL:  export const itemUsado = (i: ItemCompra) => !!(i.link.trim() || i.produto.trim() || num(i.valor))
//    O "!!" só força virar true/false.
// ---------------------------------------------------------------------
function itemUsado(item) {
  if (item.link.trim() !== '') return true;
  if (item.produto.trim() !== '') return true;
  if (num(item.valor) !== 0) return true;
  return false;
}


// ---------------------------------------------------------------------
// 4) totalItens: soma (quantidade × valor) dos itens preenchidos.
//    NO PORTAL (1 linha!):
//    m.itens.filter(itemUsado).reduce((s, i) => s + (num(i.qtd) || 1) * num(i.valor), 0)
//
//    Lendo a linha acima em português:
//    "pega os itens -> fica só com os usados (filter) -> soma tudo (reduce),
//     começando do 0, e cada item soma qtd × valor (qtd vazia conta como 1)"
// ---------------------------------------------------------------------
function totalItens(maisInfo) {
  let soma = 0;
  for (const item of maisInfo.itens) {
    if (!itemUsado(item)) continue;        // isso é o "filter"
    const qtd = num(item.qtd) || 1;        // qtd 0/vazia -> 1
    soma = soma + qtd * num(item.valor);   // isso é o "reduce"
  }
  return soma;
}


// =====================================================================
// TESTANDO
// =====================================================================
const pedido = {
  fornecedor: 'Loja Agro',
  itens: [
    { link: '', produto: 'Filtro de óleo', qtd: '2', valor: '45,90' },
    { link: '', produto: 'Correia',        qtd: '',  valor: '120'   }, // qtd vazia = 1
    { link: '', produto: '',               qtd: '1', valor: ''      }, // linha em branco: ignorada
  ],
};

console.log('num("1.250,50")  =', num('1.250,50'));
console.log('brl(1250.5)      =', brl(1250.5));
console.log('Itens usados     =', pedido.itens.filter(itemUsado).length);
console.log('Total do pedido  =', brl(totalItens(pedido)));
// Esperado: 2 × 45,90 + 1 × 120 = R$ 211,80
