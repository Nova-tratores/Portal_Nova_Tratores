'use client'
// As rotas /api do portal exigem login, mas um link comum (<a href="/api/..." target="_blank">
// ou com `download`) abre a rota sem o token e dá 401. Este ouvinte, montado uma vez no
// layout do portal, intercepta esses cliques e busca o documento com o login
// (abrirComLogin / baixarComLogin). Clique com Ctrl/Shift/meio fica como está.
import { useEffect } from 'react'
import { abrirComLogin, baixarComLogin } from '@/lib/auth/client'

export default function LinksComLogin() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      let u: URL
      try { u = new URL(a.href, window.location.href) } catch { return }
      if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) return
      const caminho = `${u.pathname}${u.search}`
      if (a.hasAttribute('download')) {
        e.preventDefault()
        void baixarComLogin(caminho, a.getAttribute('download') || undefined)
      } else if (a.target === '_blank') {
        e.preventDefault()
        void abrirComLogin(caminho)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
