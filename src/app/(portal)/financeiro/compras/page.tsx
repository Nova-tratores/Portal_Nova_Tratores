// Área Compras: abre na Mercadoria para revenda.
import { redirect } from 'next/navigation'

export default function ComprasPage() {
  redirect('/financeiro/compras/mercadoria')
}
