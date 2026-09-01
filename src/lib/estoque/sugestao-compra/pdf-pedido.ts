/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
// PDF de um pedido de compra (pdfkit, tabela manual, retorna Buffer). Segue o
// padrão de src/lib/ajustes/pdf-pedidos.ts. Requer serverExternalPackages:['pdfkit'].
const PDFDocument = require('pdfkit');

function fmtBRL(n: any): string {
  if (n == null || isNaN(n)) return '';
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface ItemPedidoPDF { sku?: string; descricao?: string; qtd_pedida?: number; preco_estimado?: number }
export interface PedidoPDF {
  numero: number | string; conta: string; fornecedor?: string; data?: string;
  criadoPor?: string; observacao?: string; itens: ItemPedidoPDF[];
}

interface Col { k: string; label: string; w: number; alignR?: boolean }

export function gerarPDFPedidoCompra(p: PedidoPDF): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Cabeçalho
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f766e').text(`Pedido de Compra #${p.numero}`, { align: 'left' });
      doc.fillColor('#000').fontSize(9).font('Helvetica');
      doc.text(`Fornecedor: ${p.fornecedor || '—'}    Conta: ${String(p.conta).toUpperCase()}    Data: ${p.data || new Date().toLocaleDateString('pt-BR')}`);
      if (p.criadoPor) doc.fontSize(8).fillColor('#666').text(`Criado por: ${p.criadoPor}`);
      if (p.observacao) doc.fontSize(8).fillColor('#666').text(`Obs: ${p.observacao}`);
      doc.moveDown(0.4).fillColor('#000');

      const cols: Col[] = [
        { k: 'sku', label: 'SKU', w: 130 },
        { k: 'descricao', label: 'Descrição', w: 380 },
        { k: 'qtd', label: 'Qtd', w: 60, alignR: true },
        { k: 'preco', label: 'Preço un.', w: 90, alignR: true },
        { k: 'total', label: 'Total', w: 90, alignR: true },
      ];
      const xStart = doc.page.margins.left;
      const larguraTotal = cols.reduce((s, c) => s + c.w, 0);
      const HDR_H = 16, ROW_H = 14;
      const yBottom = doc.page.height - doc.page.margins.bottom - ROW_H;

      function cabec() {
        const y = doc.y;
        doc.rect(xStart, y, larguraTotal, HDR_H).fill('#1f2937');
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
        let x = xStart;
        cols.forEach((c) => { doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.alignR ? 'right' : 'left', lineBreak: false }); x += c.w; });
        doc.fillColor('#000').font('Helvetica');
        doc.y = y + HDR_H;
      }
      function linha(r: Record<string, any>, alt: boolean) {
        const y = doc.y;
        if (alt) doc.fillColor('#f3f4f6').rect(xStart, y, larguraTotal, ROW_H).fill();
        doc.fillColor('#111').font('Helvetica').fontSize(8);
        let x = xStart;
        cols.forEach((c) => { doc.text(r[c.k] == null ? '' : String(r[c.k]), x + 3, y + 3, { width: c.w - 6, align: c.alignR ? 'right' : 'left', lineBreak: false, ellipsis: true }); x += c.w; });
        doc.y = y + ROW_H;
      }

      let totalGeral = 0, totalQtd = 0;
      const linhas = (p.itens || []).map((it) => {
        const q = Number(it.qtd_pedida) || 0, pu = Number(it.preco_estimado) || 0;
        totalGeral += q * pu; totalQtd += q;
        return { sku: it.sku || '', descricao: (it.descricao || '').slice(0, 90), qtd: q, preco: fmtBRL(pu), total: fmtBRL(q * pu) };
      });

      cabec();
      linhas.forEach((l, i) => {
        if (doc.y > yBottom) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 }); cabec(); }
        linha(l, i % 2 === 1);
      });

      doc.moveDown(0.6);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
        .text(`${linhas.length} itens · ${totalQtd} unidades · Total estimado ${fmtBRL(totalGeral)}`);
      doc.fontSize(7).font('Helvetica').fillColor('#999')
        .text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Portal Nova Tratores · Sugestão de Compra`);

      doc.end();
    } catch (e) { reject(e); }
  });
}
