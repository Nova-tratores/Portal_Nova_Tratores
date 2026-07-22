// Natureza DRE de um grupo de categoria do Omie (custo x despesa x receita).
//
// Por que existe: as tabelas contas_pagar/contas_receber só distinguem título A
// Pagar de A Receber. "A Pagar" mistura, no mesmo balaio, a compra de mercadoria
// (o maior valor de todos), as despesas operacionais, as devoluções de venda e o
// CAPEX. Quem olha a tela de Composição não consegue separar custo de despesa.
//
// A regra NÃO é nova: espelha classificaGrupoCP() de ./calc.js, que já mapeia
// grupo_categoria -> ramo do DRE. Aqui ela é estendida com os dois grupos que o
// DRE ignora de propósito ('Despesas Diretas', já contabilizado no CMV pelo CMC
// das vendas, e 'Investimento', que é CAPEX) e com o lado a receber. Mexeu num,
// mexa no outro — senão as duas telas passam a contar histórias diferentes.

export const NATUREZAS = [
  { chave: 'receita',      rotulo: 'Receitas',      cor: '#059669', tipo: 'receber' },
  { chave: 'custo',        rotulo: 'Custos',        cor: '#b45309', tipo: 'pagar' },
  { chave: 'despesa',      rotulo: 'Despesas',      cor: '#dc2626', tipo: 'pagar' },
  { chave: 'deducao',      rotulo: 'Deduções',      cor: '#7c3aed', tipo: null },
  { chave: 'investimento', rotulo: 'Investimento',  cor: '#0891b2', tipo: 'pagar' },
  { chave: 'outros',       rotulo: 'Outros',        cor: '#64748b', tipo: null },
];

// Sublinha na tela o que cada natureza é de fato — 'custo' aqui NÃO é o CMV.
export const DESCRICAO_NATUREZA = {
  receita: 'Títulos a receber (vendas e receitas indiretas).',
  custo: 'Compra de mercadoria (grupo "Despesas Diretas" do Omie), pela data de vencimento do título. NÃO é o CMV da aba DRE, que é por competência e sai do CMC das vendas — os dois não batem por definição.',
  despesa: 'Despesas operacionais: pessoal, administrativas, financeiras, vendas/marketing, impostos e outras.',
  deducao: 'Devoluções, dos dois lados (abatem a receita).',
  investimento: 'CAPEX. Não entra no DRE.',
  outros: 'Grupos que ainda não foram mapeados para uma natureza (inclusive transferências entre contas).',
};

// Nomes vêm crus do Omie e nem sempre bem escritos (ex.: 'DevoluçõeseOutras
// Saidas', sem espaço). Comparar sempre normalizado, nunca a string acentuada.
const norm = (s) => String(s || '')
  .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

const POR_TIPO = {
  pagar: {
    'despesas diretas': 'custo',
    'despesas com pessoal': 'despesa',
    'despesas administrativas': 'despesa',
    'despesas financeiras / bancos': 'despesa',
    'despesas de vendas e marketing': 'despesa',
    'outras despesas': 'despesa',
    'impostos e taxas': 'despesa',
    'devolucoes de vendas': 'deducao',
    'investimento': 'investimento',
  },
  receber: {
    'receitas diretas': 'receita',
    'receitas indiretas': 'receita',
    'devolucoes': 'deducao',
    'devolucoeseoutras saidas': 'deducao',
    'devolucoes e outras saidas': 'deducao',
  },
};

/**
 * Natureza DRE de um grupo. `tipo` é 'pagar' | 'receber'.
 * Grupo desconhecido cai em 'outros' DE PROPÓSITO: se a Omie criar um grupo
 * novo, ele aparece na faixa da tela em vez de sumir e desequilibrar o total.
 */
export function naturezaDoGrupo(tipo, grupo) {
  const mapa = POR_TIPO[tipo];
  if (!mapa) return 'outros';
  return mapa[norm(grupo)] || 'outros';
}
