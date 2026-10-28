// POST /api/opa/transferir  { de: 'pecas' | 'patrimonio', id }
// Transfere um item entre as abas do Opa (José, 22/10/2026): Peças S/Estoque →
// Patrimônio Loja, ou Patrimônio → Peças (entra na verificação). Exige acesso às
// DUAS abas (módulos 'opa-pecas' e 'patrimonio'; admin/dev sempre).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { permite } from '@/lib/permissoes/explicitas'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ErroTransferencia, patrimonioParaPeca, pecaParaPatrimonio } from '@/lib/opa-transferencia-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 })
  const podeAs2 = permite(auth.modulos, auth.isAdmin, 'opa-pecas', undefined, auth.isDev) && permite(auth.modulos, auth.isAdmin, 'patrimonio', undefined, auth.isDev)
  if (!podeAs2) return NextResponse.json({ ok: false, erro: 'Para transferir é preciso ter acesso às Peças S/Estoque e ao Patrimônio Loja.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { de?: string; id?: string } | null
  const id = String(body?.id || '')
  if (!id || (body?.de !== 'pecas' && body?.de !== 'patrimonio')) return NextResponse.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 })

  const { data: u } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle()
  const quem = { id: auth.userId, nome: String((u as { nome?: string } | null)?.nome || auth.email || 'Portal') }
  try {
    const r = body.de === 'pecas' ? await pecaParaPatrimonio(id, quem) : await patrimonioParaPeca(id, quem)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof ErroTransferencia) return NextResponse.json({ ok: false, erro: e.message }, { status: e.status })
    console.error('[opa/transferir]', e)
    return NextResponse.json({ ok: false, erro: (e as { message?: string })?.message || 'Não deu para transferir.' }, { status: 500 })
  }
}
