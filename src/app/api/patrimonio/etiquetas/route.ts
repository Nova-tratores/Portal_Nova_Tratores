import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { marcarEtiquetas, semMigracao02 } from '@/lib/patrimonio/db-server'

export const dynamic = 'force-dynamic'

// POST /api/patrimonio/etiquetas { ids: string[] } — marca a etiqueta dos
// itens como impressa agora (chamado ao imprimir). Módulo 'patrimonio'.

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const b = await req.json().catch(() => null) as { ids?: unknown[] } | null
  const ids = (b?.ids || []).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5000)
  if (!ids.length) return NextResponse.json({ ok: false, erro: 'Nenhum item.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, marcados: await marcarEtiquetas(ids) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (semMigracao02(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-02.sql no banco.' }, { status: 503 })
    return NextResponse.json({ ok: false, erro: err?.message || String(e) }, { status: 500 })
  }
}
