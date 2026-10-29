// Anexos dos e-mails enviados pela caixa do cabeçalho:
//  · arquivos escolhidos na hora de responder (vêm no multipart do POST)
//  · arquivos FIXOS da assinatura — vão em toda resposta. Ficam no bucket
//    PRIVADO `email-assinatura`, pasta = user_id (sem tabela: a lista é a pasta).
//  · imagens da assinatura — sobem no bucket público `anexos` e entram no HTML
//    por URL, como as assinaturas do Gmail (data: URI o Gmail bloqueia).
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_ASSINATURA = "email-assinatura";
/** O Gmail recusa mensagem acima de 25 MB; o base64 aumenta ~33%. */
export const LIMITE_TOTAL_BYTES = 18 * 1024 * 1024;
export const LIMITE_ARQUIVOS = 10;
export const LIMITE_IMAGEM_BYTES = 2 * 1024 * 1024;

export interface ArquivoEnvio { nome: string; tamanho: number }

/** Nome que o Storage aceita, legível: sem acento, sem barra, sem caractere estranho. */
export function nomeSeguro(nome: string): string {
  const limpo = String(nome || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (limpo || "arquivo").slice(-120);
}

/** Confere quantidade e tamanho total; devolve a mensagem de erro ou null. */
export function validarAnexos(lista: ArquivoEnvio[]): string | null {
  if (lista.length > LIMITE_ARQUIVOS) return `No máximo ${LIMITE_ARQUIVOS} anexos por e-mail.`;
  const vazio = lista.find((a) => !a.tamanho);
  if (vazio) return `O arquivo "${vazio.nome}" está vazio.`;
  const total = lista.reduce((s, a) => s + a.tamanho, 0);
  if (total > LIMITE_TOTAL_BYTES) {
    const mb = (b: number) => (b / 1048576).toFixed(1).replace(".", ",");
    return `Os anexos somam ${mb(total)} MB — o limite é ${mb(LIMITE_TOTAL_BYTES)} MB por e-mail.`;
  }
  return null;
}

// ── Arquivos fixos da assinatura (bucket privado) ────────────────────────────

let bucketOk = false;
async function garantirBucket(sb: SupabaseClient) {
  if (bucketOk) return;
  const { data } = await sb.storage.getBucket(BUCKET_ASSINATURA);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET_ASSINATURA, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  }
  bucketOk = true;
}

export async function listarArquivosAssinatura(sb: SupabaseClient, userId: string): Promise<ArquivoEnvio[]> {
  await garantirBucket(sb);
  const { data, error } = await sb.storage.from(BUCKET_ASSINATURA).list(userId, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((f) => f.id && f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({ nome: f.name, tamanho: Number((f.metadata as { size?: number } | null)?.size) || 0 }));
}

export async function guardarArquivoAssinatura(sb: SupabaseClient, userId: string, nome: string, conteudo: Buffer, tipo: string) {
  await garantirBucket(sb);
  const n = nomeSeguro(nome);
  const { error } = await sb.storage.from(BUCKET_ASSINATURA)
    .upload(`${userId}/${n}`, conteudo, { contentType: tipo || "application/octet-stream", upsert: true });
  if (error) throw new Error(error.message);
  return n;
}

export async function apagarArquivoAssinatura(sb: SupabaseClient, userId: string, nome: string) {
  const { error } = await sb.storage.from(BUCKET_ASSINATURA).remove([`${userId}/${nomeSeguro(nome)}`]);
  if (error) throw new Error(error.message);
}

/** Baixa os arquivos fixos para mandar junto (formato do nodemailer). */
export async function anexosDaAssinatura(sb: SupabaseClient, userId: string) {
  const lista = await listarArquivosAssinatura(sb, userId);
  const out: { filename: string; content: Buffer }[] = [];
  for (const a of lista) {
    const { data, error } = await sb.storage.from(BUCKET_ASSINATURA).download(`${userId}/${a.nome}`);
    if (error || !data) throw new Error(`Não consegui ler o arquivo da assinatura "${a.nome}".`);
    out.push({ filename: a.nome, content: Buffer.from(await data.arrayBuffer()) });
  }
  return out;
}

// ── Imagem da assinatura (bucket público `anexos`) ───────────────────────────

export async function guardarImagemAssinatura(sb: SupabaseClient, userId: string, nome: string, conteudo: Buffer, tipo: string) {
  const path = `email-assinatura/${userId}/${Date.now()}-${nomeSeguro(nome)}`;
  const { error } = await sb.storage.from("anexos").upload(path, conteudo, { contentType: tipo, upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from("anexos").getPublicUrl(path).data.publicUrl;
}
