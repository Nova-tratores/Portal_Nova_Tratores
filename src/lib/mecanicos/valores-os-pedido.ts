// Valores de cada OS do pedido de comissão (José, 05/11/2026: "aparecer para o diretor valor hora, valor km, valor peças,
// valor total e a comissão dele naquele serviço, na hora que ele for autorizar"). Mesma lista da tela Resultados
// (itensDaBase): faturadas, garantias do módulo e internas fechadas.
import { baseComCache } from './base-cache'
import { garantiasPainelComCache } from './garantias-lista'
import { itensDaBase, type GarantiaModulo, type ItemFat } from './itens-periodo'

export interface ValoresOS { hora: number; km: number; pecas: number; outros: number; total: number }

const r2 = (v: number) => Math.round(v * 100) / 100
const deItem = (o: ItemFat): ValoresOS => ({ hora: r2(o.servico), km: r2(o.kmValor), pecas: r2(o.pecas), outros: r2(o.outros), total: r2(o.bruto) })

/** Põe `valores` nas linhas que ainda não têm (pedidos antigos ou recém-feitos). Sem a base, devolve como veio. */
export async function comValoresDasOS<T extends { os: string; numero?: string | null; grupo?: string | null; valores?: ValoresOS | null }>(linhas: T[]): Promise<T[]> {
  if (!linhas.some((l) => !l.valores)) return linhas
  try {
    const [base, gar] = await Promise.all([baseComCache(), garantiasPainelComCache()])
    const itens = itensDaBase(base.dados, (gar.dados.garantias || []) as unknown as GarantiaModulo[])
    // a mesma OS pode estar em dois grupos (faturada e garantia): procura primeiro no grupo da linha
    const grupoDe = (o: ItemFat) => (o.grupo === 'faturada' || o.grupo === 'aguardando' ? 'cliente' : o.grupo)
    const achar = (l: T) => {
      const chaves = [l.os, l.numero].filter(Boolean) as string[]
      const deles = itens.filter((o) => chaves.includes(o.os) || (!!o.numero && chaves.includes(o.numero)))
      return deles.find((o) => !l.grupo || grupoDe(o) === l.grupo) || deles[0]
    }
    return linhas.map((l) => { if (l.valores) return l; const o = achar(l); return o ? { ...l, valores: deItem(o) } : l })
  } catch { return linhas }
}
