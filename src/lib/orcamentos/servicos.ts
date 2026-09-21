// Serviços de um orçamento: cada linha é um serviço NOMEADO ("Troca de
// embreagem") com a própria mão de obra e o próprio deslocamento — e cada
// parte tem liga/desliga individual (pedido do usuário, 21/09/2026).
//
// Persistência: coluna nova `orcamentos.servicos` (jsonb, array de LinhaServico).
// As colunas antigas `mao_obra` {valorHora,horas} e `deslocamento` {valorKm,km}
// CONTINUAM sendo gravadas como AGREGADO (soma das linhas ativas) — é o que
// mantém os consumidores legados funcionando sem mudança: gerar OS, importar
// pra OS e os chips "Xh · Ykm" no drawer da OS.
//
// PURO: sem import de servidor, testável no vitest.

export interface LinhaServico {
  descricao: string
  /** liga/desliga da mão de obra desta linha */
  maoObra: boolean
  /** desligada, ainda aparece no PDF como "não cobrado" (cortesia visível) */
  mostrarMO: boolean
  valorHora: number
  horas: number
  /** liga/desliga do deslocamento desta linha */
  desloc: boolean
  /** desligado, ainda aparece no PDF como "não cobrado" */
  mostrarDesloc: boolean
  valorKm: number
  km: number
}

export const VALOR_HORA_PADRAO = 193
export const VALOR_KM_PADRAO = 2.8

const num = (v: unknown, def = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export function novaLinha(parcial?: Partial<LinhaServico>): LinhaServico {
  return {
    descricao: '',
    maoObra: true,
    mostrarMO: false,
    valorHora: VALOR_HORA_PADRAO,
    horas: 1,
    desloc: true,
    mostrarDesloc: false,
    valorKm: VALOR_KM_PADRAO,
    km: 0,
    ...parcial,
  }
}

/** Saneia uma linha vinda de JSON (número como string, flag ausente etc.). */
function sanear(l: unknown): LinhaServico {
  const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
  return {
    descricao: String(o.descricao ?? ''),
    maoObra: o.maoObra === undefined ? num(o.horas) > 0 : !!o.maoObra,
    mostrarMO: !!o.mostrarMO,
    valorHora: num(o.valorHora, VALOR_HORA_PADRAO),
    horas: num(o.horas),
    desloc: o.desloc === undefined ? num(o.km) > 0 : !!o.desloc,
    mostrarDesloc: !!o.mostrarDesloc,
    valorKm: num(o.valorKm, VALOR_KM_PADRAO),
    km: num(o.km),
  }
}

/** O que a tabela `orcamentos` guarda (só os campos que interessam aqui). */
export interface OrcamentoServicos {
  servicos?: unknown
  mao_obra?: { valorHora?: unknown; horas?: unknown } | null
  deslocamento?: { valorKm?: unknown; km?: unknown } | null
}

/**
 * Normaliza o orçamento para a lista de linhas: usa `servicos` quando existir;
 * senão converte o formato legado (um bloco de mão de obra + um de
 * deslocamento) numa linha única sem nome. Orçamento só de peças → [].
 */
export function linhasDoOrcamento(orc: OrcamentoServicos): LinhaServico[] {
  if (Array.isArray(orc.servicos) && orc.servicos.length > 0) {
    return orc.servicos.map(sanear)
  }
  const mo = orc.mao_obra
  const de = orc.deslocamento
  if (!mo && !de) return []
  return [{
    descricao: '',
    maoObra: !!mo,
    mostrarMO: false,
    valorHora: num(mo?.valorHora, VALOR_HORA_PADRAO),
    horas: num(mo?.horas),
    desloc: !!de,
    mostrarDesloc: false,
    valorKm: num(de?.valorKm, VALOR_KM_PADRAO),
    km: num(de?.km),
  }]
}

export const valorMaoObra = (l: LinhaServico) => (l.maoObra ? l.horas * l.valorHora : 0)
export const valorDesloc = (l: LinhaServico) => (l.desloc ? l.km * l.valorKm : 0)
export const subtotalLinha = (l: LinhaServico) => valorMaoObra(l) + valorDesloc(l)

/** A parte aparece no PDF? (cobrada, OU desligada mas marcada pra mostrar) */
export const exibeMaoObra = (l: LinhaServico) => (l.maoObra || l.mostrarMO) && l.horas > 0
export const exibeDesloc = (l: LinhaServico) => (l.desloc || l.mostrarDesloc) && l.km > 0

/** Linha vale a pena guardar/imprimir? (tem nome ou alguma parte visível) */
export const linhaPreenchida = (l: LinhaServico) =>
  l.descricao.trim() !== '' || exibeMaoObra(l) || exibeDesloc(l)

export interface TotaisServicos {
  horas: number
  km: number
  maoObra: number
  desloc: number
  total: number
}

export function totaisServicos(linhas: LinhaServico[]): TotaisServicos {
  const t: TotaisServicos = { horas: 0, km: 0, maoObra: 0, desloc: 0, total: 0 }
  for (const l of linhas) {
    if (l.maoObra) { t.horas += l.horas; t.maoObra += l.horas * l.valorHora }
    if (l.desloc) { t.km += l.km; t.desloc += l.km * l.valorKm }
  }
  t.total = t.maoObra + t.desloc
  return t
}

/**
 * Agregados no formato LEGADO, gravados junto com `servicos` — mantêm
 * gerar-OS, importar e os chips do drawer funcionando sem tocar neles.
 * O valorHora/valorKm agregado é o da primeira linha ativa (só informativo:
 * quem precisa do detalhe lê `servicos`; a OS recalcula pela config do POS).
 */
export function agregadosLegados(linhas: LinhaServico[]): {
  mao_obra: { valorHora: number; horas: number } | null
  deslocamento: { valorKm: number; km: number } | null
} {
  const t = totaisServicos(linhas)
  const primeiraMO = linhas.find((l) => l.maoObra)
  const primeiraDE = linhas.find((l) => l.desloc && l.km > 0)
  return {
    mao_obra: t.horas > 0 ? { valorHora: primeiraMO?.valorHora ?? VALOR_HORA_PADRAO, horas: t.horas } : null,
    deslocamento: t.km > 0 ? { valorKm: primeiraDE?.valorKm ?? VALOR_KM_PADRAO, km: t.km } : null,
  }
}

/** Soma de horas/km pra OS (Qtd_HR/Qtd_KM), lendo o formato que existir. */
export function somaHorasKm(orc: OrcamentoServicos): { horas: number; km: number } {
  const t = totaisServicos(linhasDoOrcamento(orc))
  return { horas: t.horas, km: t.km }
}

/** Nomes dos serviços (sem vazios) — vão pra descrição da OS. */
export function nomesServicos(linhas: LinhaServico[]): string[] {
  return linhas.map((l) => l.descricao.trim()).filter(Boolean)
}
