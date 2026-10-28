'use client'
// Estação de impressão da térmica — lado do navegador.
// As telas de etiqueta chamam imprimirOuEnviar no lugar de imprimirTermica: com
// o destino "Na ROGERIA" (escolhido nos ajustes da térmica, lembrado neste
// navegador) as etiquetas vão para a fila; senão imprime aqui como sempre.

import { authHeaders } from '@/lib/auth/client'
import { imprimirTermica, lerDestino, type AjusteTermica, type ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'
import type { OrigemEtiqueta, SituacaoEstacao } from './estacao'

export type ResultadoImpressao = { ok: true; enviado: boolean } | { ok: false; erro: string }

export async function imprimirOuEnviar(itens: ItemTermica[], a: AjusteTermica, origem: OrigemEtiqueta): Promise<ResultadoImpressao> {
  if (lerDestino() !== 'estacao') {
    return imprimirTermica(itens, a)
      ? { ok: true, enviado: false }
      : { ok: false, erro: 'Não consegui preparar a etiqueta para imprimir. Recarregue a página e tente de novo.' }
  }
  const r = await enviarParaEstacao(itens, origem)
  if (r.ok) avisoRapido(`${itens.length === 1 ? 'Etiqueta enviada' : `${itens.length} etiquetas enviadas`} para a ROGERIA`)
  return r
}

export async function enviarParaEstacao(itens: ItemTermica[], origem: OrigemEtiqueta): Promise<ResultadoImpressao> {
  try {
    const res = await fetch('/api/etiquetas/estacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ origem, itens }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.ok) return { ok: false, erro: j.erro || 'Não consegui mandar para a ROGERIA.' }
    return { ok: true, enviado: true }
  } catch {
    return { ok: false, erro: 'Sem conexão com o portal — não consegui mandar para a ROGERIA.' }
  }
}

export async function lerSituacaoEstacao(): Promise<SituacaoEstacao | null> {
  try {
    const res = await fetch('/api/etiquetas/estacao', { headers: await authHeaders() })
    const j = await res.json().catch(() => ({}))
    if (j.migracaoFaltando) return { migracaoFaltando: true, nome: 'ROGERIA', online: false, ultimoSinal: null, sinalNome: null, pendentes: 0 }
    return res.ok && j.situacao ? j.situacao : null
  } catch {
    return null
  }
}

/** Imprime e só resolve quando a impressão terminou (ou 2 min) — a estação manda uma por vez. */
export function imprimirTermicaEspera(itens: ItemTermica[], a: AjusteTermica): Promise<boolean> {
  return new Promise((resolve) => {
    let feito = false
    const fim = (ok: boolean) => { if (!feito) { feito = true; clearTimeout(t); resolve(ok) } }
    const t = setTimeout(() => fim(true), 120_000)
    if (!imprimirTermica(itens, a, fim)) fim(false)
  })
}

/** Aviso que some sozinho (as telas fecham a janela da etiqueta logo depois). */
function avisoRapido(msg: string) {
  try {
    const d = document.createElement('div')
    d.textContent = '✓ ' + msg
    d.setAttribute('role', 'status')
    d.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:#065f46;color:#fefefe;padding:10px 18px;border-radius:10px;font:700 14px Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)'
    document.body.appendChild(d)
    setTimeout(() => d.remove(), 3500)
  } catch { /* sem DOM */ }
}
