// Acessos do site (portal, módulo Site → Acessos). ?dias=1|7|30|90 ou ?mes=AAAA-MM (José, 11/11: "ver por mês") → resumo + visitas recentes com a jornada.
// Junto: o mesmo tamanho de período logo antes (para comparar) e os pedidos de proposta do período (máquina, linha, cidade, situação).
// ?exemplo=1 (José, 11/11: "muita informação faltando" com o site ainda fora do ar): números inventados só para ver a tela cheia.
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, guardarSite, sb, semMigration } from '@/lib/marketing/redes/server'
import { montarVisitas, resumir, type EventoSite } from '@/lib/marketing/redes/acessos'
import { eventosExemplo, pedidosExemplo } from '@/lib/marketing/redes/acessos-exemplo'

export const runtime = 'nodejs'

type PedidoLinha = { interesse: string | null; linha: string | null; cidade: string | null; status: string; valor: number | null }
export type ResumoPedidos = {
  total: number
  porMaquina: { nome: string; total: number }[]
  porLinha: { nome: string; total: number }[]
  porCidade: { nome: string; total: number }[]
  porStatus: { status: string; total: number }[]
  valorTotal: number
}

const NOME_LINHA: Record<string, string> = {
  pronaf1: 'Pronaf', pronaf5: 'Pronaf', pronamp: 'Pronamp', moderfrota: 'Moderfrota', finame: 'Finame', consorcio: 'Consórcio', 'nao-sei': 'Ainda não sabe',
}

function resumirPedidos(lista: PedidoLinha[]): ResumoPedidos {
  const conta = (f: (p: PedidoLinha) => string | null) => {
    const m = new Map<string, number>()
    for (const p of lista) { const k = f(p); if (k) m.set(k, (m.get(k) || 0) + 1) }
    return [...m].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
  }
  // cidade digitada à mão: "piraju", "Piraju - SP" e "PIRAJU/SP" contam juntas
  const cidade = (c: string | null) => {
    const t = (c || '').split(/[-/,(]/)[0].trim().toLowerCase()
    return t ? t.replace(/(^|\s)\S/g, (l) => l.toUpperCase()) : null
  }
  return {
    total: lista.length,
    porMaquina: conta((p) => p.interesse?.trim() || 'Não escolheu'),
    porLinha: conta((p) => (p.linha ? NOME_LINHA[p.linha] || p.linha : 'Não informou')),
    porCidade: conta((p) => cidade(p.cidade) || 'Não informou'),
    porStatus: conta((p) => p.status).map(({ nome, total }) => ({ status: nome, total })),
    valorTotal: lista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
  }
}

async function buscarEventos(desde: string, ate: string): Promise<{ eventos: EventoSite[]; erro?: string }> {
  const eventos: EventoSite[] = []
  // paginado: até 50 mil eventos no período
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await sb.from('site_eventos')
      .select('em, tipo, visitante, sessao, caminho, titulo, origem, utm, campanha, aparelho, evento, rotulo, tempo_s, rolou')
      .gte('em', desde).lt('em', ate)
      .order('em', { ascending: true }).range(de, de + 999)
    if (error) return { eventos, erro: error.message }
    eventos.push(...((data || []) as EventoSite[]))
    if (!data || data.length < 1000) break
  }
  return { eventos }
}

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const params = new URL(req.url).searchParams
  const pedido = Number(params.get('dias'))
  const dias = [1, 7, 30, 90].includes(pedido) ? pedido : 7
  const exemplo = params.get('exemplo') === '1'
  // Mês fechado pelo relógio de Piraju (-03:00, sem horário de verão)
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('mes') || '') ? params.get('mes')! : null
  let desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  let ate = new Date(Date.now() + 60_000).toISOString()
  if (mes) {
    const [a, m] = mes.split('-').map(Number)
    desde = new Date(`${mes}-01T00:00:00-03:00`).toISOString()
    ate = new Date(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00-03:00`).toISOString()
  }
  // Período anterior do mesmo tamanho (7 dias antes dos 7 dias; o mês anterior inteiro)
  let antesDe: string
  const antesAte = desde
  if (mes) {
    const [a, m] = mes.split('-').map(Number)
    const ma = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    antesDe = new Date(`${ma}-01T00:00:00-03:00`).toISOString()
  } else {
    antesDe = new Date(Date.parse(desde) - dias * 86_400_000).toISOString()
  }

  let eventos: EventoSite[], eventosAntes: EventoSite[], pedidos: PedidoLinha[], pedidosAntes: number
  if (exemplo) {
    eventos = eventosExemplo(desde, ate, 1)
    eventosAntes = eventosExemplo(antesDe, antesAte, 2, 0.8)
    pedidos = pedidosExemplo(eventos)
    pedidosAntes = Math.round(pedidos.length * 0.7)
  } else {
    const [atual, antes] = await Promise.all([buscarEventos(desde, ate), buscarEventos(antesDe, antesAte)])
    const erro = atual.erro || antes.erro
    if (erro) {
      const falta = semMigration(erro)
      return NextResponse.json({ ok: false, erro: falta ? AVISO_MIGRATION : erro }, { status: falta ? 503 : 500 })
    }
    eventos = atual.eventos; eventosAntes = antes.eventos
    const [pa, pb] = await Promise.all([
      sb.from('site_pedidos').select('interesse, linha, cidade, status, valor').gte('criado_em', desde).lt('criado_em', ate).limit(5000),
      sb.from('site_pedidos').select('id', { count: 'exact', head: true }).gte('criado_em', antesDe).lt('criado_em', antesAte),
    ])
    pedidos = (pa.data || []) as PedidoLinha[]
    pedidosAntes = pb.count ?? 0
  }

  const visitas = montarVisitas(eventos)
  const va = montarVisitas(eventosAntes)
  return NextResponse.json({
    ok: true, dias, mes, exemplo,
    resumo: resumir(visitas),
    anterior: {
      visitas: va.length, visitantes: new Set(va.map((v) => v.visitante)).size,
      conversoes: va.filter((v) => v.converteu).length, pedidos: pedidosAntes,
    },
    pedidos: pedidos.length,
    pedidosResumo: resumirPedidos(pedidos),
    visitas: visitas.slice(0, 80),
  })
}
