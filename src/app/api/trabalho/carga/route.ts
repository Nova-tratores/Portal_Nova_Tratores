// CARGA DA EQUIPE (24/11/2026) — "quem está ocupado", com filtro por setor.
// GET /api/trabalho/carga            -> todas as pessoas da agenda (setor vem da função)
// GET /api/trabalho/carga?user=<id>  -> só uma pessoa (o formulário de pedido usa)
// Só NÚMEROS: itens, horas, livre a partir de, atrasados, pedidos esperando aceite.
// Nenhum título sai daqui, então qualquer logado da Central pode ver a de todo mundo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { carregarDiretorio } from '@/lib/agenda/server'
import { resumoDasFilas } from '@/lib/trabalho/fila-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const dir = await carregarDiretorio()
    const so = req.nextUrl.searchParams.get('user')
    const pessoas = dir.pessoas.filter((p) => !so || p.id === so)
    const filas = await resumoDasFilas(pessoas.map((p) => p.id))
    return NextResponse.json({
      eu: auth.userId,
      pessoas: pessoas.map((p) => {
        const f = filas.get(p.id)
        return {
          id: p.id, nome: p.nome, setor: p.setor, avatar_url: p.avatar_url,
          itens: f?.total || 0, horas: Math.round(f?.horas || 0), atrasados: f?.atrasados || 0,
          aceitar: f?.aceitar || 0, livreEm: f?.livreEm || '', hoje: f?.hoje.length || 0,
        }
      }),
    })
  } catch (e) {
    console.error('[carga] GET', e)
    return NextResponse.json({ error: 'Falha ao calcular a carga' }, { status: 500 })
  }
}
