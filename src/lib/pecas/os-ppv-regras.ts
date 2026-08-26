// Regras PURAS do vínculo peça liberada → PPV da OS (sem import de servidor,
// pra rodar no vitest em ambiente node — mesmo motivo de ppv-conferencia.ts).

import { PPV_STATUS_TERMINAIS } from './ppv-conferencia'

/** Destinos do rastreio que fazem a peça virar linha de um PPV. */
export type DestinoComPpv = 'os' | 'balcao' | 'uso_interno'

export function destinoTemPpv(t: unknown): t is DestinoComPpv {
  return t === 'os' || t === 'balcao' || t === 'uso_interno'
}

/**
 * Motivo de saída do pedido por destino.
 *
 * Só valores que JÁ existem em MOTIVOS_SAIDA (lib/ppv/constants): inventar um
 * "Uso interno" aqui criaria pedido com motivo que o select do PPV não conhece
 * — abrir o pedido apagaria o campo. Uso interno é saída de técnico sem OS.
 */
export const MOTIVO_SAIDA_POR_DESTINO: Record<DestinoComPpv, string> = {
  os: 'Saida Tecnico (Com OS)',
  balcao: 'Venda Balcão',
  uso_interno: 'Saida Tecnico (Sem OS)',
}

const COMO_CHEGOU: Record<DestinoComPpv, string> = {
  os: 'para a ordem de serviço',
  balcao: 'para venda balcão',
  uso_interno: 'para uso interno',
}

/**
 * "…ao liberar peça ___" — trecho usado na observação do pedido e nos logs.
 * Um lugar só: quando cada frase montava o seu, saía "para a OS OS-0123"
 * (o id já traz o prefixo) e, sem número, um "para a OS" pendurado no fim.
 */
export function ondeFoiParar(destino: DestinoComPpv, referencia?: string | null): string {
  const ref = String(referencia || '').trim()
  if (destino !== 'os' || !ref) return COMO_CHEGOU[destino]
  return /^os[-\s]/i.test(ref) ? `para a ${ref}` : `para a OS ${ref}`
}

/**
 * Observação que fica gravada no pedido criado pelo rastreio. É o que explica,
 * meses depois, por que existe um PPV que ninguém lembra de ter aberto.
 */
export function observacaoPpvRastreio(destino: DestinoComPpv, referencia?: string | null): string {
  return `Criado pelo sistema de rastreio de peças (QR) ao liberar peça ${ondeFoiParar(destino, referencia)}`
}

/**
 * Linha de item do pedido (tabela `movimentacoes`).
 *
 * `Id` É OBRIGATÓRIO E NÃO TEM DEFAULT no banco: a coluna é NOT NULL e não é
 * serial/identity, então quem insere precisa gerar o número — é o que o resto
 * do módulo PPV já faz. Omitir dava 23502 e o item sumia calado (foi assim que
 * o PPV-0434 nasceu vazio). Por isso o payload é montado aqui, num lugar só e
 * com teste em cima.
 */
export function linhaMovimentacao(p: {
  ppv: string
  codigo: string
  descricao: string | null
  preco: number
  tecnico: string
  dataHora: string
  id: number
}): Record<string, unknown> {
  return {
    Id: p.id,
    Id_PPV: p.ppv,
    Data_Hora: p.dataHora,
    Tecnico: p.tecnico,
    TipoMovimento: 'Saída',
    CodProduto: p.codigo,
    Descricao: p.descricao || p.codigo,
    Qtde: '1',
    Preco: p.preco,
  }
}

/** Id de movimentação no mesmo formato do módulo (10 dígitos). */
export function novoIdMovimentacao(sorteio: number = Math.random()): number {
  return Math.floor(sorteio * 9_000_000_000) + 1_000_000_000
}

export interface CabecalhoPpvMin {
  id_pedido: string
  status: string | null
  Tipo_Pedido: string | null
  pedido_omie: string | null
  faturado_omie_em: string | null
  nf_numero?: string | null
}

export type RotuloFaturamento =
  | 'Faturado'          // NF-e confirmada (faturado_omie_em)
  | 'Remessa enviada'   // remessa no Omie: saiu com documento
  | 'No Omie'           // pedido lançado no Omie, faturamento não confirmado aqui
  | 'Cancelado'         // não faturou e não vai
  | 'Sem nota'          // encerrado sem NENHUM vestígio de documento — alerta
  | 'A faturar'         // ainda em aberto, fluxo normal

