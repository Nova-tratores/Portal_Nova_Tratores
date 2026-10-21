'use client'
// Centro do Pós-Vendas AO VIVO (José, 21/10/2026): o servidor avisa pelo canal Realtime "posvendas-ao-vivo"
// quando entra faturamento (OS ou pedido de peças) ou muda ocorrência; cada bloco da tela escuta
// `useVersaoAoVivo()` e se recarrega sozinho. Ocorrência/defesa nova (tabela com Realtime) também pede ao
// servidor para renovar fichas e pontos de todo mundo. Gastos (requisição/alimentação, abastecimento, despesa
// de rota — José, 21/10/2026: "e gastos também") pedem a atualização completa (regrava as tabelas).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'

export interface AvisoAoVivo { motivo: string; em: string; leve?: boolean }
let estado: { versao: number; ultimo: AvisoAoVivo | null } = { versao: 0, ultimo: null }
const ouvintes = new Set<() => void>()
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function avisarMudou(a: AvisoAoVivo) { estado = { versao: estado.versao + 1, ultimo: a }; ouvintes.forEach((f) => f()) }
/** Número que sobe a cada atualização ao vivo — ponha nas dependências do efeito que busca os dados. */
export function useVersaoAoVivo() { return useSyncExternalStore(assinar, () => estado.versao, () => 0) }
export function useUltimoAviso() { return useSyncExternalStore(assinar, () => estado.ultimo, () => null) }

let pedido: ReturnType<typeof setTimeout> | null = null
let pedidoLeve = true
function pedirAtualizacao(motivo: string, leve: boolean) {
  if (pedido) clearTimeout(pedido)
  pedidoLeve = pedidoLeve && leve // o mais pesado vence
  pedido = setTimeout(async () => {
    const l = pedidoLeve
    pedido = null; pedidoLeve = true
    try { await fetch('/api/mecanicos/ao-vivo', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo, leve: l }) }) } catch { /* sem rede */ }
  }, leve ? 1200 : 2500)
}
const pedirLeve = (motivo: string) => pedirAtualizacao(motivo, true)
const pedirGasto = (motivo: string) => pedirAtualizacao(motivo, false)

/** Liga o canal ao vivo (uma vez, no Centro do Pós-Vendas). */
export function useLigarAoVivo() {
  useEffect(() => {
    const canal = supabase.channel('posvendas-ao-vivo')
      .on('broadcast', { event: 'mudou' }, (m) => avisarMudou((m.payload || { motivo: 'atualizado', em: new Date().toISOString() }) as AvisoAoVivo))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_ocorrencias' }, () => pedirLeve('ocorrência nova'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_justificativas' }, () => pedirLeve('defesa julgada'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Requisicao' }, () => pedirGasto('requisição / alimentação'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abastecimentos' }, () => pedirGasto('abastecimento'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas_relatorio' }, () => pedirGasto('despesa de rota'))
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [])
}

/** Selo "atualizado agora" que aparece por alguns segundos quando chega um aviso ao vivo. */
export function useSeloAoVivo(): AvisoAoVivo | null {
  const ultimo = useUltimoAviso()
  const versao = useVersaoAoVivo()
  const [mostrar, setMostrar] = useState<{ v: number; a: AvisoAoVivo } | null>(null)
  useEffect(() => {
    if (!versao || !ultimo) return
    const t0 = setTimeout(() => setMostrar({ v: versao, a: ultimo }), 0)
    const t = setTimeout(() => setMostrar((m) => (m?.v === versao ? null : m)), 6000)
    return () => { clearTimeout(t0); clearTimeout(t) }
  }, [versao, ultimo])
  return mostrar?.a || null
}
