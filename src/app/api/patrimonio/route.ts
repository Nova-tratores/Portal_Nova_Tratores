import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { criarItem, listarItens, semMigracao, semMigracao02 } from '@/lib/patrimonio/db-server'
import { CATEGORIAS_PADRAO, validarForm, type DadosForm } from '@/lib/patrimonio/tipos'
import { caminhoFotoValido } from '@/lib/patrimonio/fotos-regra'

export const dynamic = 'force-dynamic'

// Patrimônio Loja (aba do Opa) — módulo 'patrimonio' (Admin/Dev sempre).
// GET  → itens + locais (mesma lista do Opa Peças) + tags/categorias já usadas
// POST → { form: DadosForm, fotos: string[] } cria o item (+ 1ª movimentação)

function erro(e: unknown) {
  const err = e as { code?: string; message?: string }
  if (semMigracao(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-01.sql no banco.' }, { status: 503 })
  if (semMigracao02(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-02.sql no banco (quantidade e etiqueta).' }, { status: 503 })
  return NextResponse.json({ ok: false, erro: err?.message || String(e) }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  try {
    const [itens, locais] = await Promise.all([
      listarItens(),
      supabaseAdmin.from('pni_locais').select('id, nome, exige_tecnico, ordem, ativo').order('ordem'),
    ])
    const tags = [...new Set(itens.flatMap((i) => i.tags))].sort()
    const categorias = [...new Set([...CATEGORIAS_PADRAO, ...itens.map((i) => i.categoria).filter((c): c is string => !!c)])]
    return NextResponse.json({ ok: true, itens, locais: locais.data || [], tags, categorias })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const body = await req.json().catch(() => null) as { form?: DadosForm; fotos?: string[] } | null
  if (!body?.form) return NextResponse.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 })
  const { erros, dados } = validarForm(body.form)
  if (erros.length) return NextResponse.json({ ok: false, erro: `Falta: ${erros.join(', ')}.` }, { status: 400 })
  const fotos = (body.fotos || []).filter((p) => caminhoFotoValido(p, acesso.user.id)).slice(0, 12)
  try {
    const item = await criarItem(dados, fotos, acesso.user)
    return NextResponse.json({ ok: true, item })
  } catch (e) { return erro(e) }
}
