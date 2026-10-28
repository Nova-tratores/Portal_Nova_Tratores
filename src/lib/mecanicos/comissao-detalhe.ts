// Comissão do técnico OS por OS (José, 19/10/2026: "lá dentro já fazer a comissão dele — verifica
// no RH e no sistema Omie completo"). Mesma régua do painel do Omie (SistemaCompletoOmie,
// /api/dashboard-vendedor), que é de onde o RH importa a comissão do mês:
//   - OS faturada (normal, revisão, garantia) e OS interna/cortesia: % do técnico sobre o R$ das
//     HORAS, dividido pelo nº de técnicos da OS;
//   - entrega técnica / montagem / demonstração: valor FIXO pelo contrato, dividido;
//   - garantia da loja (contrato GARANTIA-NT): não paga comissão;
//   - AJUSTE MANUAL da OS (comissoes_os_relatorio — é onde o RH grava quando corrige uma OS):
//       por_tecnico = valor FINAL daquele técnico (sem dividir); valor = total da OS (divide);
//       data_ref = a OS passa a contar em outro mês;
//   - OS preenchida esperando faturar = "a caminho" (entra quando faturar).
// Puro — testado em __tests__/comissao-detalhe.test.ts.
import { projetarMes } from './comissao'
import { fixoPelaRegra, naoPagaPelaRegra, REGRAS_PADRAO, type RegrasComissao } from './regras-comissao'
import type { InternaFechada, OSFaturada } from './painel'
import type { Pendencia } from './pendencias'

export interface AjusteManual { numero: string; valor: number | null; dataRef: string | null; porTecnico: Record<string, number> | null }
export interface MotivoAjuste { motivo: string; por: string | null; em: string; de: string | null }

export interface LinhaComissao {
  os: string
  numeroOmie: string | null
  cliente: string
  data: string
  tipo: 'faturada' | 'interna' | 'aguardando'
  /** em palavras: como saiu o valor */
  regra: string
  /** R$ das horas da OS (base do %); fixo = 0 */
  base: number
  divisao: number
  /** técnicos que dividem a OS (régua da comissão) */
  tecnicos?: string[]
  /** o que a regra automática daria */
  calculado: number
  /** o que vale (com ajuste manual, se houver) */
  valor: number
  ajustada: boolean
  motivo?: MotivoAjuste
  /** a data foi mudada por ajuste (data_ref) */
  movidaDe?: string
  garantia?: boolean
  /** no portal a OS está em nome de outro técnico (a comissão segue o Omie) */
  outroTecnicoNoPortal?: boolean
}

