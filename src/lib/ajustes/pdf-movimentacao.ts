/* eslint-disable @typescript-eslint/no-explicit-any */
// PDF tabular da movimentação de estoque de um produto (kardex): pdfkit, A4
// landscape, retorna Buffer. Diferente do pdf-pedidos, aqui o y é controlado
// MANUALMENTE (doc.y do pdfkit avança sozinho após cada text() e causa
// sobreposição quando o texto quebra linha) e as células são truncadas para
// caber em uma linha.
/* eslint-disable @typescript-eslint/no-require-imports */
// Com import ESM no arquivo, o require pode devolver o namespace ({default}).
const pdfkitMod = require('pdfkit');
const PDFDocument = pdfkitMod.default || pdfkitMod;

import type { MovimentacaoPayload, MovimentoProduto } from './movimentacao';

function fmtBRL(n: any): string {
  if (n == null || isNaN(n)) return '';
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtQtd(n: any): string {
  if (n == null || isNaN(n)) return '';
  return String(Number(n));
}
// Trunca medindo a largura REAL no font corrente (lineBreak:false do pdfkit
// não impede a quebra por largura — só medindo garante 1 linha por célula).
function fitText(doc: any, s: string, w: number): string {
  if (!s) return '';
  if (doc.widthOfString(s) <= w) return s;
  let t = s;
  while (t.length > 1 && doc.widthOfString(t + '…') > w) t = t.slice(0, -1);
  return t + '…';
}
// "Operação nº 000000000006428" -> "Operação nº 6428" (tira zeros à esquerda)
function limpaOperacao(s: string): string {
  return s.replace(/(\d{5,})/g, (d) => String(Number(d) || d));
}

interface Col { label: string; w: number; alignR?: boolean; fmt: (m: MovimentoProduto) => string }

const ROW_H = 13;
const HEADER_H = 15;
const PAGE_BOTTOM = 545; // A4 landscape (~595 de altura útil) com margem

export function gerarPDFMovimentacao(payload: MovimentacaoPayload, incluirCancelados = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const prod = payload.produto || ({} as any);
      const resumo = payload.resumo;
      const xStart = 30;

      const cols: Col[] = [
        { label: 'Data', w: 52, fmt: (m) => m.data || '' },
        { label: 'Origem', w: 118, fmt: (m) => (m.origem || m.codOrigem || '') + (m.devolucao ? ' (devol.)' : '') + (m.cancelado ? ' (CANCELADO)' : '') },
        { label: 'Cliente / Fornecedor', w: 160, fmt: (m) => m.clienteFornecedor || '' },
        { label: 'NF', w: 55, fmt: (m) => m.numDoc || '' },
        { label: 'Operação', w: 110, fmt: (m) => limpaOperacao(m.operacao || '') },
        { label: 'Entrada', w: 42, alignR: true, fmt: (m) => (m.qtdeEntrada ? '+' + fmtQtd(Math.abs(m.qtdeEntrada)) : '') },
        { label: 'Saída', w: 42, alignR: true, fmt: (m) => (m.qtdeSaida ? '-' + fmtQtd(Math.abs(m.qtdeSaida)) : '') },
        { label: 'Saldo', w: 42, alignR: true, fmt: (m) => (m.cancelado ? '' : (fmtQtd(m.qtdeAtual) || '0')) },
        { label: 'CMC unit.', w: 58, alignR: true, fmt: (m) => (m.entradaCMC ? fmtBRL(m.entradaCMC) : '') },
        { label: 'Vlr venda un.', w: 60, alignR: true, fmt: (m) => (m.valorVendaUnit ? fmtBRL(m.valorVendaUnit) : '') },
        { label: 'Vlr venda tot.', w: 62, alignR: true, fmt: (m) => (m.valorVendaTotal ? fmtBRL(m.valorVendaTotal) : '') },
      ];
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      const cell = { lineBreak: false as const };

      let y = 30;

      // ---- cabeçalho do documento ----
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
        .text(`Movimentação de produto — ${prod.codigo || prod.codigoProduto || ''}`, xStart, y, cell);
      y += 18;
      doc.fontSize(9).font('Helvetica').fillColor('#444').text(fitText(doc, String(prod.descricao || ''), totalW), xStart, y, cell);
      y += 13;
      doc.fontSize(9).fillColor('#666').text(`Conta ${payload.conta} · período ${payload.dataDeBR} a ${payload.dataAteBR}`, xStart, y, cell);
      y += 12;
      doc.fontSize(8).fillColor('#999').text('Gerado em ' + new Date().toLocaleString('pt-BR'), xStart, y, cell);
      y += 16;

      function cabecTabela() {
        doc.rect(xStart, y, totalW, HEADER_H).fill('#1f2937');
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff');
        let x = xStart;
        for (const c of cols) {
          doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.alignR ? 'right' : 'left', ...cell });
          x += c.w;
        }
        y += HEADER_H + 2;
        doc.fillColor('#000');
      }

      function quebraPaginaSePreciso(alturaProxima: number) {
        if (y + alturaProxima > PAGE_BOTTOM) {
          doc.addPage();
          y = 30;
          cabecTabela();
        }
      }

      function linhaSaldo(rotulo: string, qtde: number | null, custo: number | null) {
        quebraPaginaSePreciso(ROW_H + 2);
        doc.rect(xStart, y, totalW, ROW_H).fill('#e8edf4');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b');
        doc.text(rotulo, xStart + 3, y + 3, { width: totalW - 210, ...cell });
        doc.text(`${qtde != null ? qtde + ' un' : '?'} · custo unit. ${custo != null ? fmtBRL(custo) : '—'}`,
          xStart + totalW - 205, y + 3, { width: 200, align: 'right', ...cell });
        y += ROW_H + 2;
        doc.fillColor('#000');
      }

      cabecTabela();

      if (resumo) linhaSaldo(`SALDO INICIAL em ${payload.dataDeBR}`, resumo.saldoAnterior, resumo.custoInicial);

      const movs = (payload.movimentos || []).filter((m) => incluirCancelados || !m.cancelado);
      for (const m of movs) {
        quebraPaginaSePreciso(ROW_H);
        doc.fontSize(7).font('Helvetica').fillColor(m.cancelado ? '#94a3b8' : '#111');
        let x = xStart;
        for (const c of cols) {
          doc.text(fitText(doc, c.fmt(m), c.w - 6), x + 3, y + 3, { width: c.w - 6, align: c.alignR ? 'right' : 'left', ...cell });
          x += c.w;
        }
        y += ROW_H;
        doc.moveTo(xStart, y - 2).lineTo(xStart + totalW, y - 2).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      }
      doc.fillColor('#000');

      if (resumo) {
        linhaSaldo(`SALDO FINAL em ${payload.dataAteBR}`, resumo.saldoFinal, resumo.custoFinal);
        y += 8;
        quebraPaginaSePreciso(14);
        doc.fontSize(8).font('Helvetica').fillColor('#334155');
        doc.text(
          `${resumo.movimentos} movimento(s) no período · entradas +${resumo.totalEntradas} · saídas -${resumo.totalSaidas}` +
          (resumo.cancelados ? ` · ${resumo.cancelados} cancelado(s)${incluirCancelados ? '' : ' (não listados)'}` : ''),
          xStart, y, cell,
        );
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
