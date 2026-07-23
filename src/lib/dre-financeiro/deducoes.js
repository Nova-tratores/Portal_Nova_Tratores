// Esconder DEVOLUÇÕES da árvore da DRE (checkbox da tela /dre-financeiro/dre).
//
// Por que existe: a devolução de venda aparece como uma linha de dedução que
// abate a receita. Quem quer ler o mês "limpo" — a operação sem o vai-e-vem —
// precisava hoje fazer a conta de cabeça. Este módulo tira essa linha da árvore
// e recompõe os totais, para KPIs, cascata, tabela e gráficos concordarem.
//
// NÃO é a DRE padrão: a tela tem de avisar, em cima, que o número está sem
// devoluções. Por isso `removerDevolucoes` devolve também quanto saiu.
//
// Client-safe DE PROPÓSITO: nada de importar calc.js aqui (ele puxa o supabase
// admin e não pode ir para o browser). A regra de negócio duplicada é só o nome
// da linha — o cálculo em si continua no servidor.

// Mesma normalização de natureza.js: o Omie manda nome cru e acentuado.
const norm = (s) => String(s || '')
  .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

/**
 * A conta da árvore da DRE é uma linha de devolução?
 *
 * Dois casos, porque as duas fontes nomeiam diferente:
 *  - regime Competência: calc.js manda o grupo "Devoluções de Vendas" do
 *    contas_pagar para a conta fixa "03. Deduções de Receita".
 *  - regime Omie: o nome vem do plano de contas do próprio Omie, onde a palavra
 *    que aparece é "devolução".
 *
 * O casamento é deliberadamente ESTREITO: "dedução" genérica NÃO conta. No plano
 * do Omie um grupo "Deduções" costuma reunir também ICMS/PIS/COFINS sobre venda,
 * e esconder imposto junto com devolução daria um resultado simplesmente errado.
 */
export function contaEhDevolucao(nome) {
  const n = norm(nome);
  if (!n) return false;
  if (n.includes('devolu')) return true;
  return n.includes('deducoes de receita') || n.includes('deducao de receita');
}

// Refaz total/count/por_mes de uma árvore a partir das folhas que sobraram.
// SOMA em vez de subtrair: addNoTree/mergeResumoEm mantêm o invariante "pai =
// soma dos filhos", então recompor por soma é exato e não acumula erro.
function recomporArvore(arvore) {
  Object.keys(arvore).forEach((t) => {
    const tNode = arvore[t];
    const tPorMes = {};
    let tTotal = 0, tCount = 0;
    Object.keys(tNode.grupos || {}).forEach((g) => {
      const gNode = tNode.grupos[g];
      const gPorMes = {};
      let gTotal = 0, gCount = 0;
      const contas = gNode.contas || {};
      Object.keys(contas).forEach((c) => {
        gTotal += contas[c].total || 0;
        gCount += contas[c].count || 0;
        Object.entries(contas[c].por_mes || {}).forEach(([k, v]) => {
          gPorMes[k] = (gPorMes[k] || 0) + v;
        });
      });
      // Grupo que ficou sem nenhuma conta sai da árvore (senão vira linha zerada).
      if (Object.keys(contas).length === 0) { delete tNode.grupos[g]; return; }
      gNode.total = gTotal; gNode.count = gCount; gNode.por_mes = gPorMes;
      tTotal += gTotal; tCount += gCount;
      Object.entries(gPorMes).forEach(([k, v]) => { tPorMes[k] = (tPorMes[k] || 0) + v; });
    });
    if (Object.keys(tNode.grupos || {}).length === 0) { delete arvore[t]; return; }
    tNode.total = tTotal; tNode.count = tCount; tNode.por_mes = tPorMes;
  });
  return arvore;
}

// Copia rasa-o-suficiente: os nós são recriados até o nível da conta, então dá
// para apagar/reescrever sem tocar no objeto original (o estado `dadosRaw` da
// página tem de continuar intacto para desmarcar o checkbox voltar ao original).
function clonarArvore(arvore) {
  const out = {};
  Object.entries(arvore || {}).forEach(([t, tNode]) => {
    out[t] = { ...tNode, por_mes: { ...(tNode.por_mes || {}) }, grupos: {} };
    Object.entries(tNode.grupos || {}).forEach(([g, gNode]) => {
      out[t].grupos[g] = { ...gNode, por_mes: { ...(gNode.por_mes || {}) }, contas: {} };
      Object.entries(gNode.contas || {}).forEach(([c, cNode]) => {
        out[t].grupos[g].contas[c] = cNode;
      });
    });
  });
  return out;
}

function limparArvore(arvore) {
  const nova = clonarArvore(arvore);
  let removido = 0;
  Object.keys(nova).forEach((t) => {
    Object.keys(nova[t].grupos).forEach((g) => {
      const contas = nova[t].grupos[g].contas;
      Object.keys(contas).forEach((c) => {
        if (!contaEhDevolucao(c)) return;
        removido += Math.abs(contas[c].total || 0);
        delete contas[c];
      });
    });
  });
  return { arvore: recomporArvore(nova), removido };
}

/**
 * Remove as linhas de devolução de todas as árvores do payload da DRE
 * (nova, castro, consolidado e intercompany), sem mutar o original.
 *
 * @returns {{ dados: object, removido: number }} `removido` = valor absoluto
 *   escondido no CONSOLIDADO (é o número que a tela mostra no aviso; somar as
 *   três árvores contaria o mesmo dinheiro duas vezes).
 */
export function removerDevolucoes(dados) {
  if (!dados) return { dados, removido: 0 };
  const cons = limparArvore(dados.consolidado);
  const inter = dados.intercompany || {};
  return {
    dados: {
      ...dados,
      nova: limparArvore(dados.nova).arvore,
      castro: limparArvore(dados.castro).arvore,
      consolidado: cons.arvore,
      intercompany: {
        ...inter,
        nova: limparArvore(inter.nova).arvore,
        castro: limparArvore(inter.castro).arvore,
      },
    },
    removido: cons.removido,
  };
}
