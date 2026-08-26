// Placar por decisor (Visão B) + compromissos vencidos (Visão C).
// GET /api/decisoes/placar?dias=90
//
// Fase 1: colunas disponíveis sem rastreio por chassi — nº de decisões por
// decisor/papel e compromissos estourados. Custo de pátio/margem = Fase 2.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloDecisoes, compromissosVencidos } from '@/lib/decisoes/server'
import type { Decisao } from '@/lib/decisoes/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloDecisoes(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  // Placar é visão gerencial: admin ou quem tem a ação 'gerencial'/módulo total.
  const gerencial = auth.isAdmin || auth.modulos.includes('decisoes') || auth.modulos.includes('decisoes:gerencial')
  if (!gerencial) return NextResponse.json({ error: 'Placar restrito à visão gerencial' }, { status: 403 })

  const dias = Math.min(1095, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('dias')) || 90)))
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('decisoes')
    .select('*')
    .gte('ocorrida_em', desde)
    .order('ocorrida_em', { ascending: false })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const decisoes = (data || []) as Decisao[]

  // Compromissos estourados (independe da janela — é estado atual).
  const vencidos = await compromissosVencidos()
  const estouradosPorAtor = new Map<string, number>()
  for (const v of vencidos) {
    if (!v.decisao.ator_id) continue
    estouradosPorAtor.set(v.decisao.ator_id, (estouradosPorAtor.get(v.decisao.ator_id) || 0) + 1)
  }

  // Agrega por ator+papel.
  interface Linha { ator_id: string | null; papel: string; decisoes: number; compromissos_estourados: number }
  const mapa = new Map<string, Linha>()
  for (const d of decisoes) {
    const chave = `${d.ator_id || 'sistema'}|${d.papel}`
    if (!mapa.has(chave)) mapa.set(chave, { ator_id: d.ator_id, papel: d.papel, decisoes: 0, compromissos_estourados: 0 })
    mapa.get(chave)!.decisoes++
  }
  for (const linha of mapa.values()) {
    if (linha.ator_id) linha.compromissos_estourados = estouradosPorAtor.get(linha.ator_id) || 0
  }
  const placar = [...mapa.values()].sort((a, b) => b.decisoes - a.decisoes)

  // Nomes.
  const ids = [...new Set([...placar.map((l) => l.ator_id), ...vencidos.map((v) => v.decisao.ator_id)].filter(Boolean) as string[])]
  const { data: us } = ids.length
    ? await supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', ids)
    : { data: [] as { id: string; nome: string }[] }
  const usuarios: Record<string, string> = {}
  for (const u of us || []) usuarios[u.id] = u.nome

  return NextResponse.json({ placar, compromissos: vencidos, usuarios, dias })
}
