const fs = require('fs');
const PDFParser = require('pdf2json');

function readPdf(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataReady', (data) => {
      const pages = data.Pages || [];
      const result = [];
      for (let pi = 0; pi < pages.length; pi++) {
        const texts = pages[pi].Texts || [];
        const lines = new Map();
        for (const t of texts) {
          const y = Math.round(t.y * 10);
          const x = Math.round(t.x * 10);
          const str = (t.R || []).map(r => decodeURIComponent(r.T)).join('');
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y).push({ x, str });
        }
        const sorted = Array.from(lines.entries()).sort((a, b) => a[0] - b[0]);
        result.push(`--- Page ${pi + 1} ---`);
        for (const [y, items] of sorted) {
          items.sort((a, b) => a.x - b.x);
          const line = items.map(i => i.str).join('  |  ');
          if (line.trim()) result.push(`[${y}] ${line}`);
        }
      }
      resolve(result.join('\n'));
    });
    parser.on('pdfParser_dataError', (err) => reject(err));
    parser.loadPDF(filePath);
  });
}

async function main() {
  console.log('=== ORDEM DE SERVICO 4986 ===');
  console.log(await readPdf('docs/ordem_de_servico_4986.pdf'));
  console.log('\n\n========================================\n');
  console.log('=== PEDIDO DE VENDA 7161 ===');
  console.log(await readPdf('docs/pedido_de_venda_7161.pdf'));
}
main().catch(e => console.error(e));
