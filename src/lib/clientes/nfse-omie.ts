import type { SupabaseClient } from "@supabase/supabase-js";
import { numeroNfse } from "./numero-nf";

// NFS-e da OS → PDF guardado na pasta do cliente. Usado por TODOS os caminhos
// que trazem a nota do Omie (webhook do faturamento, syncs, anexar, botão "Ver").
//
// Regra: `link_nf` da OS só recebe PDF GUARDADO NO PORTAL. Desde a NFS-e
// nacional (09/2026), StatusOS/ObterNFSe devolvem logo após o faturamento o link
// de CONSULTA do nfse.gov.br (pede captcha, não é PDF) e o `cPdfNFSe` só aparece
// depois. Gravar a consulta fazia a OS sair da fila de "sem nota" e nunca mais
// ser corrigida. Agora: sem PDF → grava só o número e os syncs tentam de novo.

export type ContaOmieNfse = { key: string; secret: string };

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const BUCKET = "clientes-docs";

/** Filtro PostgREST (.or) das OS que ainda não têm o PDF da nota no portal. */
export const OR_OS_SEM_PDF_NFSE =
  "link_nf.is.null,link_nf.eq.,link_nf.like.*nfse.gov.br*,link_nf.like.*connect.omie*";

/** O link já é um arquivo guardado no storage do portal? */
export function linkNoPortal(url: string | null | undefined): boolean {
  return !!url && /\/storage\/v1\/object\/public\//.test(url);
}

async function omie(ep: string, call: string, param: Record<string, unknown>, acc: ContaOmieNfse) {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data;
}

/** Baixa e confere que é PDF de verdade (assinatura %PDF-). */
export async function baixarPdf(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
  } catch { return null; }
}

type NfseItem = { OrdemServico?: { nCodigoOS?: number }; Cabecalho?: { nCodNF?: number; nNumeroNFSe?: string | number; cStatusNFSe?: string } };

/** Acha no Omie a NFS-e DESTA OS (pelo número) e devolve a URL do PDF, se já existir. */
export async function pdfNfseNoOmie(acc: ContaOmieNfse, codOS: number, numero: string): Promise<{ numero: string; urlPdf: string | null } | null> {
  let nIdNf = 0;
  for (let pag = 1, tot = 1; pag <= tot && pag <= 10 && !nIdNf; pag++) {
    // o filtro por número também traz notas com número "parecido" (64 → 164, 264…)
    const l = await omie("/servicos/nfse/", "ListarNFSEs", { nPagina: pag, nRegPorPagina: 100, nNumeroNFSe: numero }, acc);
    tot = Number(l?.nTotPaginas || 1);
    const nf = ((l?.nfseEncontradas || []) as NfseItem[]).find(n =>
      Number(n?.OrdemServico?.nCodigoOS) === Number(codOS) && String(n?.Cabecalho?.cStatusNFSe || "") !== "C");
    if (nf) nIdNf = Number(nf.Cabecalho?.nCodNF || 0);
  }
  if (!nIdNf) return null;
  const doc = await omie("/servicos/osdocs/", "ObterNFSe", { nIdNf }, acc);
  return { numero, urlPdf: String(doc?.cPdfNFSe || "") || null };
}

/** Guarda o PDF no storage da pasta e devolve a URL pública. */
export async function guardarPdfNfse(supabase: SupabaseClient, empresa: string, numOS: string, numero: string | null, pdf: Buffer): Promise<string | null> {
  const path = `${empresa.replace(/ /g, "_")}/os_${numOS}/nfse_${numero || numOS}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Resolve a NFS-e de uma OS: tenta o link que o chamador já tem (se for PDF),
 * senão busca o PDF no Omie pelo número. Devolve o que gravar na OS:
 * `link_nf` SÓ quando o PDF foi guardado no portal; `num_nf` sempre que souber.
 */
export async function resolverNfseDaOS(
  supabase: SupabaseClient,
  acc: ContaOmieNfse,
  os: { empresa: string; num_os: string; cod_os: number },
  candidato: { numero?: string | number | null; url?: string | null } = {},
): Promise<{ num_nf?: string; link_nf?: string; pdf?: Buffer }> {
  const bruto = candidato.numero != null ? String(candidato.numero).trim() : "";
  const numero = numeroNfse(bruto); // sem zeros à esquerda: busca no Omie e nome do arquivo
  const out: { num_nf?: string; link_nf?: string; pdf?: Buffer } = {};
  if (bruto) out.num_nf = bruto; // grava como o Omie manda (há código que compara)

  // 1) o link que veio já é PDF (DANFSe municipal, connect.omie → S3, cPdfNFSe)
  let pdf: Buffer | null = null;
  if (candidato.url && !/nfse\.gov\.br/i.test(candidato.url)) pdf = await baixarPdf(candidato.url);

  // 2) não veio PDF: pede ao Omie o PDF da nota desta OS
  if (!pdf && numero) {
    try {
      const achado = await pdfNfseNoOmie(acc, os.cod_os, numero);
      if (achado?.urlPdf) pdf = await baixarPdf(achado.urlPdf);
    } catch { /* Omie fora/limite: fica pro próximo sync */ }
  }
  if (!pdf) return out;

  const link = await guardarPdfNfse(supabase, os.empresa, os.num_os, numero, pdf);
  if (link) { out.link_nf = link; out.pdf = pdf; }
  return out;
}

/** Número da NFS-e pelo StatusOS (fallback quando ninguém mais sabe). */
export async function numeroNfsePeloStatusOS(acc: ContaOmieNfse, codOS: number): Promise<string | null> {
  const st = await omie("/servicos/os/", "StatusOS", { nCodOS: codOS }, acc);
  const lista: { nNfse?: string; danfe?: string; cUrlNfse?: string }[] = st?.ListaRpsNfse || [];
  const nf = lista.find(n => n?.danfe || n?.cUrlNfse) || lista[lista.length - 1];
  return numeroNfse(nf?.nNfse);
}
