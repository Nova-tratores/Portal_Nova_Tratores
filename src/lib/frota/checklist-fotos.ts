// Fotos do checklist de veículo em pasta PRIVADA (bucket `frota-checklist`).
// Até 21/10/2026 iam para o bucket público `requisicoes` e abriam sem login
// (inclusive a do CRLV). Agora o banco guarda só a referência
// "frota-checklist/<caminho>" e quem mostra a foto assina um link de 1 hora,
// sempre depois de conferir o login. Fotos antigas (URL pública) continuam
// valendo até o script scripts/frota-checklist-fotos-privadas.ts movê-las.
import { supabaseAdmin as supabase } from '@/lib/server/supabase-admin';

export const BUCKET_CHECKLIST = 'frota-checklist';
const PREFIXO = `${BUCKET_CHECKLIST}/`;
const VALIDADE_S = 3600;

/** Caminho dentro do bucket privado, ou null se a foto é URL antiga (pública). */
export function caminhoPrivado(fotoUrl: string | null | undefined): string | null {
  return fotoUrl && fotoUrl.startsWith(PREFIXO) ? fotoUrl.slice(PREFIXO.length) : null;
}

/** Sobe a foto na pasta privada e devolve a referência que vai para o banco. */
export async function subirFotoChecklist(caminho: string, buffer: Buffer, contentType: string): Promise<{ ref: string } | { erro: string }> {
  const subir = () => supabase.storage.from(BUCKET_CHECKLIST).upload(caminho, buffer, { upsert: true, contentType });
  let { error } = await subir();
  if (error && /bucket not found/i.test(error.message)) {
    await supabase.storage.createBucket(BUCKET_CHECKLIST, { public: false });
    ({ error } = await subir());
  }
  return error ? { erro: error.message } : { ref: PREFIXO + caminho };
}

/** Link assinado de uma foto (URL antiga passa como está). */
export async function assinarFoto(fotoUrl: string | null | undefined): Promise<string | null> {
  const caminho = caminhoPrivado(fotoUrl);
  if (!caminho) return fotoUrl || null;
  const { data } = await supabase.storage.from(BUCKET_CHECKLIST).createSignedUrl(caminho, VALIDADE_S);
  return data?.signedUrl || null;
}

/** Troca a referência privada de cada linha por um link assinado (uma ida ao storage). */
export async function assinarFotos<T extends { foto_url?: string | null }>(linhas: T[]): Promise<T[]> {
  const caminhos = [...new Set(linhas.map((l) => caminhoPrivado(l.foto_url)).filter((c): c is string => !!c))];
  if (caminhos.length === 0) return linhas;
  const { data } = await supabase.storage.from(BUCKET_CHECKLIST).createSignedUrls(caminhos, VALIDADE_S);
  const porCaminho = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  return linhas.map((l) => {
    const c = caminhoPrivado(l.foto_url);
    return c ? { ...l, foto_url: porCaminho.get(c) || null } : l;
  });
}
