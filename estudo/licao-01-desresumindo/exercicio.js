// =====================================================================
// LIÇÃO 1 — EXERCÍCIO
// Complete as funções marcadas com TODO e rode:
//   node estudo/licao-01-desresumindo/exercicio.js
// Cada teste mostra ✅ (certo) ou ❌ (errado).
// Dica: o exemplo.js tem tudo que você precisa.
// =====================================================================

const pecas = [
  { codigo: 'F01', nome: 'Filtro de óleo', preco: 45.9, estoque: 10 },
  { codigo: 'C02', nome: 'Correia',        preco: 120,  estoque: 0  },
  { codigo: 'V03', nome: 'Vela',           preco: 18.5, estoque: 4  },
];


// TODO 1 — Devolva uma lista só com os NOMES das peças.
// Por extenso (com for) primeiro. Depois, se quiser, tente com .map()
function nomesDasPecas(lista) {
  // escreva aqui
}


// TODO 2 — Devolva só as peças que têm estoque maior que 0.
// Por extenso primeiro. Depois tente com .filter()
function pecasComEstoque(lista) {
  // escreva aqui
}


// TODO 3 — Valor total do estoque: soma de (preco × estoque) de cada peça.
// Por extenso primeiro. Depois tente com .reduce()
function valorDoEstoque(lista) {
  // escreva aqui
}


// TODO 4 — DESAFIO: "desresuma" esta linha (é estilo portal).
// Reescreva a função abaixo, SEM usar ?. nem || nem ? :, só com if.
// const nomeDoCliente = (c) => c?.nome || 'Sem nome'
function nomeDoCliente(cliente) {
  // escreva aqui
}


// =====================================================================
// NÃO PRECISA MEXER DAQUI PRA BAIXO — são os testes
// =====================================================================
function testar(titulo, recebido, esperado) {
  const ok = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${ok ? '✅' : '❌'} ${titulo}`);
  if (!ok) console.log('     esperado:', esperado, '\n     recebido:', recebido);
}

testar('TODO 1 nomes',        nomesDasPecas(pecas), ['Filtro de óleo', 'Correia', 'Vela']);
testar('TODO 2 com estoque',  (pecasComEstoque(pecas) || []).map((p) => p.codigo), ['F01', 'V03']);
testar('TODO 3 valor total',  Math.round((valorDoEstoque(pecas) || 0) * 100) / 100, 533);
testar('TODO 4 com nome',     nomeDoCliente({ nome: 'João' }), 'João');
testar('TODO 4 sem nome',     nomeDoCliente({ nome: '' }), 'Sem nome');
testar('TODO 4 sem cliente',  nomeDoCliente(null), 'Sem nome');
