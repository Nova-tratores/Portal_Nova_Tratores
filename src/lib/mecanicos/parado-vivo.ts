// Dinheiro parado AO VIVO — a conta (antes dentro de /api/mecanicos/parado). Guardada (comCache): abre na
// hora com o último resultado e refaz por trás se passou de 1 min; o robô do painel deixa pronto.
import { carregarPendencias } from '@/lib/mecanicos/pendencias-server'
import { padronizadorOcorrencias } from '@/lib/mecanicos/ocorrencias-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { Pendencia } from '@/lib/mecanicos/pendencias'
import { comCache } from '@/lib/mecanicos/cache'

export async function calcularParado(): Promise<Pendencia[]> {
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

export function paradoComCache(forcar = false) {
  return comCache('parado', 60_000, calcularParado, forcar)
}
