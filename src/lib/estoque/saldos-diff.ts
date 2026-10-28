// Sync RÁPIDO de saldo/custo da tabela `produtos` — regras puras (sem Omie nem banco).
//
// Medido em 27/10/2026: pedir à Omie só as peças COM saldo (ListarPosEstoque com
// cExibeTodos 'N', sem a pausa fixa de 1,2 s) leva ~6 s por conta (19 páginas), contra
// 7,4 min (NOVA) e 3 min (CASTRO) pedindo todas, inclusive as zeradas. O resultado bate
// com a leitura completa: nenhuma peça com saldo no banco fica de fora da lista e as
// negativas vêm. Então: peça fora da lista = saldo 0 (o CMC fica como está), e só grava
// a linha que mudou — antes eram ~10 mil UPDATEs por rodada mesmo sem mudança.

export interface PosicaoPeca { saldo: number; cmc: number }
export interface LinhaBancoSaldo { codigo_produto: number; estoque: number | null; cmc: number | null }
export interface AtualizacaoSaldo { codigo_produto: number; estoque: number; cmc: number; valor_estoque: number }

export interface PlanoSaldos {
  atualizar: AtualizacaoSaldo[]
  /** quantas das atualizações são "saiu da lista → saldo 0" */
  zerados: number
  /** peças com saldo na Omie que ainda não têm linha no banco (o cadastro cria) */
  semLinha: number
}

// `produtos.estoque` guarda 4 casas e a Omie manda 6 (1,032111 → 1,0321): comparar mais fino
// que isso regravava as mesmas peças de saldo fracionado a cada rodada (visto 28/10).
const TOL_SALDO = 1e-4
const TOL_CMC = 0.005

/** Soma o saldo das peças por local e faz o CMC médio ponderado pelo saldo (igual ao sync completo). */
export function agregarPosicoes(itens: { nCodProd?: number; nSaldo?: number; fisico?: number; nCMC?: number }[]): Map<number, PosicaoPeca> {
  const acc = new Map<number, { saldo: number; soma: number; peso: number }>()
  for (const p of itens) {
    const id = Number(p.nCodProd)
    if (!id) continue
    const saldo = Number(p.nSaldo ?? p.fisico ?? 0) || 0
    const cmc = Number(p.nCMC ?? 0) || 0
    const e = acc.get(id) || { saldo: 0, soma: 0, peso: 0 }
    e.saldo += saldo
    if (cmc > 0) { const peso = saldo > 0 ? saldo : 1; e.soma += cmc * peso; e.peso += peso }
    acc.set(id, e)
  }
  const out = new Map<number, PosicaoPeca>()
  for (const [id, e] of acc) out.set(id, { saldo: e.saldo, cmc: e.peso > 0 ? e.soma / e.peso : 0 })
  return out
}

export function planejarSaldos(lista: Map<number, PosicaoPeca>, banco: LinhaBancoSaldo[]): PlanoSaldos {
  const atualizar: AtualizacaoSaldo[] = []
  let zerados = 0
  const noBanco = new Set<number>()
  for (const r of banco) {
    const id = Number(r.codigo_produto)
    noBanco.add(id)
    const atualSaldo = Number(r.estoque) || 0
    const atualCmc = Number(r.cmc) || 0
    const pos = lista.get(id)
    const saldo = pos ? pos.saldo : 0
    // fora da lista não traz CMC: mantém o do banco
    const cmc = pos && pos.cmc > 0 ? pos.cmc : atualCmc
    if (Math.abs(saldo - atualSaldo) <= TOL_SALDO && Math.abs(cmc - atualCmc) <= TOL_CMC) continue
    if (!pos) zerados++
    atualizar.push({ codigo_produto: id, estoque: saldo, cmc, valor_estoque: saldo * cmc })
  }
  let semLinha = 0
  for (const id of lista.keys()) if (!noBanco.has(id)) semLinha++
  return { atualizar, zerados, semLinha }
}

/**
 * Trava contra resposta estranha da Omie (lista vazia/cortada): recusa o plano que
 * zeraria peças demais de uma vez. Uma rodada normal zera 0–5 peças.
 */
export function zeramentoSuspeito(plano: PlanoSaldos, banco: LinhaBancoSaldo[]): string | null {
  const comSaldo = banco.filter((r) => (Number(r.estoque) || 0) !== 0).length
  const limite = Math.max(30, Math.ceil(comSaldo * 0.1))
  if (plano.zerados > limite) {
    return `a Omie deixou ${plano.zerados} peças com saldo fora da lista (limite ${limite}) — nada gravado; o sync completo da noite confere`
  }
  return null
}
