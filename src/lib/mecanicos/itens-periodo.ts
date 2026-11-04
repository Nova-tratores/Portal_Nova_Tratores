// A conta do painel "Faturamento por período" num lugar só (José, 04/11/2026: "todos os cards da Gestão do Pós-Vendas
// dependem do valor do painel; se alterar lá, já atualiza os outros"). A tela (FaturamentoPeriodo) e as comissões do
// escritório (comissao-escritorio-server) usam ESTA lista: OS faturadas, garantias do módulo, internas e as que
// esperam faturar. Conta pura, serve para o navegador e para o servidor.
import type { BaseDados } from './painel'
import { diaBR, INICIO_GARANTIAS_MODULO } from './garantias-painel'

export type Grupo = 'faturada' | 'garantia' | 'interna' | 'aguardando'

/** Garantia do módulo (o que /api/mecanicos/garantias devolve, só os campos usados aqui). */
export interface GarantiaModulo { numero: string; os: string | null; cliente: string | null; tecnico: string | null; status: string; finalizadaEm: string | null; pago: number; pagoHoras: number; pagoKm: number; pagoPecas: number; horas: number; km: number }

export interface ItemFat { os: string; numero: string | null; cliente: string; tecnicos: string[]; data: string; grupo: Grupo; bruto: number; servico: number; horas: number; kmValor: number; km: number; pecas: number; outros: number; /** tipo da interna (Cortesia, Entrega técnica…) */ subtipo?: string }

/** Tipo da OS interna pelo contrato do Omie, juntando as grafias (José, 04/11/2026: "dentro do tipo, os tipos de internas"). */
export function tipoInterna(contrato: string | null | undefined): string {
  const c = String(contrato || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (!c || c.startsWith('tipo de servico')) return 'Interno'
  if (c.startsWith('montagem')) return 'Montagem'
  if (c.startsWith('entrega tec')) return 'Entrega técnica'
  if (c.startsWith('revisao pre')) return 'Revisão pré-entrega'
  if (c === 'cortesia comercial') return 'Cortesia comercial'
  if (c === 'cortesia oficina') return 'Cortesia oficina'
  if (c === 'garantiant') return 'Garantia NT'
  if (c.endsWith('-pgo')) return `${c[0].toUpperCase()}${c.slice(1, -4)} (pago)`
  return `${c[0].toUpperCase()}${c.slice(1)}`
}

export interface AjusteGarantia { bruto: number; mo: number; km: number; pecas: number; outros: number; nOS: number }

/** As notas de garantia faturadas no período, para TIRAR da conta antiga (montarPainel soma OS faturadas com as notas
 *  de garantia): o "Entrou" dos Resultados é só o que o cliente pagou (José, 04/11/2026: "seria o valor sem a garantia"). */
export function garantiasFaturadas(base: BaseDados, de: string, ate: string): AjusteGarantia {
  const a: AjusteGarantia = { bruto: 0, mo: 0, km: 0, pecas: 0, outros: 0, nOS: 0 }
  for (const o of base.faturadas) {
    if (!o.garantia || o.data < de || o.data > ate) continue
    a.bruto += o.bruto + o.pecas; a.mo += o.servico; a.km += o.kmValor; a.pecas += o.pecas; a.outros += o.outros; a.nOS++
  }
  return a
}

/** Junta faturadas, garantias, internas fechadas e as OS preenchidas esperando faturar numa lista só.
 *  Aqui o faturado SOMA as peças (José, 29/10/2026: "pode somar"); as metas da equipe seguem sem peças. */
export function itensDaBase(base: BaseDados, garantias: GarantiaModulo[] = []): ItemFat[] {
  const out: ItemFat[] = []
  const faturadasIds = new Set(base.faturadas.map((o) => o.os))
  // garantia = o que a fábrica aprovou no módulo Garantias, pelo valor pago, no dia da aprovação — o mesmo número da
  // comissão do garantista (José, 04/11/2026: "esse valor tem que ser aplicado lá no painel também"). Antes disso,
  // continua a OS faturada com selo de garantia.
  for (const g of garantias) {
    const d = diaBR(g.finalizadaEm)
    if (g.status !== 'aprovada' || !d || d < INICIO_GARANTIAS_MODULO) continue
    const outros = Math.max(0, g.pago - g.pagoHoras - g.pagoKm - g.pagoPecas)
    out.push({ os: g.os || g.numero, numero: g.numero, cliente: g.cliente || '', tecnicos: g.tecnico ? [g.tecnico] : [], data: d, grupo: 'garantia', bruto: g.pago, servico: g.pagoHoras, horas: g.horas, kmValor: g.pagoKm, km: g.km, pecas: g.pagoPecas, outros })
  }
  for (const o of base.faturadas) if (!(o.garantia && o.data >= INICIO_GARANTIAS_MODULO)) out.push({ os: o.os, numero: o.numeroOmie, cliente: o.cliente, tecnicos: o.tecnicos, data: o.data, grupo: o.garantia ? 'garantia' : 'faturada', bruto: o.bruto + o.pecas, servico: o.servico, horas: o.horasCobradas, kmValor: o.kmValor, km: o.km, pecas: o.pecas, outros: o.outros })
  for (const x of base.internasFechadas || []) {
    if (faturadasIds.has(x.os)) continue
    out.push({ os: x.os, numero: x.numeroOmie, cliente: x.cliente, tecnicos: x.tecnicos, data: x.data, grupo: 'interna', bruto: x.valor, servico: x.valorHoras ?? x.valor, horas: x.horas, kmValor: 0, km: 0, pecas: 0, outros: 0, subtipo: tipoInterna(x.contrato) })
  }
  for (const p of base.pendencias || []) {
    if (p.tipo !== 'preenchida' || !p.dataRef || faturadasIds.has(p.os)) continue
    out.push({ os: p.os, numero: null, cliente: p.cliente, tecnicos: p.tecnicos, data: p.dataRef.slice(0, 10), grupo: 'aguardando', bruto: Math.max(0, p.total), servico: p.maoDeObra, horas: 0, kmValor: p.deslocamento, km: 0, pecas: p.pecas, outros: 0 })
  }
  return out
}
