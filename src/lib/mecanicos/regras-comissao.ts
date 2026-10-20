// Regras EDITÁVEIS da comissão dos técnicos (José, 20/10/2026: "mostrando os valores que são fixos, como a
// entrega técnica e outros, deixa para editar esses valores e para adicionar"). Puro — testado.
//  - FIXOS: OS cujo contrato tem as palavras → valor fixo (dividido entre os técnicos), em vez do % das horas.
//    A 1ª regra que casar vale (a ordem importa: "montagem de desligamento" antes de "montagem").
//  - NÃO PAGA: OS cujo contrato/cliente/serviço tem as palavras → comissão zero (com o motivo), a não ser
//    que tenha uma das palavras da exceção.
// Os padrões repetem a regra do painel do Omie (SistemaCompletoOmie) — sem mexer, os números não mudam.

export interface RegraFixa { id: string; nome: string; palavras: string[]; exceto: string[]; valor: number; ativo: boolean }
export interface RegraNaoPaga { id: string; nome: string; palavras: string[]; exceto: string[]; motivo: string; ativo: boolean }
export interface RegrasComissao { fixos: RegraFixa[]; naoPaga: RegraNaoPaga[]; atualizadoEm?: string | null; atualizadoPor?: string | null }

export const REGRAS_PADRAO: RegrasComissao = {
  fixos: [
    { id: 'carreta', nome: 'Entrega / montagem de carreta', palavras: ['CARRETA'], exceto: [], valor: 250, ativo: true },
    { id: 'montagem-desligamento', nome: 'Montagem com desligamento', palavras: ['MONTAGEM', 'DESLIGAMENT'], exceto: [], valor: 400, ativo: true },
    { id: 'montagem', nome: 'Montagem', palavras: ['MONTAGEM'], exceto: ['QUAD'], valor: 500, ativo: true },
    { id: 'montagem-quadri', nome: 'Montagem de quadriciclo', palavras: ['MONTAGEM', 'QUAD'], exceto: [], valor: 150, ativo: true },
    { id: 'entrega', nome: 'Entrega técnica / revisão de pré-entrega', palavras: ['ENTREGA'], exceto: [], valor: 150, ativo: true },
    { id: 'demonstracao', nome: 'Demonstração', palavras: ['DEMONSTRACAO'], exceto: [], valor: 150, ativo: true },
  ],
  naoPaga: [
    { id: 'garantia-loja', nome: 'Garantia da loja', palavras: ['GARANTIA-NT'], exceto: [], motivo: 'garantia da loja não paga comissão', ativo: true },
    { id: 'reservico', nome: 'Reserviço / retrabalho', palavras: ['RESERVICO'], exceto: [], motivo: 'reserviço (voltou para refazer) não paga', ativo: true },
    { id: 'retrabalho', nome: 'Retrabalho', palavras: ['RETRABALHO'], exceto: [], motivo: 'retrabalho não paga', ativo: true },
    { id: 'estrutura', nome: 'Serviço na estrutura da própria oficina', palavras: ['ESTRUTURA'], exceto: ['ENTREGA', 'MONTAGEM'], motivo: 'serviço para a própria oficina não paga', ativo: true },
  ],
}

export const normRegra = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const casa = (texto: string, palavras: string[], exceto: string[]) => {
  const t = normRegra(texto)
  const ps = palavras.map(normRegra).filter(Boolean)
  return ps.length > 0 && ps.every((p) => t.includes(p)) && !exceto.map(normRegra).filter(Boolean).some((p) => t.includes(p))
}

/** Valor fixo pela 1ª regra que casar com o contrato (null = vai pelo % das horas). */
export function fixoPelaRegra(contrato: string, regras: RegrasComissao = REGRAS_PADRAO): { valor: number; regra: RegraFixa } | null {
  for (const r of regras.fixos) if (r.ativo && casa(contrato, r.palavras, r.exceto)) return { valor: r.valor, regra: r }
  return null
}

/** Regra de "não paga" que casa com o texto da OS (contrato + cliente + serviço). */
export function naoPagaPelaRegra(texto: string, regras: RegrasComissao = REGRAS_PADRAO): RegraNaoPaga | null {
  for (const r of regras.naoPaga) if (r.ativo && casa(texto, r.palavras, r.exceto)) return r
  return null
}

/** Limpa o que vem da tela: textos em maiúsculas sem acento, valores ≥ 0, ids únicos. */
export function validarRegras(x: unknown): RegrasComissao {
  const o = (x || {}) as Partial<RegrasComissao>
  const lista = (v: unknown) => (Array.isArray(v) ? v : []).map((p) => normRegra(p).trim()).filter(Boolean)
  const id = (s: unknown, i: number, pre: string) => String(s || `${pre}-${i}`).replace(/[^\w-]/g, '').slice(0, 40) || `${pre}-${i}`
  const vistos = new Set<string>()
  const unico = (s: string) => { let k = s, n = 2; while (vistos.has(k)) k = `${s}-${n++}`; vistos.add(k); return k }
  return {
    fixos: (Array.isArray(o.fixos) ? o.fixos : []).map((r, i) => ({ id: unico(id(r.id, i, 'fixo')), nome: String(r.nome || '').trim().slice(0, 80) || 'Sem nome', palavras: lista(r.palavras), exceto: lista(r.exceto), valor: Math.max(0, Math.round((Number(r.valor) || 0) * 100) / 100), ativo: r.ativo !== false })),
    naoPaga: (Array.isArray(o.naoPaga) ? o.naoPaga : []).map((r, i) => ({ id: unico(id(r.id, i, 'nao')), nome: String(r.nome || '').trim().slice(0, 80) || 'Sem nome', palavras: lista(r.palavras), exceto: lista(r.exceto), motivo: String(r.motivo || '').trim().slice(0, 140), ativo: r.ativo !== false })),
  }
}
