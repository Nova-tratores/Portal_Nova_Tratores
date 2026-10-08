'use client'

// Ponte para o Painel Omie (app separado, no Railway).
//
// O painel passou a exigir login e a entrada é por aqui: pegamos o
// access_token da sessão do Portal e abrimos /entrar com ele no FRAGMENTO da
// URL (#t=), que não viaja para o servidor nem entra em log de proxy. O painel
// troca por um cookie próprio e confere o módulo 'painel-omie' em
// portal_permissoes — ou seja, quem manda na permissão continua sendo o Portal.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PAINEL = (
  process.env.NEXT_PUBLIC_PAINEL_OMIE_URL ||
  'https://sistemacompletoomie-production.up.railway.app'
).replace(/\/$/, '')

export default function PainelOmiePonte() {
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (cancelado) return
      if (!token) {
        setErro('Sua sessão expirou. Entre no Portal de novo e tente outra vez.')
        return
      }
      window.location.replace(`${PAINEL}/entrar#t=${encodeURIComponent(token)}`)
    })()
    return () => { cancelado = true }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>
          {erro ? 'Não foi possível abrir o painel' : 'Abrindo o Painel Omie…'}
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.55 }}>
          {erro ?? 'Levando você para os relatórios de oficina, peças e comercial.'}
        </p>
      </div>
    </div>
  )
}
