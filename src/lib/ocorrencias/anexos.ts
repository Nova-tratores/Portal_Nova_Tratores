// Upload de anexos de ocorrência/justificativa (client-side): fotos e vídeos
// no bucket público `anexos`, path ocorrencias/... — padrão dos avisos.
// Limites: imagem ≤10MB, vídeo ≤50MB, máx. 5 arquivos por lançamento.
import { supabase } from '@/lib/supabase'
import type { AnexoOcorrencia } from './registrar'

const MAX_ARQUIVOS = 5
const MAX_IMAGEM = 10 * 1024 * 1024
const MAX_VIDEO = 50 * 1024 * 1024

export const ACCEPT_ANEXOS = 'image/*,video/*'

function sanitizar(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

export function validarAnexo(file: File): string | null {
  const ehVideo = file.type.startsWith('video/')
  const ehImagem = file.type.startsWith('image/')
  if (!ehVideo && !ehImagem) return `"${file.name}": só fotos ou vídeos.`
  if (ehImagem && file.size > MAX_IMAGEM) return `"${file.name}": imagem acima de 10MB.`
  if (ehVideo && file.size > MAX_VIDEO) return `"${file.name}": vídeo acima de 50MB.`
  return null
}

/**
 * Sobe os arquivos e devolve o array pro JSONB `anexos`. Erros individuais
 * não travam os demais — voltam em `erros` pra UI mostrar.
 */
export async function uploadAnexosOcorrencia(
  files: File[],
  subpasta = 'ocorrencias',
): Promise<{ anexos: AnexoOcorrencia[]; erros: string[] }> {
  const anexos: AnexoOcorrencia[] = []
  const erros: string[] = []
  const lote = files.slice(0, MAX_ARQUIVOS)
  if (files.length > MAX_ARQUIVOS) erros.push(`Máximo de ${MAX_ARQUIVOS} arquivos — os extras foram ignorados.`)

  const prefixo = `${subpasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  for (const file of lote) {
    const invalido = validarAnexo(file)
    if (invalido) { erros.push(invalido); continue }
    const path = `${prefixo}/${sanitizar(file.name)}`
    const { error } = await supabase.storage.from('anexos').upload(path, file)
    if (error) { erros.push(`"${file.name}": ${error.message}`); continue }
    const { data } = supabase.storage.from('anexos').getPublicUrl(path)
    anexos.push({
      url: data.publicUrl,
      tipo: file.type.startsWith('video/') ? 'video' : 'imagem',
      nome: file.name,
      tamanho: file.size,
    })
  }
  return { anexos, erros }
}
