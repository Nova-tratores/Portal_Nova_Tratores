// =============================================================================
// API: exclusao de comentario - port FIEL de DELETE /api/comentarios/:id.
// Interim (sem login): so o mesmo navegador (autor_token) pode apagar o proprio
// comentario. Com login Supabase, trocar a regra por user_id.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const { id: idRaw } = await context.params
  const id = Number(idRaw)
  if (!Number.isFinite(id)) return NextResponse.json({ erro: 'id invalido' }, { status: 400 })
  // Token pode vir na query (?autor_token=) ou no corpo (req.body.autor_token).
  let bodyToken = ''
  try {
    const body: any = await request.json()
    bodyToken = body?.autor_token || ''
  } catch (_) { bodyToken = '' }
  const token = String(request.nextUrl.searchParams.get('autor_token') || bodyToken || '').trim()
  if (!token) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 })
  try {
    const { data: row, error: e1 } = await supabase.from('titulo_comentarios')
      .select('id,autor_token').eq('id', id).single()
    if (e1 || !row) return NextResponse.json({ erro: 'Comentario nao encontrado' }, { status: 404 })
    // Interim: so o mesmo navegador (token) apaga. Com login, trocar por user_id.
    if (!row.autor_token || row.autor_token !== token) {
      return NextResponse.json({ erro: 'So o autor pode excluir' }, { status: 403 })
    }
    const { error: e2 } = await supabase.from('titulo_comentarios').delete().eq('id', id)
    if (e2) throw new Error(e2.message)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
