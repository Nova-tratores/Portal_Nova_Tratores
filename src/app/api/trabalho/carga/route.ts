// CARGA DA EQUIPE (24/11/2026) — "quem está ocupado", com filtro por setor.
// GET /api/trabalho/carga                   -> todas as pessoas da agenda (setor vem da função)
// GET /api/trabalho/carga?user=<id>         -> só uma pessoa (o formulário de pedido usa)
// GET /api/trabalho/carga?user=<id>&itens=1 -> + a fila dela, na ordem ("o que ocupa as horas")
// REGRA DE PRIVACIDADE DA EQUIPE (José, melhorias-central-de-trabalho.md): quem vê a fila de OUTRA
// pessoa vê SÓ NÚMEROS (horas, datas, atrasado) — nunca títulos, nem para admin. Na própria fila,
// os títulos aparecem.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { carregarDiretorio } from '@/lib/agenda/server'
import { resumoDasFilas, feriadosDoAno } from '@/lib/trabalho/fila-server'
import { diasUteisEntre } from '@/lib/trabalho/fila'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

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
    const [filas, abertos] = await Promise.all([
      resumoDasFilas(pessoas.map((p) => p.id), { detalhes: comItens }),
      // "Fazendo agora" (melhorias 3.3): cronômetro aberto. Só o SIM/NÃO, nunca o título.
      // Sem a tabela (sql/fila-tempo.sql) ninguém aparece fazendo.
      supabaseAdmin.from('tickets_tempo').select('user_id').is('fim', null).limit(500),
    ])
    const fazendo = new Set(((abertos.error ? [] : abertos.data) || []).map((l: { user_id: string }) => l.user_id))
    const hoje = hojeSP()
    const feriados = feriadosDoAno(hoje)

    let itens: unknown[] | undefined
    if (comItens && so) {
      const f = filas.get(so)
      const todos = f ? [...f.hoje, ...f.semana, ...f.listaDepois, ...f.listaContinuos] : []
      // Só a própria fila mostra títulos (regra de privacidade da Equipe).
      const vejo = () => so === auth.userId
      itens = todos.map((i) => (vejo()
        ? { id: i.id, numero: i.numero, titulo: i.titulo, horas: i.horas, inicio: i.inicio, fim: i.fim, prazo: i.prazo, atrasado: i.atrasado, urgente: i.urgente, continuo: i.continuo, status: i.status, pedidoPor: i.pedidoPor ?? null, semEstimativa: i.semEstimativa, oculto: false }
        : { id: null, numero: 0, titulo: 'Pedido', horas: i.horas, inicio: i.inicio, fim: i.fim, prazo: null, atrasado: i.atrasado, urgente: false, continuo: i.continuo, status: '', pedidoPor: null, semEstimativa: false, oculto: true }))
    }

    return NextResponse.json({
      eu: auth.userId,
      pessoas: pessoas.map((p) => {
        const f = filas.get(p.id)
        return {
          id: p.id, nome: p.nome, setor: p.setor, avatar_url: p.avatar_url,
          itens: f?.total || 0, horas: Math.round(f?.horas || 0), atrasados: f?.atrasados || 0,
          aceitar: f?.aceitar || 0, livreEm: f?.livreEm || '', hoje: f?.hoje.length || 0,
          bolasParadas: f?.bolasParadas || 0, fazendoAgora: fazendo.has(p.id),
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
