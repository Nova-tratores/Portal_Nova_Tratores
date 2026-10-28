'use client'
// Monitor de uso: quando só a query muda (ex.: /pos?id=… abrindo outra OS sem
// trocar de tela), soma o caso da URL à jornada. A troca de tela em si é
// registrada pelo PortalLayout. Precisa de <Suspense> (useSearchParams).
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { marcarAlvos } from '@/lib/uso/caso'
import { extrairAlvos } from '@/lib/uso/jornada'

export default function JornadaQuery() {
  const pathname = usePathname()
  const q = useSearchParams()?.toString() || ''
  useEffect(() => {
    if (pathname && q) marcarAlvos(extrairAlvos(pathname, '?' + q))
  }, [pathname, q])
  return null
}
