// REUNIÕES — lista e criação.
// GET  /api/reunioes?visao=proximas|historico|minhas[&serie=uuid] -> { reunioes, presencas, itens, usuarios, series }
// POST /api/reunioes { serie_id?, dia:'YYYY-MM-DD', hora:'HH:MM', titulo?, descricao?, secretario_id?, participantes?: uuid[], visibilidade?, duracao_min? }
//   Avulsa: quem cria é o condutor. Da série: só condutor da série ou admin.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { avisoMesmaPessoa, secretarioDaVez } from '@/lib/reunioes/regras'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import {
  listarReunioes, criarReuniao, carregarSerie, podeGerirSerie, usuariosMin, listarSeries, uuidValido,
  migrationFaltou, MSG_MIGRATION_REUNIOES, type VisaoReunioes,
} from '@/lib/reunioes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const visaoParam = req.nextUrl.searchParams.get('visao') || 'proximas'
  if (!['proximas', 'historico', 'minhas'].includes(visaoParam)) return NextResponse.json({ error: 'visão inválida' }, { status: 400 })
  try {
    const [lista, series] = await Promise.all([
      listarReunioes(auth, visaoParam as VisaoReunioes, req.nextUrl.searchParams.get('serie')),
      listarSeries(auth, false),
    ])
    const ids = [...new Set([...Object.values(lista.presencas).flat().map((p) => p.usuario_id), ...lista.reunioes.map((r) => r.solicitante_id)])]
    const usuarios = await usuariosMin(ids)
    return NextResponse.json({ ...lista, usuarios, series })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ reunioes: [], presencas: {}, itens: {}, usuarios: {}, series: [], migracaoFaltando: true, error: MSG_MIGRATION_REUNIOES })
    console.error('[reunioes] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar as reuniões' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const dia = String(body.dia || '')
  const hora = String(body.hora || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: 'Informe o dia da reunião.' }, { status: 400 })
  if (!/^\d{2}:\d{2}$/.test(hora)) return NextResponse.json({ error: 'Informe a hora (HH:MM).' }, { status: 400 })
  if (dia < hojeSP()) return NextResponse.json({ error: 'A reunião não pode ser no passado.' }, { status: 400 })
  const participantes = Array.isArray(body.participantes) ? (body.participantes as unknown[]).filter(uuidValido) : []
  const secretario = body.secretario_id ? (uuidValido(body.secretario_id) ? body.secretario_id : null) : undefined
  if (body.secretario_id && !secretario) return NextResponse.json({ error: 'Secretário inválido.' }, { status: 400 })
  try {
    let serie = null
    if (body.serie_id) {
      serie = await carregarSerie(String(body.serie_id))
      if (!serie) return NextResponse.json({ error: 'Série não encontrada' }, { status: 404 })
      if (!podeGerirSerie(serie, auth)) return NextResponse.json({ error: 'Só o condutor da série (ou admin) marca reunião dela.' }, { status: 403 })
    }
    const condutor = serie?.condutor_id || auth.userId
    const sec = secretario === undefined ? (serie ? secretarioDaVez(serie) : null) : secretario
    const r = await criarReuniao(auth, {
      serie, dia, hora, titulo: body.titulo ? String(body.titulo) : null, descricao: body.descricao ? String(body.descricao) : null,
      condutor_id: condutor, secretario_id: sec, participantes,
      visibilidade: body.visibilidade === 'privado' ? 'privado' : body.visibilidade === 'publico' ? 'publico' : undefined,
      duracao_min: body.duracao_min ? Math.round(Number(body.duracao_min)) : null,
    })
    return NextResponse.json({ reuniao: r.ticket, aviso: avisoMesmaPessoa(condutor, sec) })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes] POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao criar a reunião' }, { status: 500 })
  }
}
