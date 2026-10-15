'use client'
// Patrimônio Loja — cadastrar item novo.
import { useRouter } from 'next/navigation'
import Formulario from '@/components/opa/patrimonio/Formulario'
import PaginaPatrimonio from '@/components/opa/patrimonio/Pagina'
import { FORM_VAZIO } from '@/lib/patrimonio/tipos'

export default function NovoPatrimonioPage() {
  const router = useRouter()
  return (
    <PaginaPatrimonio>
      {(base) => (
        <Formulario base={base} inicial={FORM_VAZIO} onCancelar={() => router.push('/opa/patrimonio')}
          onSalvo={(item) => { base.recarregar(); router.push(`/opa/patrimonio/${item.id}?etiqueta=1`) }} />
      )}
    </PaginaPatrimonio>
  )
}
