// Dinheiro parado AO VIVO (José, 19/10/2026: "assim que for faturado tem que mudar ali, ordem marcada
// como interna também não deve entrar"). A tabela posvendas_pendencias é uma foto do robô e fica velha;
// aqui calcula direto das OS (faturada pelo portal, faturada na Omie com NFS-e, concluída com nº do Omie,
// interna e cancelada saem na hora). Cache de 20 s no processo para várias abas não pesarem no banco.
// GET → { pendencias, geradoEm }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { carregarPendencias } from '@/lib/mecanicos/pendencias-server'
import { padronizadorOcorrencias } from '@/lib/mecanicos/ocorrencias-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { Pendencia } from '@/lib/mecanicos/pendencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Cache = { em: number; dados: Pendencia[]; pedido?: Promise<Pendencia[]> }
const g = globalThis as unknown as { __paradoVivo?: Cache }

async function calcular(): Promise<Pendencia[]> {
  const { padronizar } = await padronizadorOcorrencias()
  // OS já faturadas que o painel conhece (posvendas_os); as recém-faturadas saem pelas regras da OS
  const faturadas = new Set<string>()
  for (let de = 0; de < 50000; de += 1000) {
    const { data, error } = await sb.from('posvendas_os').select('os').range(de, de + 999)
    if (error) break
    for (const r of data || []) faturadas.add(String((r as { os: unknown }).os))
    if (!data || data.length < 1000) break
  }
  return carregarPendencias(faturadas, padronizar)
}

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    const c = g.__paradoVivo
    if (c && Date.now() - c.em < 20_000) return NextResponse.json({ pendencias: c.dados, geradoEm: new Date(c.em).toISOString() })
    const pedido = c?.pedido || calcular()
    g.__paradoVivo = { em: c?.em || 0, dados: c?.dados || [], pedido }
    const dados = await pedido
    g.__paradoVivo = { em: Date.now(), dados }
    return NextResponse.json({ pendencias: dados, geradoEm: new Date().toISOString() })
  } catch (e) {
    if (g.__paradoVivo) g.__paradoVivo.pedido = undefined
    console.error('[mecanicos/parado]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao calcular o dinheiro parado' }, { status: 500 })
  }
}
