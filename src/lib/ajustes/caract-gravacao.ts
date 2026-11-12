// Regras puras da gravação de característica de produto na Omie.
//
// Achado de 11/11/2026 (RP-007703346C91, RP-EL0807502013-0…): o
// AlterarCaractProduto da Omie aceita e a API devolve o valor novo, mas a TELA
// de Produtos → Características continua mostrando o valor antigo. Incluir
// aparece certo na tela. Então trocar o conteúdo = EXCLUIR + INCLUIR, levando os
// ajustes de "Onde será exibida" que a associação tinha (o Incluir sem eles grava
// tudo "N" e a locação deixa de sair no pedido/remessa).

export type Exibicao = { cExibirItemNF: 'S' | 'N'; cExibirItemPedido: 'S' | 'N'; cExibirOrdemProd: 'S' | 'N' };

const LOCACAO = new Set(['#prateleira', '#andar', '#caixa', '#andar2', '#caixa2']);

/** Padrão das locações cadastradas na Omie: sai no pedido e na ordem de produção, não na NF (decisão de 11/11/2026). */
export const EXIBICAO_LOCACAO: Exibicao = { cExibirItemNF: 'N', cExibirItemPedido: 'S', cExibirOrdemProd: 'S' };

export function ehLocacao(nome: unknown): boolean {
  return LOCACAO.has(String(nome ?? '').trim().toLowerCase());
}

const sn = (v: unknown): 'S' | 'N' => (String(v ?? '').trim().toUpperCase() === 'S' ? 'S' : 'N');

/**
 * Ajustes de exibição para o Incluir.
 * - Havia associação: mantém os dela (troca só o conteúdo). Locação que estava
 *   toda "N" (inclusão antiga do portal) ganha o padrão.
 * - Não havia: locação ganha o padrão; as demais vão sem ajuste (a Omie grava "N").
 */
export function exibicaoParaIncluir(nome: unknown, atual?: Partial<Record<keyof Exibicao, unknown>> | null): Exibicao | null {
  if (atual) {
    const e: Exibicao = { cExibirItemNF: sn(atual.cExibirItemNF), cExibirItemPedido: sn(atual.cExibirItemPedido), cExibirOrdemProd: sn(atual.cExibirOrdemProd) };
    const tudoN = e.cExibirItemNF === 'N' && e.cExibirItemPedido === 'N' && e.cExibirOrdemProd === 'N';
    return tudoN && ehLocacao(nome) ? { ...EXIBICAO_LOCACAO } : e;
  }
  return ehLocacao(nome) ? { ...EXIBICAO_LOCACAO } : null;
}

/** A Omie diz que a característica não está associada ao produto. */
export function erroNaoAssociada(msg: unknown): boolean {
  return /n[aã]o\s+(est[aá]\s+)?(cadastrad|associad|encontrad|exist|localizad)/i.test(String(msg ?? ''));
}

/** A Omie diz que a característica já está associada ao produto. */
export function erroJaExiste(msg: unknown): boolean {
  return /j[aá]\s+(est[aá]\s+)?(cadastrad|associad|exist)/i.test(String(msg ?? ''));
}

/** Precisa regravar? Mesmo conteúdo e mesmos ajustes = nada a fazer (salvo `forcar`, usado para consertar a tela). */
export function precisaRegravar(
  atual: { cConteudo?: unknown } & Partial<Record<keyof Exibicao, unknown>>,
  conteudo: string,
  exib: Exibicao | null,
  forcar = false,
): boolean {
  if (forcar) return true;
  if (String(atual.cConteudo ?? '') !== conteudo) return true;
  if (!exib) return false;
  return sn(atual.cExibirItemNF) !== exib.cExibirItemNF
    || sn(atual.cExibirItemPedido) !== exib.cExibirItemPedido
    || sn(atual.cExibirOrdemProd) !== exib.cExibirOrdemProd;
}

/**
 * Diagnóstico de uma característica lida pelo ListarCaractProduto.
 * - telaVelha: alterada pela API (uAlt WEBSERVICE e alteração depois da inclusão)
 *   → a tela da Omie mostra o valor anterior.
 * - semExibicao: locação com todos os "exibir" em N (inclusão antiga do portal).
 */
export function diagnosticarCaract(c: { cNomeCaract?: unknown; info?: { dInc?: string; hInc?: string; dAlt?: string; hAlt?: string; uAlt?: string } } & Partial<Record<keyof Exibicao, unknown>>): { telaVelha: boolean; semExibicao: boolean } {
  const i = c.info || {};
  const telaVelha = String(i.uAlt || '').toUpperCase() === 'WEBSERVICE'
    && `${i.dAlt || ''} ${i.hAlt || ''}` !== `${i.dInc || ''} ${i.hInc || ''}`;
  const semExibicao = ehLocacao(c.cNomeCaract)
    && sn(c.cExibirItemNF) === 'N' && sn(c.cExibirItemPedido) === 'N' && sn(c.cExibirOrdemProd) === 'N';
  return { telaVelha, semExibicao };
}
