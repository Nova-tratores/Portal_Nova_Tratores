// Máquinas do site mudadas no portal (aberto, sem login), lidas pelo SITE no build (botão Publicar).
//   alteracoes: { slug: campos mudados } por cima dos arquivos (inclui preço/mostrar preço/pronta entrega)
//   novos: máquinas criadas no portal, completas
//   removidos: slugs tirados do site ("Tirar do site")
// Notas internas e quem mudou não saem daqui.
import { NextResponse } from 'next/server'
import { corsSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

type Linha = { slug: string; preco: number | null; exibir_preco: boolean; pronta_entrega: boolean; oculto: boolean; dados?: Record<string, unknown>; novo?: boolean }

export async function GET(req: Request) {
  const cors = corsSite(req)
  const vazio = { alteracoes: {}, novos: [], removidos: [] }
  let { data, error } = await sb.from('site_catalogo').select('slug, preco, exibir_preco, pronta_entrega, oculto, dados, novo')
  if (error) ({ data, error } = await sb.from('site_catalogo').select('slug, preco, exibir_preco, pronta_entrega, oculto')) // sem o SQL novo
  if (error) return NextResponse.json(vazio, { headers: cors })
  const alteracoes: Record<string, Record<string, unknown>> = {}
  const novos: Record<string, unknown>[] = []
  const removidos: string[] = []
  for (const l of (data || []) as Linha[]) {
    const venda: Record<string, unknown> = { exibir_preco: l.exibir_preco, pronta_entrega: l.pronta_entrega }
    if (l.preco != null) venda.preco = Number(l.preco)
    if (l.novo) {
      if (!l.oculto) novos.push({ ...(l.dados || {}), ...venda, slug: l.slug, publicar: true })
      continue
    }
    if (l.oculto) removidos.push(l.slug)
    alteracoes[l.slug] = { ...(l.dados || {}), ...venda }
  }
  return NextResponse.json({ alteracoes, novos, removidos }, { headers: cors })
}