export interface ComissaoDetalhada {
  tecnico: string
  mes: string
  pct: number
  linhas: LinhaComissao[]
  faturadas: number
  internas: number
  ajustes: number
  total: number
  aguardando: number
  projecao: number
  qtdOS: number
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const palavras = (s: string): string[] => norm(s).match(/[A-Z]{3,}/g) || []
const r2 = (n: number) => Math.round(n * 100) / 100

/** A chave do ajuste ("GABRIEL GOMES DE MORAES") é deste técnico ("Gabriel Moraes")? */
export function chaveDoTecnico(chave: string, tecnico: string): boolean {
  const t = palavras(tecnico), k = palavras(chave)
  if (!t.length || !k.length) return false
  return t.every((w) => k.includes(w)) || k.every((w) => t.includes(w))
}

/** Técnicos que recebem a comissão da OS: os do Omie (régua do painel); sem eles, os do portal. */
/** Teto da hora que a montadora paga na garantia (SistemaCompletoOmie: TETO_HORA_MONTADORA). */
export const TETO_HORA_MONTADORA = 100

const tecnicosDaComissao = (o: { tecnicos: string[]; tecnicosOmie?: string[] }) => (o.tecnicosOmie?.length ? o.tecnicosOmie : o.tecnicos)

const dataAjustada = (a: AjusteManual | undefined, data: string) =>
  a?.dataRef && /^\d{4}-\d{2}-\d{2}/.test(a.dataRef) ? a.dataRef.slice(0, 10) : data

/**
 * Comissão de `tecnico` no mês `mes` (YYYY-MM). `faturadas`/`internas` podem vir de uma janela maior
 * que o mês (OS com data_ref mudada para este mês entram; as mudadas para outro saem).
 */
export function comissaoDoTecnico(args: {
  tecnico: string; mes: string; hoje: string; pct: number
  faturadas: OSFaturada[]; internas: (InternaFechada & { valorHoras?: number })[]; pendencias?: Pendencia[]
  ajustes: Map<string, AjusteManual>; motivos?: Map<string, MotivoAjuste>
  /** regras editáveis (valores fixos e o que não paga); sem elas, as do painel do Omie */
  regras?: RegrasComissao
  /** % definida na OS pelo pós-vendas (chave = Id_Ordem), no lugar da % do técnico */
  pctPorOS?: Map<string, { pct: number; motivo: string; pcts?: Record<string, number> | null }>
}): ComissaoDetalhada {
  const { tecnico, mes, hoje, pct, ajustes, motivos } = args
  const regras = args.regras || REGRAS_PADRAO
  const linhas: LinhaComissao[] = []
  const pctTxt = `${pct}%`
  // a OS pode ter % própria (José, 20/10/2026) — vale para todos os técnicos dela
  // e, desde 22/10/2026, uma % para cada técnico (pcts); quem não está no mapa usa a % única da OS
  const pctDa = (os: string) => {
    const p = args.pctPorOS?.get(os)
    if (!p) return { v: pct, txt: pctTxt }
    const k = p.pcts ? Object.keys(p.pcts).find((c) => chaveDoTecnico(c, tecnico)) : undefined
    const v = k != null ? Number(p.pcts![k]) : p.pct
    return { v, txt: `${String(v).replace(".", ",")}% (definido na OS: ${p.motivo})` }
  }

  const aplicar = (l: Omit<LinhaComissao, 'valor' | 'ajustada' | 'motivo'>, aj: AjusteManual | undefined, n: number): LinhaComissao => {
    let valor = l.calculado, ajustada = false
    if (aj?.porTecnico) {
      const k = Object.keys(aj.porTecnico).find((c) => chaveDoTecnico(c, tecnico))
      if (k != null && Number.isFinite(Number(aj.porTecnico[k]))) { valor = Number(aj.porTecnico[k]); ajustada = true }
    } else if (aj && aj.valor != null && Number.isFinite(aj.valor)) { valor = aj.valor / n; ajustada = true }
    const num = l.numeroOmie || l.os
    return { ...l, valor: r2(valor), calculado: r2(l.calculado), ajustada: ajustada && Math.abs(valor - l.calculado) > 0.004, motivo: motivos?.get(num) }
  }

  for (const o of args.faturadas) {
    const tecs = tecnicosDaComissao(o)
    if (!tecs.includes(tecnico)) continue
    const aj = ajustes.get(o.numeroOmie || o.os) || ajustes.get(o.os)
    const data = dataAjustada(aj, o.data)
    if (!data.startsWith(mes)) continue
    const n = Math.max(1, tecs.length)
    const po = pctDa(o.os)
    linhas.push(aplicar({
      os: o.os, numeroOmie: o.numeroOmie, cliente: o.cliente, data, tipo: 'faturada', garantia: !!o.garantia, tecnicos: tecs, outroTecnicoNoPortal: !o.tecnicos.includes(tecnico),
      regra: `${po.txt} das horas${n > 1 ? ` ÷ ${n} técnicos` : ''}`,
      base: r2(o.servico), divisao: n, calculado: (o.servico / n) * (po.v / 100),
      movidaDe: data !== o.data ? o.data : undefined,
    }, aj, n))
  }

  for (const x of args.internas) {
    const tecs = tecnicosDaComissao(x)
    if (!tecs.includes(tecnico)) continue
    const aj = ajustes.get(x.numeroOmie || x.os) || ajustes.get(x.os)
    const data = dataAjustada(aj, x.data)
    if (!data.startsWith(mes)) continue
    const n = Math.max(1, tecs.length)
    const naoPaga = naoPagaPelaRegra(`${x.contrato} ${x.motivo} ${x.cliente}`, regras)
    const garantiaLoja = !!naoPaga
    const fixo = garantiaLoja ? null : fixoPelaRegra(x.contrato, regras)
    const fixa = fixo ? fixo.valor : null
    // garantia da FÁBRICA ainda não faturada (contrato "-pgo" fechado sem nota): a comissão sai sobre a hora
    // limitada ao teto que a montadora paga (R$ 100/h) — régua do painel do Omie (tetoMontadoraGarantia)
    const garantiaFabrica = !garantiaLoja && fixa == null && norm(x.contrato).includes('PGO')
    const vh = x.valorHoras ?? 0
    const po = pctDa(x.os)
    const baseHoras = garantiaFabrica && x.horas > 0 ? Math.min(vh, x.horas * TETO_HORA_MONTADORA) : vh
    const calculado = garantiaLoja ? 0 : fixa != null ? fixa / n : (baseHoras / n) * (po.v / 100)
    const regra = naoPaga ? `não paga: ${naoPaga.motivo || naoPaga.nome}`
      : fixa != null ? `valor fixo de ${fixa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${fixo!.regra.nome})${n > 1 ? ` ÷ ${n}` : ''}`
        : garantiaFabrica ? `${po.txt} das horas no teto da fábrica (R$ ${TETO_HORA_MONTADORA}/h — garantia a receber: ${x.contrato})${n > 1 ? ` ÷ ${n}` : ''}`
          : `${po.txt} das horas (interna: ${x.contrato || x.motivo})${n > 1 ? ` ÷ ${n}` : ''}`
    linhas.push(aplicar({
      os: x.os, numeroOmie: x.numeroOmie, cliente: x.cliente, data, tipo: 'interna', tecnicos: tecs,
      regra, base: r2(fixa != null || garantiaLoja ? 0 : baseHoras), divisao: n, calculado,
      movidaDe: data !== x.data ? x.data : undefined,
    }, aj, n))
  }

  const ehMesAtual = hoje.startsWith(mes)
  if (ehMesAtual) for (const p of args.pendencias || []) {
    if (p.tipo !== 'preenchida' || !p.tecnicos.includes(tecnico)) continue
    const n = Math.max(1, p.tecnicos.length)
    const po = pctDa(p.os)
    linhas.push({
      os: p.os, numeroOmie: null, cliente: p.cliente, data: p.dataRef || hoje, tipo: 'aguardando', garantia: p.garantia, tecnicos: p.tecnicos,
      regra: `${po.txt} das horas${n > 1 ? ` ÷ ${n}` : ''} — entra quando faturar`,
      base: r2(p.maoDeObra), divisao: n, calculado: r2((p.maoDeObra / n) * (po.v / 100)), valor: r2((p.maoDeObra / n) * (po.v / 100)), ajustada: false,
    })
  }

  linhas.sort((a, b) => (a.tipo === 'aguardando' ? 1 : 0) - (b.tipo === 'aguardando' ? 1 : 0) || b.data.localeCompare(a.data) || a.os.localeCompare(b.os))
  const soma = (f: (l: LinhaComissao) => boolean, k: 'valor' | 'calculado' = 'valor') => r2(linhas.filter(f).reduce((s, l) => s + l[k], 0))
  const faturadas = soma((l) => l.tipo === 'faturada'), internas = soma((l) => l.tipo === 'interna')
  const total = r2(faturadas + internas)
  const ajustes_ = r2(total - soma((l) => l.tipo !== 'aguardando', 'calculado'))
  return {
    tecnico, mes, pct, linhas, faturadas, internas, ajustes: ajustes_, total,
    aguardando: soma((l) => l.tipo === 'aguardando'),
    projecao: ehMesAtual ? projetarMes(total, mes, hoje) : total,
    qtdOS: Math.round(linhas.filter((l) => l.tipo !== 'aguardando').reduce((s, l) => s + 1 / l.divisao, 0) * 10) / 10,
  }
}
