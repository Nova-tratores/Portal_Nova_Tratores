// Uma garantia completa para a janela do bloco Garantias da Janela Mecânicos (José, 22/10/2026: "colocar mais
// informações lá do módulo de garantia quando a gente clicar em um caso, mostrando as fotos e tudo que está
// preenchido lá"). SÓ LEITURA e com a MESMA guarda da lista (/api/mecanicos/garantias): quem vê o painel sem
// ter o módulo Garantias também abre o caso. Mesmo formato do GET /api/garantias/[id] (sem os e-mails).
// GET → { garantia: GarantiaDetalhe }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_GARANTIAS, TBL_GAR_PECAS, TBL_GAR_PEND, TBL_GAR_ANEXOS, TBL_GAR_EVENTOS } from '@/lib/garantias/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }, { modulo: 'garantias' }])
  if (guarda.resposta) return guarda.resposta
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Garantia inválida.' }, { status: 400 })

  const { data: garantia, error } = await sb.from(TBL_GARANTIAS).select('*, montadora:garantia_montadoras(*)').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 })

  const [pecas, pendencias, anexos, eventos] = await Promise.all([
    sb.from(TBL_GAR_PECAS).select('*').eq('garantia_id', id).order('created_at'),
    sb.from(TBL_GAR_PEND).select('*').eq('garantia_id', id).order('created_at'),
    sb.from(TBL_GAR_ANEXOS).select('*').eq('garantia_id', id).order('created_at'),
    sb.from(TBL_GAR_EVENTOS).select('*').eq('garantia_id', id).order('created_at', { ascending: false }),
  ])
  return NextResponse.json({
    garantia: { ...garantia, pecas: pecas.data || [], pendencias: pendencias.data || [], anexos: anexos.data || [], eventos: eventos.data || [] },
  })
}
