// =============================================================================
// API: comentarios por titulo (varios por titulo, varios autores)
// Port FIEL de GET/POST /api/titulos/:tipo/:codigo/comentarios do server.js.
// Chave do titulo = (tipo, codigo_lancamento). Identidade do autor: por enquanto
// sem login - usa autor_nome (digitado) + autor_token (id do navegador) p/ que
// cada um exclua so o proprio. Quando o login Supabase for ligado, basta passar
// a popular user_id/autor_email e trocar a regra de DELETE.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

const TIPOS_TITULO = new Set(['pagar', 'receber'])

type Ctx = { params: Promise<{ tipo: string; codigo: string }> }

export async function GET(request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const { tipo: tipoRaw, codigo: codigoRaw } = await context.params
  const tipo = String(tipoRaw || '').toLowerCase()
  const codigo = Number(codigoRaw)
  if (!TIPOS_TITULO.has(tipo) || !Number.isFinite(codigo)) {
    return NextResponse.json({ erro: 'tipo ou codigo invalido' }, { status: 400 })
  }
  const token = String(request.nextUrl.searchParams.get('autor_token') || '').trim()
  try {
    const { data, error } = await supabase.from('titulo_comentarios')
      .select('id,autor_nome,autor_email,user_id,autor_token,comentario,created_at')
      .eq('tipo', tipo)
      .eq('codigo_lancamento', codigo)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    // Nao expoe autor_token; devolve so se o token do cliente bate (pode excluir).
    const comentarios = (data || []).map(({ autor_token, ...c }: any) => ({
      ...c, meu: !!(token && autor_token && autor_token === token),
    }))
    return NextResponse.json({ comentarios })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const { tipo: tipoRaw, codigo: codigoRaw } = await context.params
  const tipo = String(tipoRaw || '').toLowerCase()
  const codigo = Number(codigoRaw)
  if (!TIPOS_TITULO.has(tipo) || !Number.isFinite(codigo)) {
    return NextResponse.json({ erro: 'tipo ou codigo invalido' }, { status: 400 })
  }
  let body: any = {}
  try { body = await request.json() } catch (_) { body = {} }
  const autor = String(body.autor_nome || '').trim().slice(0, 80)
  const texto = String(body.comentario || '').trim().slice(0, 2000)
  const token = String(body.autor_token || '').trim().slice(0, 80) || null
  const conta = body.conta_omie ? String(body.conta_omie).slice(0, 20) : null
  if (!autor) return NextResponse.json({ erro: 'Informe seu nome' }, { status: 400 })
  if (!texto) return NextResponse.json({ erro: 'Comentario vazio' }, { status: 400 })
  try {
    const { data, error } = await supabase.from('titulo_comentarios')
      .insert({
        tipo, codigo_lancamento: codigo, conta_omie: conta,
        autor_nome: autor, autor_token: token, comentario: texto,
      })
      .select('id,autor_nome,autor_email,user_id,comentario,created_at')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ comentario: data }, { status: 201 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
