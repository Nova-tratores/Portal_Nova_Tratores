'use client'
// Endereço próprio para cada aba, janela e card do Centro do Pós-Vendas (José, 20/10/2026: "sempre que a
// gente clicar em card ou aba tem que mudar a URL, para cada um ter a sua própria").
// /mecanicos?aba=mecanicos&tecnico=Danilo%20de%20Souza&secao=os&mes=2026-09 · &janela=tribunal
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function useUrlMec() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const pegar = (k: string) => sp.get(k)
  /** muda os parâmetros (null apaga); empilha no histórico (o "voltar" do navegador desfaz) */
  const mudar = (mods: Record<string, string | null | undefined>, empilhar = true) => {
    const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : sp.toString())
    for (const [k, v] of Object.entries(mods)) { if (v == null || v === '') q.delete(k); else q.set(k, v) }
    const url = `${pathname}${q.toString() ? `?${q}` : ''}`
    if (empilhar) router.push(url, { scroll: false }); else router.replace(url, { scroll: false })
  }
  return { pegar, mudar }
}
