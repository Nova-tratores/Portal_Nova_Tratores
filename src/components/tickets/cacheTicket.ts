// Pré-carregar pedidos (José, 26/11/2026: "tudo carregando muito demorado dentro de cada tarefa").
// A fila busca os dados do pedido ANTES do clique (as primeiras ao abrir a tela, as outras ao passar
// o mouse). Quando a janela abre, os dados já estão aqui e aparecem na hora; ela só atualiza por trás.
// Arquivo pequeno de propósito: a fila importa isto sem baixar a janela inteira (TicketDetalhe).
import { authHeaders } from '@/lib/auth/client'

/** Resposta crua de GET /api/tickets/:id, por id. Vale por 60 s (depois busca de novo ao pré-carregar). */
export const cacheBruto = new Map<string, { json: Record<string, unknown>; em: number }>()
const emCurso = new Map<string, Promise<void>>()

export function prefetchTicket(id: string): Promise<void> {
  const tem = cacheBruto.get(id)
  if (tem && Date.now() - tem.em < 60_000) return Promise.resolve()
  const ja = emCurso.get(id)
  if (ja) return ja
  const p = (async () => {
    try {
      const r = await fetch(`/api/tickets/${id}`, { headers: await authHeaders() })
      if (r.ok) cacheBruto.set(id, { json: await r.json(), em: Date.now() })
    } catch { /* sem pré-carga: a janela busca normalmente */ }
    finally { emCurso.delete(id) }
  })()
  emCurso.set(id, p)
  return p
}

/** Pré-carrega vários, 3 de cada vez (não entope a rede nem o servidor). */
export async function prefetchVarios(ids: string[]): Promise<void> {
  const fila = [...ids]
  const trabalhador = async () => { while (fila.length) await prefetchTicket(fila.shift()!) }
  await Promise.all([trabalhador(), trabalhador(), trabalhador()])
}