export interface SituacaoFaturamento {
  /**
   * Saiu com documento fiscal. MESMA régua de ppvFaturado() (lib/pecas/
   * ppv-conferencia), que é quem decide aplicar unidade no faturamento — os
   * dois não podem divergir, senão o selo diz uma coisa e o sistema faz outra.
   */
  faturado: boolean
  rotulo: RotuloFaturamento
  /** merece atenção: peça saiu, pedido encerrou e não há vestígio de documento */
  alerta: boolean
  /** número da NF quando existe (só no caminho de faturamento) */
  nf: string | null
  em: string | null
  /** número do pedido no Omie, quando houver */
  omie: string | null
}

const CANCELADOS = ['Cancelada', 'Cancelado']

/**
 * Se a peça já virou nota — respondido pelo PEDIDO em que ela entrou.
 *
 * MEDIDO NO BANCO em 26/08/2026, e é o que dita os rótulos: `faturado_omie_em`
 * existe em apenas 4 dos 447 pedidos (campo novo, de agosto/2026). O rastro
 * histórico de "foi pro Omie" é `pedido_omie`, presente em 93 dos 133
 * "Concluída". Tratar todo encerrado sem `faturado_omie_em` como pendência
 * pintaria 281 pedidos normais de vermelho — alerta que ninguém olha.
 *
 * Por isso três leituras distintas em vez de sim/não: NF confirmada, lançado
 * no Omie (sem confirmação aqui) e encerrado sem vestígio nenhum. Só o último
 * é `alerta` — peça que saiu do estoque e o pedido fechou sem documento.
 */
export function situacaoFaturamentoPpv(cab: CabecalhoPpvMin): SituacaoFaturamento {
  const nf = String(cab.nf_numero || '').trim() || null
  const omie = String(cab.pedido_omie || '').trim() || null
  const status = String(cab.status || '')
  const base = { nf, em: null as string | null, omie }

  if (cab.faturado_omie_em) {
    return { ...base, faturado: true, rotulo: 'Faturado', alerta: false, em: cab.faturado_omie_em }
  }
  if (String(cab.Tipo_Pedido || '') === 'Remessa' && omie) {
    return { ...base, faturado: true, rotulo: 'Remessa enviada', alerta: false }
  }
  if (CANCELADOS.includes(status)) {
    return { ...base, faturado: false, rotulo: 'Cancelado', alerta: false, nf: null }
  }
  // lançado no Omie: `faturado` segue false (ppvFaturado só conta remessa),
  // mas o rótulo não pode dizer "a faturar" nem acender alerta — é o estado
  // normal de quase todo pedido concluído deste banco
  if (omie) {
    return { ...base, faturado: false, rotulo: 'No Omie', alerta: false }
  }
  if (PPV_STATUS_TERMINAIS.includes(status)) {
    return { ...base, faturado: false, rotulo: 'Sem nota', alerta: true }
  }
  return { ...base, faturado: false, rotulo: 'A faturar', alerta: false }
}

/** Pedido ainda aceita item novo? (mesma régua de escolherPpvAberto) */
export function ppvAceitaItem(cab: {
  status: string | null
  Tipo_Pedido: string | null
  pedido_omie: string | null
  faturado_omie_em: string | null
}): boolean {
  if (cab.faturado_omie_em) return false
  // remessa enviada ao Omie já saiu com documento: conta como fechada
  if (String(cab.Tipo_Pedido || '') === 'Remessa' && !!cab.pedido_omie) return false
  return !PPV_STATUS_TERMINAIS.includes(String(cab.status || ''))
}

/** Códigos equivalentes da peça: o cadastro ora tem o prefixo RP-, ora não. */
export function variantesDeCodigo(codigo: string): string[] {
  const base = String(codigo || '').trim()
  if (!base) return []
  const semRp = base.replace(/^RP-/i, '')
  return [...new Set([base, semRp, `RP-${semRp}`])]
}

/** PPVs de uma OS, na ordem em que estão gravados (a coluna é CSV). */
export function ppvsDaOS(idPpvCsv: unknown): string[] {
  return String(idPpvCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Qual PPV recebe a peça.
 *
 * Pedido já FATURADO ou em status terminal não serve: acrescentar item nele
 * criaria peça vendida sem nota — o erro exatamente oposto ao que esta função
 * existe pra evitar. Sem nenhum aberto, o chamador cria um novo, que é o que a
 * tela da OS já faz quando a OS fecha sem PPV.
 */
export function escolherPpvAberto(
  ids: string[],
  status: Map<string, { status: string | null; faturado: boolean }>,
): string | null {
  for (const id of ids) {
    const s = status.get(id)
    if (!s) continue                                              // PPV citado na OS que não existe mais
    if (s.faturado) continue
    if (PPV_STATUS_TERMINAIS.includes(String(s.status || ''))) continue
    return id
  }
  return null
}
