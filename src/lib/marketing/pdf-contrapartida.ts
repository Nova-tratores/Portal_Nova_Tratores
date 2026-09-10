// =============================================================================
// PDF do RELATÓRIO DE CONTRAPARTIDA (desenho puro, sem banco e sem e-mail).
//
// Separado de propósito: quem monta o documento não precisa do provedor de
// e-mail nem da config de envio, e assim o PDF pode ser testado no vitest sem
// depender de variáveis de ambiente. Quem junta as duas pontas é
// relatorio-contrapartida.ts.
//
// Mesma espinha do PDF do PPV (src/lib/ppv/relatorio-lista.ts): pdfkit por
// require, bufferPages, cabeçalho por página e "Página X de Y" no fim.
// Retrato aqui (o do PPV é paisagem): isto é narrativa, não tabela larga.
// =============================================================================
/* eslint-disable @typescript-eslint/no-require-imports */
const pdfkitMod = require('pdfkit');
const PDFDocument = pdfkitMod.default || pdfkitMod;

import { NAO_REGISTRADO, type Relatorio } from './contrapartida';

const ROSA = '#DB2777';
const CINZA = '#555555';
const M = 40; // margem

/**
 * Baixa a imagem pra embutir no PDF. Falha NUNCA derruba o relatório: uma foto
 * com URL quebrada vira uma linha de texto, e o resto do documento sai.
 */
