/* eslint-disable @typescript-eslint/no-explicit-any */
// Gera um PDF tabular da lista de pedidos abertos. Usa pdfkit (sem renderizar
// HTML; tabela manual, layout simples e leve). Retorna Buffer.
// Portado 1:1 de src/pdf-pedidos.js (CommonJS) para TypeScript.
// pdfkit nao tem @types instalado; usamos require + any (contido a este arquivo).
/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');

function fmtBRL(n: any): string {
  if (n == null || isNaN(n)) return '';
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface GerarPDFPedidosArgs {
  titulo?: string;
  subtitulo?: string;
  pedidos?: any[];
  agrupado?: boolean;
  diasMin?: number | null;
}

interface Col { k: string; label: string; w: number; alignR?: boolean }

// Gera PDF e devolve Buffer (Promise).
export function gerarPDFPedidos({ titulo, subtitulo, pedidos, agrupado, diasMin }: GerarPDFPedidosArgs = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Cabecalho
      doc.fontSize(16).font('Helvetica-Bold').text(titulo || 'Pedidos abertos', { align: 'left' });
      if (subtitulo) doc.fontSize(9).font('Helvetica').fillColor('#666').text(subtitulo);
      doc.fontSize(8).fillColor('#999').text('Gerado em ' + new Date().toLocaleString('pt-BR'));
      doc.moveDown(0.5);
      doc.fillColor('#000');

      // Cabecalho da tabela
      const cols: Col[] = [
        { k: 'criadoPor',    label: 'Criado por',  w: 90 },
        { k: 'dataInclusao', label: 'Inclusao',    w: 60 },
        { k: 'diasAberto',   label: 'Dias',        w: 30, alignR: true },
        { k: 'conta',        label: 'Conta',       w: 50 },
        { k: 'numero',       label: 'Pedido',      w: 50 },
        { k: 'cliente',      label: 'Cliente',     w: 200 },
        { k: 'etapa',        label: 'Etapa',       w: 75 },
        { k: 'nItens',       label: 'Itens',       w: 30, alignR: true },
        { k: 'valor',        label: 'Valor',       w: 70, alignR: true },
      ];
      const xStart = doc.page.margins.left;
      const larguraTotal = cols.reduce((s, c) => s + c.w, 0);
      const HDR_H = 15;   // altura da faixa do cabecalho
      const ROW_H = 13;   // altura de cada linha
      const yBottom = doc.page.height - doc.page.margins.bottom - ROW_H;

      // IMPORTANTE: nao ler doc.y dentro do loop de colunas. doc.text(x, y) avanca
      // o cursor interno, entao cada celula "escorregava" para baixo (layout escada).
      // Aqui posicionamos tudo por um `y` fixo passado explicitamente.
      function desenharCabec() {
        const y = doc.y;
        doc.rect(xStart, y, larguraTotal, HDR_H).fill('#1f2937');
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
        let x = xStart;
        cols.forEach((c) => {
          doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.alignR ? 'right' : 'left', lineBreak: false });
          x += c.w;
        });
        doc.fillColor('#000').font('Helvetica');
        doc.y = y + HDR_H;
      }

      function desenharLinha(p: Record<string, any>, alt: boolean) {
        const y = doc.y;
        if (alt) doc.fillColor('#f3f4f6').rect(xStart, y, larguraTotal, ROW_H).fill();
        doc.fillColor('#111').font('Helvetica').fontSize(8);
        let x = xStart;
        cols.forEach((c) => {
          const v = p[c.k];
          doc.text(v == null ? '' : String(v), x + 3, y + 3, { width: c.w - 6, align: c.alignR ? 'right' : 'left', lineBreak: false, ellipsis: true });
          x += c.w;
        });
        doc.y = y + ROW_H;
      }

      const linhas = (pedidos || []).map((p: any) => ({
        criadoPor: p.criadoPorNome || p.criadoPorLogin || '(?)',
        dataInclusao: p.dataInclusao || '',
        diasAberto: p.diasAberto != null ? String(p.diasAberto) : '',
        conta: p.contaLabel || p.conta || '',
        numero: p.numero || '',
        cliente: (p.nomeCliente || ('cli #' + (p.codigoCliente || '?'))).slice(0, 60),
        etapa: p.etapaNome || p.etapa || '',
        nItens: p.itens ? p.itens.length : '',
        valor: fmtBRL(p.valorTotal),
      }));

      if (agrupado) {
        const grupos: Record<string, typeof linhas> = {};
        linhas.forEach((l) => { (grupos[l.criadoPor] = grupos[l.criadoPor] || []).push(l); });
        const nomes = Object.keys(grupos).sort();
        nomes.forEach((nome, gi) => {
          if (gi > 0) doc.moveDown(0.4);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Criado por: ' + nome + '   (' + grupos[nome].length + ' pedido' + (grupos[nome].length === 1 ? '' : 's') + ')');
          doc.fillColor('#000');
          desenharCabec();
          grupos[nome].sort((a, b) => {
            function dt(s: string) { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; }
            return dt(a.dataInclusao) - dt(b.dataInclusao);
          });
          grupos[nome].forEach((l, i) => {
            if (doc.y > yBottom) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 }); desenharCabec(); }
            desenharLinha(l, i % 2 === 1);
          });
        });
      } else {
        desenharCabec();
        linhas.forEach((l, i) => {
          if (doc.y > yBottom) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 }); desenharCabec(); }
          desenharLinha(l, i % 2 === 1);
        });
      }

      // Rodape
      doc.moveDown(0.6);
      doc.fontSize(8).fillColor('#888').text(
        (linhas.length) + ' pedido(s)' + (diasMin != null ? ' aberto(s) ha mais de ' + diasMin + ' dia(s)' : '') + '. Relatorio gerado pelo Ajustes Omie.',
      );

      doc.end();
    } catch (e) { reject(e); }
  });
}
