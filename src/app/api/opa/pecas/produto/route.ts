import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { cadastrosDoCodigo, parecidosDoCodigo } from '@/lib/opa-pecas/cadastro-server'

export const dynamic = 'force-dynamic'

// GET /api/opa/pecas/produto?codigo=RP-0734309419
// O código digitado no Opa Peças (captação, verificação, separação) já é um
// produto cadastrado? Devolve os cadastros (NOVA/CASTRO) com tipo, locação,
// estoque, preço, marca, família e as demais características; sem o exato,
// `parecidos` = códigos que contêm o digitado. Só leitura;
// qualquer usuário logado (a captação não exige o módulo).

export async function GET(req: NextRequest) {
  // qualquer pessoa logada capta peça (pni_pode_ver) — a consulta acompanha
  if (!(await autenticar(req))) return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 })
  const codigo = (req.nextUrl.searchParams.get('codigo') || '').trim().slice(0, 80)
  if (!codigo) return NextResponse.json({ ok: true, codigo, cadastros: [] })
  try {
    const cadastros = await cadastrosDoCodigo(codigo)
    // não achou o exato: os produtos cujo código contém o digitado (a pessoa escolhe)
    const parecidos = cadastros.length ? [] : await parecidosDoCodigo(codigo).catch(() => [])
    return NextResponse.json({ ok: true, codigo, cadastros, parecidos })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
    return NextResponse.json({ ok: false, erro }, { status: 500 })
  }
}
