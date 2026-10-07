'use client'
// Item aberto pelo QR da etiqueta: /opa/pecas/<código>
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Aviso, useBase } from '@/components/opa/pecas/comum'
import DetalheItem from '@/components/opa/pecas/DetalheItem'
import { Moldura } from '@/components/opa/pecas/Moldura'
import { buscarItem } from '@/lib/opa-pecas/db'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import type { Item } from '@/lib/opa-pecas/tipos'

export default function ItemPecaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params)
  const base = useBase()
  const router = useRouter()
  const [item, setItem] = useState<Item | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    buscarItem({ codigo: decodeURIComponent(codigo) })
      .then((i) => { if (vivo) setItem(i) })
      .catch((e) => { if (vivo) setErro(mensagemErro(e)) })
    return () => { vivo = false }
  }, [codigo])

  return (
    <Moldura podeGerir={base.podeGerir} largura={1100}>
      {erro && <Aviso>{erro}</Aviso>}
      {item === undefined && !erro && <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {item === null && <Aviso tipo="info">Item {decodeURIComponent(codigo)} não encontrado (pode ter sido excluído ou o código mudou).</Aviso>}
      {item && (
        <div>
          <DetalheItem key={item.id} item={item} base={base} onMudou={(novo) => {
            if (!novo) router.push('/opa/pecas')
            else if (novo.codigo !== item.codigo) router.replace(`/opa/pecas/${encodeURIComponent(novo.codigo)}`)
          }} />
        </div>
      )}
    </Moldura>
  )
}
