// Endereço do app dos técnicos: env MECANICOS_APP_URL (sem barra no fim); sem ele, o endereço antigo do Railway.
// O app exige o header x-push-secret (= PUSH_SECRET, o mesmo valor nos dois) quando PUSH_SECRET existir lá (José, 23/10/2026)
const MECANICOS_PUSH_URL = `${(process.env.MECANICOS_APP_URL || 'https://ntmecanicos-production.up.railway.app').replace(/\/+$/, '')}/api/push`
function cabecalhos(): Record<string, string> {
  const segredo = process.env.PUSH_SECRET || ''
  return segredo ? { 'Content-Type': 'application/json', 'x-push-secret': segredo } : { 'Content-Type': 'application/json' }
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
