const MECANICOS_PUSH_URL = 'https://ntmecanicos-production.up.railway.app/api/push'

// Mesma PUSH_API_SECRET do app dos mecânicos (Railway dos dois) — sem ela o app
// recusa o envio quando a variável estiver configurada lá.
function cabecalhos(): Record<string, string> {
  const segredo = process.env.PUSH_API_SECRET
  return { 'Content-Type': 'application/json', ...(segredo ? { 'x-push-secret': segredo } : {}) }
}

export async function pushParaTecnico(
  tecnicoNome: string,
  params: { titulo: string; descricao?: string; link?: string },
): Promise<void> {
  try {
    await fetch(`${MECANICOS_PUSH_URL}/send`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({
        tecnico_nome: tecnicoNome,
        titulo: params.titulo,
        descricao: params.descricao || '',
        link: params.link || '/',
      }),
    })
  } catch {
    /* best-effort */
  }
}

export async function pushParaTodos(
  params: { titulo: string; descricao?: string; link?: string },
): Promise<void> {
  try {
    await fetch(`${MECANICOS_PUSH_URL}/send-all`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({
        titulo: params.titulo,
        descricao: params.descricao || '',
        link: params.link || '/',
      }),
    })
  } catch {
    /* best-effort */
  }
}
