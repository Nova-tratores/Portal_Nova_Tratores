// Leitura dos ajustes manuais de comissão por OS — SÓ SERVIDOR (usado pela ficha e pela carreira).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { AjusteManual } from './comissao-detalhe'

type Rec = Record<string, unknown>

/** Ajustes manuais de comissão por OS (comissoes_os_relatorio — o painel do Omie e o RH gravam ali). */
export async function ajustesDeComissao(numeros: string[]): Promise<Map<string, AjusteManual>> {
  const ajustes = new Map<string, AjusteManual>()
  for (let i = 0; i < numeros.length; i += 200) {
    const { data } = await sb.from('comissoes_os_relatorio').select('numero_os, valor, data_ref, por_tecnico').in('numero_os', numeros.slice(i, i + 200))
    for (const a of (data || []) as Rec[]) {
      const dr = String(a.data_ref || '').trim()
      ajustes.set(String(a.numero_os), {
        numero: String(a.numero_os), valor: a.valor == null ? null : Number(a.valor),
        dataRef: dr && dr.toUpperCase() !== 'AUTO' ? dr : null,
        porTecnico: a.por_tecnico && typeof a.por_tecnico === 'object' && Object.keys(a.por_tecnico as object).length ? a.por_tecnico as Record<string, number> : null,
      })
    }
  }
  return ajustes
}

/** % de comissão definida na OS pelo pós-vendas (sql/posvendas-comissao-os.sql). Sem a tabela, vazio. */
export interface PctDaOS { pct: number; motivo: string; por: string | null; em: string }
export async function pctsDasOS(ids: string[]): Promise<Map<string, PctDaOS>> {
  const out = new Map<string, PctDaOS>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('posvendas_comissao_os').select('id_ordem, pct, motivo, alterado_por, alterado_em').in('id_ordem', ids.slice(i, i + 200))
    if (error) return out
    for (const r of (data || []) as Rec[]) out.set(String(r.id_ordem), { pct: Number(r.pct), motivo: String(r.motivo || ''), por: (r.alterado_por as string) || null, em: String(r.alterado_em) })
  }
  return out
}
