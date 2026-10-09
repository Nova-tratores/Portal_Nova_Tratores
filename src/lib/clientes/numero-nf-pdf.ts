import { numeroNfDoLink } from "./numero-nf";

// Último recurso para o nº da NF-e: ler o PRÓPRIO PDF. Serve para nota anexada à
// mão (o nome do arquivo não traz o número e o Omie pode não ter a nota — ex.: PV
// cancelado e a nota emitida por outro pedido). A DANFE traz a chave de acesso
// (44 dígitos); dela sai o nNF. Só servidor (pdfjs legacy, sem worker).

/** Nº da NF-e a partir do texto da DANFE (chave de acesso; senão "Nº 8.398 Série"). */
export function numeroNfDoTextoDanfe(texto: string): string | null {
  const chave = texto.replace(/\s+/g, "").match(/\d{44}/);
  if (chave) {
    const n = numeroNfDoLink(`/${chave[0]}.pdf`);
    if (n) return n;
  }
  const m = texto.match(/N[º°o]\s*\.?\s*([\d.]{1,11})\s+S[ée]rie/i);
  if (m) {
    const n = parseInt(m[1].replace(/\./g, ""), 10);
    if (n > 0) return String(n).padStart(8, "0");
  }
  return null;
}

/** Baixa o PDF e lê o nº da NF-e da 1ª página. Qualquer falha → null. */
export async function numeroNfDoPdf(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true }).promise;
    try {
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      const texto = tc.items.map(i => ("str" in i ? i.str : "")).join(" ");
      return numeroNfDoTextoDanfe(texto);
    } finally {
      try { await doc.destroy(); } catch { /* */ }
    }
  } catch { return null; }
}
