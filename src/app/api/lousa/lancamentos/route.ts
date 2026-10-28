// LOUSA — lançamentos fora de OS (José, 20/10/2026).
// POST   multipart: dados = JSON do Lancamento (lib/lousa/ausencias.ts), anexo = atestado (Médico)
// DELETE ?id=<linha>&so=dia   apaga o lançamento (o grupo inteiro, ou só aquele dia) e cancela no RH o que estiver pendente
// GET    ?atestado=<path>     abre o atestado (link temporário do bucket privado do RH)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { podeLousa } from '@/lib/agenda/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { lancar, excluir, linkAtestado, ErroLancamento } from '@/lib/lousa/ausencias-server'
import type { Lancamento } from '@/lib/lousa/ausencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pode = (a: Autenticado) => podeLousa(a) || a.modulos.some((m) => m === 'pos' || m.startsWith('pos:'))
const LIMITE_ANEXO = 8 * 1024 * 1024

async function nomeDe(a: Autenticado) {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', a.userId).maybeSingle()
  return String((data as { nome?: string } | null)?.nome || a.email || 'Portal').trim()
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!pode(auth)) return NextResponse.json({ error: 'Você não tem permissão para lançar na Lousa.' }, { status: 403 })
  try {
    const fd = await req.formData()
    let l: Lancamento
    try { l = JSON.parse(String(fd.get('dados') || '{}')) } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }) }
    const arq = fd.get('anexo')
    let anexo = null
    if (arq instanceof File && arq.size > 0) {
      if (arq.size > LIMITE_ANEXO) return NextResponse.json({ error: 'O atestado passa de 8 MB.' }, { status: 400 })
      anexo = { nome: arq.name || 'atestado', tipo: arq.type, bytes: await arq.arrayBuffer() }
    }
    const r = await lancar({ ...l, tecnicos: Array.isArray(l.tecnicos) ? l.tecnicos.map(String) : [] }, anexo, { id: auth.userId, nome: await nomeDe(auth) })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof ErroLancamento) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[lousa/lancamentos] POST', e)
    return NextResponse.json({ error: 'Não deu para lançar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!pode(auth)) return NextResponse.json({ error: 'Você não tem permissão para mexer na Lousa.' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Qual lançamento?' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...(await excluir(id, req.nextUrl.searchParams.get('so') === 'dia')) })
  } catch (e) {
    if (e instanceof ErroLancamento) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Não deu para apagar.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!pode(auth)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const path = req.nextUrl.searchParams.get('atestado') || ''
  if (!/^atestados\/[\w-]+\/[\w.-]+$/.test(path)) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 })
  const url = await linkAtestado(path)
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: 'Não achei o atestado no RH.' }, { status: 404 })
}
