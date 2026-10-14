'use client'
// SKU → produto do catálogo + locação no estoque (/api/opa/pecas/estoque).
// Cache no módulo: a lista e a ficha da peça perguntam pelos mesmos códigos.

import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { ProdutoSku } from '@/lib/opa-pecas/tipos'

const cache = new Map<string, ProdutoSku[]>() // código (maiúsculo) → achados ([] = não existe)

export const chaveSku = (c: string | null | undefined) => (c || '').trim().toUpperCase()

async function buscar(codigos: string[]): Promise<void> {
  const faltam = codigos.filter((c) => !cache.has(c))
  if (!faltam.length) return
  const r = await fetch('/api/opa/pecas/estoque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ codigos: faltam }),
  })
  if (!r.ok) return
  const j = await r.json() as { itens?: Record<string, ProdutoSku[]> }
  for (const c of faltam) cache.set(c, j.itens?.[c] || [])
}

/** Esquece um código (ex.: o usuário trocou o SKU na ficha). */
export function esquecerSku(codigo: string) { cache.delete(chaveSku(codigo)) }

/** Mapa código (maiúsculo) → produtos achados. Código fora do mapa = ainda carregando. */
export function useProdutosSku(codigos: (string | null | undefined)[]): Record<string, ProdutoSku[]> {
  const lista = useMemo(() => [...new Set(codigos.map(chaveSku).filter(Boolean))].sort(), [codigos])
  const chave = lista.join('|')
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    const pedidos = chave ? chave.split('|') : []
    if (!pedidos.length || pedidos.every((c) => cache.has(c))) return
    buscar(pedidos).catch(() => null).finally(() => { if (vivo) setVersao((v) => v + 1) })
    return () => { vivo = false }
  }, [chave])

  return useMemo(() => {
    void versao
    const r: Record<string, ProdutoSku[]> = {}
    for (const c of lista) { const v = cache.get(c); if (v) r[c] = v }
    return r
  }, [lista, versao])
}
