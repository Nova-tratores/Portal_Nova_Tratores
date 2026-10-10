// POPs — fila local de respostas que NÃO chegaram ao servidor (conexão ruim).
// Não é offline completo (fora do v1): só garante que o que foi respondido não
// se perde se a rede cair; reenvia ao voltar a conexão ou ao reabrir a execução.
// CLIENT-ONLY (localStorage), sempre em try/catch.

export interface RespostaPendente { passo_id: string; valor: Record<string, unknown>; fotos: string[]; em: number }

const chave = (ticketId: string) => `pops-exec-fila:${ticketId}`

export function lerFila(ticketId: string): RespostaPendente[] {
  try { return JSON.parse(localStorage.getItem(chave(ticketId)) || '[]') as RespostaPendente[] } catch { return [] }
}

function gravar(ticketId: string, fila: RespostaPendente[]) {
  try {
    if (fila.length) localStorage.setItem(chave(ticketId), JSON.stringify(fila))
    else localStorage.removeItem(chave(ticketId))
  } catch { /* storage indisponível: segue só em memória */ }
}

// Uma pendência por passo (a mais nova vale).
export function enfileirar(ticketId: string, r: Omit<RespostaPendente, 'em'>) {
  const fila = lerFila(ticketId).filter((x) => x.passo_id !== r.passo_id)
  gravar(ticketId, [...fila, { ...r, em: Date.now() }])
}

export function tirarDaFila(ticketId: string, passoId: string) {
  gravar(ticketId, lerFila(ticketId).filter((x) => x.passo_id !== passoId))
}

// Falha de REDE (vale enfileirar) × recusa do servidor (não vale: mostrar o erro).
export const ehFalhaDeRede = (e: unknown) => e instanceof TypeError || (e as { status?: number })?.status === undefined
