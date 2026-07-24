// Prepara os anexos de uma requisição (NF, boleto, recibo) para entrarem na
// MESMA impressão da requisição — o pedido foi "não ter que ficar imprimindo um
// por um".
//
// Por que virar imagem em vez de montar um PDF por fora: a folha da requisição
// já é impressa pelo TemplatePDF (HTML + window.print). Refazer aquele layout
// num jsPDF seria manter dois desenhos da mesma coisa. Então o caminho é o
// contrário: cada anexo vira uma imagem e entra como página extra do mesmo
// documento, e a requisição sai exatamente como sempre saiu.
//
// PDF é rasterizado página a página com o pdfjs-dist (mesma técnica do preview
// de documentos da Frota), então um anexo com 3 páginas vira 3 folhas.

export interface AnexoParaPdf {
  label: string;   // "Nota Fiscal", "Recibo / Outros", ...
  url: string;
}

/** Uma folha pronta pra virar página na impressão. */
export interface FolhaAnexo {
  label: string;
  dataUrl: string;
}

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  try {
    // @ts-expect-error — o worker não expõe tipos (é só o bundle do worker)
    lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs')).default;
  } catch {
    lib.GlobalWorkerOptions.workerSrc = '';
  }
  return lib;
}

const ehPdf = (url: string, tipo: string) => tipo === 'application/pdf' || /\.pdf($|\?)/i.test(url);

async function folhasDoAnexo(anexo: AnexoParaPdf): Promise<FolhaAnexo[]> {
  const resp = await fetch(anexo.url);
  if (!resp.ok) throw new Error(`não consegui baixar (${resp.status})`);
  const blob = await resp.blob();

  if (ehPdf(anexo.url, blob.type)) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    const folhas: FolhaAnexo[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / base.width) });
      const cv = document.createElement('canvas');
      cv.width = viewport.width; cv.height = viewport.height;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport, canvas: cv } as any).promise;
      folhas.push({
        label: doc.numPages > 1 ? `${anexo.label} (${n}/${doc.numPages})` : anexo.label,
        dataUrl: cv.toDataURL('image/jpeg', 0.9),
      });
    }
    return folhas;
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => erro(new Error('imagem inválida'));
      i.src = url;
    });
    // Redesenha num canvas: normaliza o formato e garante fundo branco em
    // imagem com transparência (senão sai preto em algumas impressoras).
    const cv = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return [{ label: anexo.label, dataUrl: cv.toDataURL('image/jpeg', 0.9) }];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Converte todos os anexos escolhidos em folhas.
 * Anexo que falhar (link quebrado, arquivo no Drive antigo) é PULADO e volta em
 * `falhas` — melhor imprimir o resto do que não imprimir nada.
 */
export async function folhasDosAnexos(anexos: AnexoParaPdf[]): Promise<{ folhas: FolhaAnexo[]; falhas: string[] }> {
  const folhas: FolhaAnexo[] = [];
  const falhas: string[] = [];
  for (const anexo of anexos) {
    try {
      folhas.push(...await folhasDoAnexo(anexo));
    } catch (e: any) {
      falhas.push(`${anexo.label}: ${e?.message || 'erro'}`);
    }
  }
  return { folhas, falhas };
}
