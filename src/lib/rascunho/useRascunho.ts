'use client'
// Rascunho automático no navegador (localStorage) para formulários longos.
// Enquanto a pessoa digita, o conteúdo é guardado; se a página recarregar,
// a aba trocar ou o formulário fechar sem salvar, ao voltar ele é recuperado.
// Depois de salvar de verdade, o formulário chama limpar().
//
//   const r = useRascunho('ppv:novo', dados, { vazio, restaurar })
//   r.recuperadoEm  → data do rascunho recuperado (para mostrar o aviso)
//   r.descartar()   → apaga o rascunho e chama restaurar(null) (volta ao vazio)
//   r.limpar()      → apaga o rascunho (depois de salvar)
import { useCallback, useEffect, useRef, useState } from 'react'
import { marcarPendente } from './pendencias'

const PREFIXO = 'rascunho:'
const VALIDADE_MS = 7 * 24 * 3600 * 1000

interface Guardado<T> { v: T; em: number }

function ler<T>(chave: string): Guardado<T> | null {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave)
    if (!bruto) return null
    const g = JSON.parse(bruto) as Guardado<T>
    if (!g || typeof g.em !== 'number' || Date.now() - g.em > VALIDADE_MS) { localStorage.removeItem(PREFIXO + chave); return null }
    return g
  } catch { return null }
}

export function apagarRascunho(chave: string) {
  try { localStorage.removeItem(PREFIXO + chave) } catch { /* sem storage */ }
}

interface Opcoes<T> {
  /** true quando não há nada que valha guardar (formulário em branco). */
  vazio: (v: T) => boolean
  /** Aplica o rascunho recuperado no formulário. */
  restaurar: (v: T) => void
  /** false = não guarda nem recupera (ex.: enquanto carrega do servidor). */
  ativo?: boolean
}

export function useRascunho<T>(chave: string | null, valor: T, { vazio, restaurar, ativo = true }: Opcoes<T>) {
  const [recuperadoEm, setRecuperadoEm] = useState<number | null>(null)
  const pronto = useRef<string | null>(null) // chave cujo rascunho já foi lido
  const restaurarRef = useRef(restaurar)
  const vazioRef = useRef(vazio)
  useEffect(() => { restaurarRef.current = restaurar; vazioRef.current = vazio })

  // 1) ao abrir: recupera o que estava guardado
  useEffect(() => {
    if (!chave || !ativo) return
    if (pronto.current === chave) return
    pronto.current = chave
    // localStorage só existe no navegador: ler no effect é o jeito certo (SSR)
    const g = ler<T>(chave)
    if (g && !vazioRef.current(g.v)) {
      restaurarRef.current(g.v)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecuperadoEm(g.em)
    } else setRecuperadoEm(null)
  }, [chave, ativo])

  // 2) enquanto digita: guarda (com um pequeno atraso) e marca "não salvo"
  useEffect(() => {
    if (!chave || !ativo || pronto.current !== chave) return
    const ehVazio = vazioRef.current(valor)
    marcarPendente(PREFIXO + chave, !ehVazio)
    const t = setTimeout(() => {
      try {
        if (ehVazio) localStorage.removeItem(PREFIXO + chave)
        else localStorage.setItem(PREFIXO + chave, JSON.stringify({ v: valor, em: Date.now() }))
      } catch { /* storage cheio/bloqueado: segue sem rascunho */ }
    }, 500)
    return () => clearTimeout(t)
  }, [chave, ativo, valor])

  // ao desmontar não há mais "pendência" na tela (o rascunho fica guardado)
  useEffect(() => () => { if (chave) marcarPendente(PREFIXO + chave, false) }, [chave])

  const limpar = useCallback(() => {
    if (!chave) return
    apagarRascunho(chave)
    marcarPendente(PREFIXO + chave, false)
    setRecuperadoEm(null)
  }, [chave])

  return { recuperadoEm, limpar, esconderAviso: () => setRecuperadoEm(null) }
}
