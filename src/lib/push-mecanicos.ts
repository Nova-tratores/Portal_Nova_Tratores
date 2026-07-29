const MECANICOS_PUSH_URL = 'https://ntmecanicos-production.up.railway.app/api/push'

export async function pushParaTecnico(
  tecnicoNome: string,
  params: { titulo: string; descricao?: string; link?: string },
): Promise<void> {
  try {
    await fetch(`${MECANICOS_PUSH_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
