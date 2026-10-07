'use client'
// Captura no celular: fotos + quantidade + qualidade → código PNI + etiqueta.
import { Loader2 } from 'lucide-react'
import { useBase } from '@/components/opa/pecas/comum'
import Captura from '@/components/opa/pecas/Captura'
import { Moldura } from '@/components/opa/pecas/Moldura'

export default function NovaPecaPage() {
  const base = useBase()
  return (
    <Moldura podeGerir={base.podeGerir} largura={1100} semNovo>
      {base.userId
        ? <Captura userId={base.userId} base={base} />
        : <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
    </Moldura>
  )
}