async function baixarImagem(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || '';
    // pdfkit só entende JPEG e PNG.
    if (!/jpe?g|png/i.test(tipo) && !/\.(jpe?g|png)(\?|$)/i.test(url)) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > 6_000_000) return null; // foto gigante estoura a memória
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function gerarPDFContrapartida(rel: Relatorio): Promise<Buffer> {
  // Baixa as fotos ANTES de abrir o documento: dentro do pipe o pdfkit é
  // síncrono e não dá pra esperar rede no meio do desenho.
  const fotos: { buf: Buffer | null; legenda: string; url: string }[] = [];
  for (const f of rel.fotos.slice(0, 6)) {
    fotos.push({ buf: await baixarImagem(f.url), legenda: f.legenda, url: f.url });
  }

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const larg = pageW - M * 2;

      const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const cabecalho = () => {
        doc.rect(0, 0, pageW, 6).fill(ROSA);
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16)
          .text(rel.titulo, M, 24, { width: larg });
        doc.font('Helvetica').fontSize(11).fillColor(CINZA)
          .text(rel.subtitulo, M, doc.y + 2, { width: larg });
        doc.fontSize(8).fillColor('#999999')
          .text(`Nova Tratores · gerado em ${geradoEm}`, M, doc.y + 2, { width: larg });
        doc.moveTo(M, doc.y + 6).lineTo(pageW - M, doc.y + 6).strokeColor('#dddddd').stroke();
        doc.y += 14;
      };

      const espaco = (precisa: number) => {
        if (doc.y + precisa > pageH - M - 14) {
          doc.addPage();
          cabecalho();
        }
      };

      cabecalho();

      for (const secao of rel.secoes) {
        espaco(60);
        doc.font('Helvetica-Bold').fontSize(12).fillColor(ROSA)
          .text(secao.titulo, M, doc.y, { width: larg });
        doc.y += 4;

        for (const l of secao.linhas) {
          const alturaValor = doc.font('Helvetica').fontSize(9).heightOfString(l.valor, { width: larg - 170 });
          espaco(alturaValor + 8);
          const y0 = doc.y;
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
            .text(`${l.rotulo}:`, M, y0, { width: 160 });
          // Vazio sai em vermelho: quem lê identifica de relance o que falta.
          doc.font('Helvetica').fontSize(9)
            .fillColor(l.valor === NAO_REGISTRADO ? '#b91c1c' : '#333333')
            .text(l.valor, M + 165, y0, { width: larg - 170 });
          doc.y = Math.max(doc.y, y0 + alturaValor) + 3;
        }

        if (secao.tabela) {
          doc.y += 4;
          const cols = secao.tabela.cabecalho.length;
          const wCol = larg / cols;
          espaco(30);
          const yc = doc.y;
          doc.rect(M, yc - 2, larg, 15).fill('#f3f4f6');
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
          secao.tabela.cabecalho.forEach((c, i) => {
            doc.text(c, M + 4 + i * wCol, yc + 2, { width: wCol - 8, lineBreak: false });
          });
          doc.y = yc + 16;

          for (const linha of secao.tabela.linhas) {
            const alturas = linha.map((c) => doc.font('Helvetica').fontSize(8).heightOfString(c, { width: wCol - 8 }));
            const alt = Math.max(...alturas, 10);
            espaco(alt + 6);
            const y0 = doc.y;
            linha.forEach((c, i) => {
              doc.font('Helvetica').fontSize(8)
                .fillColor(c === NAO_REGISTRADO ? '#b91c1c' : '#333333')
                .text(c, M + 4 + i * wCol, y0, { width: wCol - 8 });
            });
            doc.y = y0 + alt + 3;
            doc.moveTo(M, doc.y - 1).lineTo(pageW - M, doc.y - 1).strokeColor('#eeeeee').stroke();
          }
          doc.y += 4;
        }

        if (secao.texto) {
          espaco(30);
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#333333')
            .text(secao.texto, M, doc.y, { width: larg });
          doc.y += 6;
        }

        doc.y += 8;
      }

      // ── 8. Registro fotográfico ──────────────────────────────────────────
      espaco(60);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(ROSA)
        .text('8. Registro fotográfico', M, doc.y, { width: larg });
      doc.y += 6;

      if (fotos.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#b91c1c')
          .text(NAO_REGISTRADO, M, doc.y, { width: larg });
        doc.y += 12;
      } else {
        const wFoto = (larg - 12) / 2;
        const hFoto = 130;
        let col = 0;
        for (const f of fotos) {
          espaco(hFoto + 26);
          const x = M + col * (wFoto + 12);
          const y0 = doc.y;
          if (f.buf) {
            try {
              doc.image(f.buf, x, y0, { fit: [wFoto, hFoto], align: 'center' });
            } catch {
              doc.font('Helvetica').fontSize(8).fillColor('#b91c1c')
                .text(`Imagem não pôde ser lida: ${f.url}`, x, y0, { width: wFoto });
            }
          } else {
            doc.font('Helvetica').fontSize(8).fillColor('#b91c1c')
              .text(`Imagem indisponível: ${f.url}`, x, y0, { width: wFoto });
          }
          doc.font('Helvetica').fontSize(8).fillColor(CINZA)
            .text(f.legenda, x, y0 + hFoto + 3, { width: wFoto });
          if (col === 1) { doc.y = y0 + hFoto + 22; col = 0; } else { doc.y = y0; col = 1; }
        }
        if (col === 1) doc.y += hFoto + 22;
      }

      // Vídeo não cabe num PDF: entra como link, pra fábrica saber que existe.
      if (rel.videos.length > 0) {
        espaco(24 + rel.videos.length * 12);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
          .text('Vídeos (abrir pelo link):', M, doc.y, { width: larg });
        doc.y += 2;
        for (const v of rel.videos) {
          doc.font('Helvetica').fontSize(8).fillColor('#2563eb')
            .text(`• ${v.legenda !== NAO_REGISTRADO ? v.legenda + ' — ' : ''}${v.url}`, M, doc.y, {
              width: larg, link: v.url, underline: false,
            });
          doc.y += 2;
        }
        doc.y += 6;
      }

      // ── 9. O que ainda falta registrar ───────────────────────────────────
      // Fica no documento de propósito: o PDF é também o checklist interno.
      if (rel.pendencias.length > 0) {
        espaco(50);
        doc.y += 8;
        const y0 = doc.y;
        const alturaLista = doc.font('Helvetica').fontSize(9)
          .heightOfString(rel.pendencias.map((p) => `• ${p}`).join('\n'), { width: larg - 16 });
        espaco(alturaLista + 34);
        doc.rect(M, doc.y, larg, alturaLista + 28).fillAndStroke('#fef2f2', '#dc2626');
        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(10)
          .text('Itens ainda não registrados', M + 8, doc.y + 6, { width: larg - 16 });
        doc.font('Helvetica').fontSize(9).fillColor('#7f1d1d')
          .text(rel.pendencias.map((p) => `• ${p}`).join('\n'), M + 8, doc.y + 4, { width: larg - 16 });
        doc.y = Math.max(doc.y, y0) + 10;
      }

      // "Página X de Y"
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(8).fillColor('#999999')
          .text(`Página ${i - range.start + 1} de ${range.count}`, M, pageH - M + 8, {
            width: larg, align: 'right', lineBreak: false,
          });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
