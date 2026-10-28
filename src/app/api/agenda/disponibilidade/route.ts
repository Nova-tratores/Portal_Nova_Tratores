// AGENDA PESSOAL — GET /api/agenda/disponibilidade?dia=&inicio=HH:MM&fim=HH:MM&usuarios=id,id
// -> { indisponiveis: [{ usuario_id, nome }], mensagem }. Só quem — nunca o motivo.
// Usado pelo formulário de reunião para avisar antes de salvar (o servidor recusa de novo ao criar).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { indisponiveis } from '@/lib/agenda/bloqueios-server'
import { mensagemIndisponiveis } from '@/lib/agenda/bloqueios'
import { isoDe } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const dia = sp.get('dia') || ''
  const ini = (sp.get('inicio') || '').slice(0, 5)
  const fim = (sp.get('fim') || '').slice(0, 5)
  const usuarios = (sp.get('usuarios') || '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim) || fim <= ini) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  try {
    const lista = await indisponiveis(usuarios, isoDe(dia, ini), isoDe(dia, fim))
    return NextResponse.json({ indisponiveis: lista, mensagem: mensagemIndisponiveis(lista) })
  } catch (e) {
    console.error('[agenda/disponibilidade] GET', e)
    return NextResponse.json({ error: 'Falha ao consultar a agenda' }, { status: 500 })
  }
}
