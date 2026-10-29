// Selo do cartão quando a comissão foi enviada ao diretor (José, 29/10/2026: "quando for enviada fica com um selo
// de enviada comissão e o mês"). Vale o pedido mais novo da pessoa, do mês passado para cá.
import type { PedidoComissao } from '@/lib/mecanicos/lancamento-comissao-server'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const mesAnterior = (m: string) => { const a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - 2; return `${a + Math.floor(x / 12)}-${String(((x % 12) + 12) % 12 + 1).padStart(2, '0')}` }

export function seloEnviada(pedidos: PedidoComissao[] | null | undefined, nome: string): string | null {
  const desde = mesAnterior(mesSP())
  const p = (pedidos || []).filter((x) => x.tecnico === nome && x.mes >= desde && (x.status === 'aguardando' || x.status === 'espelhada')).sort((a, b) => b.mes.localeCompare(a.mes) || b.pedido_em.localeCompare(a.pedido_em))[0]
  if (!p) return null
  const mes = MESES[Number(p.mes.slice(5, 7)) - 1]
  return p.status === 'espelhada' ? `✓ Comissão de ${mes} autorizada` : `Comissão de ${mes} enviada`
}
