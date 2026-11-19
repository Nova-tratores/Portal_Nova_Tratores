'use client'
// Estações de impressão da térmica — lado do navegador.
// As telas de etiqueta chamam imprimirOuEnviar no lugar de imprimirTermica. Para onde vai é a escolha
// DA PESSOA, guardada no servidor (José, 19/11/2026: "no desktop a gente escolhe e deixa marcado para
// qual impressora tem que ir e isso reflete no celular"): 'local' imprime aqui; o id de uma estação
// manda pela rede para o PC daquela impressora. O navegador guarda uma cópia para quando estiver sem rede.

import { authHeaders } from '@/lib/auth/client'
import { guardarDestino, imprimirTermica, lerDestino, type AjusteTermica, type ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'
import { ESTACAO_ID, type OrigemEtiqueta, type SituacaoEstacao } from './estacao'

export type ResultadoImpressao = { ok: true; enviado: boolean } | { ok: false; erro: string }

export interface Destinos {
  estacoes: SituacaoEstacao[]
  /** a escolha da pessoa: 'local', id de estação, ou null (nunca escolheu) */
  destino: string | null
  migracaoFaltando?: boolean
}

/** Celular/tablet não enxerga impressora USB: sem escolha, vai para a estação antiga. No PC, imprime aqui. */
function destinoPadrao(): string {
  try { if (window.matchMedia('(pointer: coarse)').matches) return ESTACAO_ID } catch { /* segue */ }
  return 'local'
}

/** O destino que vale: o salvo na conta → a cópia deste navegador → o padrão do aparelho. */
export function destinoEfetivo(d: Destinos | null): string {
  return d?.destino || lerDestino() || destinoPadrao()
}

/** Lista das estações + a escolha da pessoa. null = sem rede. */
export async function lerDestinos(timeoutMs = 8000): Promise<Destinos | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch('/api/etiquetas/estacao', { headers: await authHeaders(), signal: ctl.signal, cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (j.migracaoFaltando) return { estacoes: [], destino: null, migracaoFaltando: true }
    if (!res.ok || !Array.isArray(j.estacoes)) return null
    if (j.destino) guardarDestino(j.destino)
    return { estacoes: j.estacoes, destino: j.destino || null }
  } catch {
    return null
  } finally { clearTimeout(t) }
}

/** Guarda a escolha na conta da pessoa (vale para todos os aparelhos dela). */
export async function escolherDestino(destino: string): Promise<{ ok: boolean; erro?: string }> {
  guardarDestino(destino)
  try {
    const res = await fetch('/api/etiquetas/estacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ acao: 'destino', destino }),
    })
    const j = await res.json().catch(() => ({}))
    return res.ok && j.ok ? { ok: true } : { ok: false, erro: j.erro || 'Não consegui salvar a escolha da impressora.' }
  } catch {
    return { ok: false, erro: 'Sem conexão — a escolha ficou só neste aparelho.' }
  }
}

export function nomeDoDestino(destino: string, estacoes: SituacaoEstacao[]): string {
  if (destino === 'local') return 'neste aparelho'
  return estacoes.find((e) => e.id === destino)?.nome || 'ROGERIA'
}

export async function imprimirOuEnviar(itens: ItemTermica[], a: AjusteTermica, origem: OrigemEtiqueta): Promise<ResultadoImpressao> {
  // pergunta rápido ao servidor (a escolha pode ter mudado em outro aparelho); sem resposta, usa a cópia daqui
  const d = await lerDestinos(2500)
  const destino = destinoEfetivo(d)
  if (destino === 'local') {
    return imprimirTermica(itens, a)
      ? { ok: true, enviado: false }
      : { ok: false, erro: 'Não consegui preparar a etiqueta para imprimir. Recarregue a página e tente de novo.' }
  }
  const nome = nomeDoDestino(destino, d?.estacoes || [])
  const r = await enviarParaEstacao(itens, origem, destino, nome)
  if (r.ok) avisoRapido(`${itens.length === 1 ? 'Etiqueta enviada' : `${itens.length} etiquetas enviadas`} para ${nome}`)
  return r
}

export async function enviarParaEstacao(itens: ItemTermica[], origem: OrigemEtiqueta, estacao: string = ESTACAO_ID, nome = 'a impressora'): Promise<ResultadoImpressao> {
  try {
    const res = await fetch('/api/etiquetas/estacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ origem, itens, estacao }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.ok) return { ok: false, erro: j.erro || `Não consegui mandar para ${nome}.` }
    return { ok: true, enviado: true }
  } catch {
    return { ok: false, erro: `Sem conexão com o portal — não consegui mandar para ${nome}.` }
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
