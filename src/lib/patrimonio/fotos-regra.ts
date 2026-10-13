// Foto do patrimônio só vale se foi enviada pelo próprio usuário para o bucket
// 'patrimonio-fotos' ("<uid>/<uuid>.jpg") — a rota não aceita caminho de outra pasta.

export const BUCKET_PATRIMONIO = 'patrimonio-fotos'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function caminhoFotoValido(path: unknown, userId: string): path is string {
  return typeof path === 'string' && new RegExp(`^${userId}/${UUID}\\.jpg$`, 'i').test(path)
}
