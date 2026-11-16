'use client'
// Estado guardado no endereço da página (?area= e ?tela=) — auditoria do celular, 16/11/2026:
//  • B2: abrir pelo link, recarregar ou puxar para atualizar volta para a mesma área/tela
//  • B3: abrir área ou tela cheia cria um passo no histórico → o "voltar" do celular fecha a tela em vez de sair do módulo
// Abrir = pushState (com marca). Fechar pelo X: se o passo foi criado aqui, volta o histórico (history.back);
// senão (veio pelo link), só tira o parâmetro. O "voltar" do navegador chega pelo popstate e cada hook relê o seu parâmetro.
import { useCallback, useEffect, useState } from 'react'

const MARCA = 'empresa-url'
const EVENTO = 'empresa-url' // aviso interno entre os hooks (não usar popstate falso: o roteador do Next também escuta)

function lerParam<T extends string>(chave: string, validos: readonly T[]): T | null {
  try {
    const v = new URLSearchParams(window.location.search).get(chave)
    return v && (validos as readonly string[]).includes(v) ? (v as T) : null
  } catch { return null }
}

/**
 * @param chave   parâmetro do endereço ('area', 'tela')
 * @param validos valores aceitos
 * @param limpar  parâmetros que saem junto quando este muda (trocar de área tira a ?tela= da área anterior)
 */
export function useEstadoUrl<T extends string>(chave: string, validos: readonly T[], limpar: string[] = []): [T | null, (v: T | null) => void] {
  const [valor, setValor] = useState<T | null>(null)
  const vs = validos.join('|'), ls = limpar.join('|') // listas como texto: dependência estável mesmo com array novo a cada render
  // lê depois de montar (no servidor não há endereço) e acompanha o voltar/avançar do navegador
  useEffect(() => {
    const ler = () => setValor(lerParam(chave, vs.split('|') as T[]))
    const t = setTimeout(ler, 0)
    window.addEventListener('popstate', ler); window.addEventListener(EVENTO, ler)
    return () => { clearTimeout(t); window.removeEventListener('popstate', ler); window.removeEventListener(EVENTO, ler) }
  }, [chave, vs])

  const mudar = useCallback((v: T | null) => {
    try {
      const atual = lerParam(chave, vs.split('|') as T[])
      if (v === atual) return
      const st = window.history.state as Record<string, unknown> | null
      // fechar o que foi aberto aqui = voltar um passo (o popstate atualiza a tela)
      if (v === null && st?.[MARCA] === chave) { window.history.back(); return }
      const u = new URL(window.location.href)
      if (v) u.searchParams.set(chave, v); else u.searchParams.delete(chave)
      for (const p of ls ? ls.split('|') : []) u.searchParams.delete(p)
      // só a nossa marca: o Next 16 copia o estado interno dele e acompanha o endereço novo (copiar __NA pularia isso)
      if (v) window.history.pushState({ [MARCA]: chave }, '', u.toString())
      else window.history.replaceState({ [MARCA]: st?.[MARCA] ?? null }, '', u.toString())
      setValor(v)
      window.dispatchEvent(new Event(EVENTO)) // os outros hooks (ex.: ?tela=) releem o endereço
    } catch { setValor(v) }
  }, [chave, vs, ls])

  return [valor, mudar]
}
