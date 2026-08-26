// SC — detalhe + linha do tempo (ledger). GET /api/decisoes/:id
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloDecisoes, carregarSC } from '@/lib/decisoes/server'
import type { Decisao } from '@/lib/decisoes/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloDecisoes(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const sc = await carregarSC(id)
  if (!sc) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

  const { data: decisoes } = await supabaseAdmin
    .from('decisoes')
    .select('*')
    .eq('sc_id', id)
    .order('ocorrida_em', { ascending: true })
  const lista = (decisoes || []) as Decisao[]

  const ids = [...new Set([sc.vendedor_id, ...lista.map((d) => d.ator_id).filter(Boolean) as string[]])]
  const { data: us } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids)
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of us || []) usuarios[u.id] = u

  return NextResponse.json({ solicitacao: sc, decisoes: lista, usuarios })
}
