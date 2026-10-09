// A antiga etapa "Destino" virou "Concluídas" (sql/pni-11) — links antigos continuam valendo.
import { redirect } from 'next/navigation'

export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const item = typeof sp.item === 'string' ? `?item=${encodeURIComponent(sp.item)}` : ''
  redirect(`/opa/pecas/concluidas${item}`)
}
