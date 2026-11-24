// CARGA DA EQUIPE (24/11/2026) — "quem está ocupado", com filtro por setor.
// GET /api/trabalho/carga                   -> todas as pessoas da agenda (setor vem da função)
// GET /api/trabalho/carga?user=<id>         -> só uma pessoa (o formulário de pedido usa)
// GET /api/trabalho/carga?user=<id>&itens=1 -> + a fila dela, na ordem ("o que ocupa as horas")
// Os números (itens, horas, ocupada até, atrasados) são de todos. Nos ITENS, o título só aparece
// para quem pode ver o ticket (público, pediu, faz, participa, admin); o resto vira
// "Outro compromisso" com as horas e as datas — mesma regra da /api/trabalho/fila.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { carregarDiretorio } from '@/lib/agenda/server'
import { resumoDasFilas, feriadosDoAno } from '@/lib/trabalho/fila-server'
import { diasUteisEntre } from '@/lib/trabalho/fila'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const dir = await carregarDiretorio()
    const sp = req.nextUrl.searchParams
    const so = sp.get('user')
    const comItens = !!so && sp.get('itens') === '1'
    const pessoas = dir.pessoas.filter((p) => !so || p.id === so)
    const filas = await resumoDasFilas(pessoas.map((p) => p.id), { detalhes: comItens })
    const hoje = hojeSP()
    const feriados = feriadosDoAno(hoje)

    let itens: unknown[] | undefined
    if (comItens && so) {
      const f = filas.get(so)
      const todos = f ? [...f.hoje, ...f.semana, ...f.listaDepois, ...f.listaContinuos] : []
      // Em quais desses eu participo (para poder ver o título).
      const { data: parts } = todos.length
        ? await supabaseAdmin.from('tickets_participantes').select('ticket_id').eq('user_id', auth.userId).is('removido_em', null).in('ticket_id', todos.map((i) => i.id))
        : { data: [] }
      const participo = new Set((parts || []).map((p) => p.ticket_id as string))
      const vejo = (i: (typeof todos)[number]) => auth.isAdmin || so === auth.userId || i.visibilidade === 'publico' || i.solicitante_id === auth.userId || participo.has(i.id)
      itens = todos.map((i) => (vejo(i)
        ? { id: i.id, numero: i.numero, titulo: i.titulo, horas: i.horas, inicio: i.inicio, fim: i.fim, prazo: i.prazo, atrasado: i.atrasado, urgente: i.urgente, continuo: i.continuo, status: i.status, pedidoPor: i.pedidoPor ?? null, semEstimativa: i.semEstimativa, oculto: false }
        : { id: null, numero: 0, titulo: 'Outro compromisso', horas: i.horas, inicio: i.inicio, fim: i.fim, prazo: null, atrasado: false, urgente: false, continuo: i.continuo, status: '', pedidoPor: null, semEstimativa: false, oculto: true }))
    }

    return NextResponse.json({
      eu: auth.userId,
      pessoas: pessoas.map((p) => {
        const f = filas.get(p.id)
        return {
          id: p.id, nome: p.nome, setor: p.setor, avatar_url: p.avatar_url,
          itens: f?.total || 0, horas: Math.round(f?.horas || 0), atrasados: f?.atrasados || 0,
          aceitar: f?.aceitar || 0, livreEm: f?.livreEm || '', hoje: f?.hoje.length || 0,
          // dias úteis de fila (de hoje até "ocupada até"): é o que a barra desenha
          diasFila: f?.livreEm && f.livreEm >= hoje ? diasUteisEntre(hoje, f.livreEm, feriados) : 0,
        }
      }),
      ...(itens ? { itensDaFila: itens } : {}),
    })
  } catch (e) {
    console.error('[carga] GET', e)
    return NextResponse.json({ error: 'Falha ao calcular a carga' }, { status: 500 })
  }
}
