/* eslint-disable @typescript-eslint/no-explicit-any */
// Relatório de Assistência Técnica (RAT) — PDF via pdfkit (Buffer).
// Dois modos:
//  - 'preenchido': textos e campos impressos com os valores do formulário
//    (anexado automaticamente ao e-mail de solicitação).
//  - 'imprimir': dados fixos preenchidos (cliente/chassi/OS/peças) e os campos
//    variáveis viram áreas pautadas em branco pra preencher à MÃO — o
//    garantista imprime, preenche, escaneia e anexa.
// Molde pdfkit: src/lib/ajustes/pdf-pedidos.ts.
/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
import fs from 'fs';
import path from 'path';

export type ModoRAT = 'preenchido' | 'imprimir';

export interface DadosRAT {
  numero: string;            // GAR-XXXX
  numeroExterno?: string | null;
  os: string;                // OS-XXXX
  cliente?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  modelo?: string | null;
  chassis?: string | null;
  montadora?: string | null;
  horimetro?: string | null;
  dataAtendimento?: string | null;
  dataFalha?: string | null;
  horas?: number | null;
  km?: number | null;
  reclamacao?: string | null;
  diagnostico?: string | null;
  acao?: string | null;
  obs?: string | null;
  tecnico?: string | null;
  garantista?: string | null;
  pecas: { cod_produto: string | null; descricao: string; quantidade: number }[];
}

const M = 40;              // margem
const LARG = 595.28 - M * 2; // largura útil A4 retrato

export function gerarRATPdf(dados: DadosRAT, modo: ModoRAT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: M });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const manual = modo === 'imprimir';

      // ── Cabeçalho ────────────────────────────────────────────────────────
      try {
        const logoPath = path.join(process.cwd(), 'public', 'Logo_Nova.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, M, M - 8, { height: 34 });
        }
      } catch { /* logo é decorativa */ }
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#111')
        .text('RELATÓRIO DE ASSISTÊNCIA TÉCNICA', M + 150, M - 4, { width: LARG - 150, align: 'right' });
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666')
        .text(
          `Garantia ${dados.numero}${dados.numeroExterno ? ` (${dados.numeroExterno})` : ''} · OS ${dados.os}${dados.montadora ? ` · ${dados.montadora}` : ''}`,
          M + 150,
          doc.y + 2,
          { width: LARG - 150, align: 'right' },
        );
      doc.moveTo(M, M + 40).lineTo(M + LARG, M + 40).lineWidth(1).strokeColor('#dc2626').stroke();
      doc.y = M + 50;
      doc.x = M;

      // ── Helpers ──────────────────────────────────────────────────────────
      const tituloSecao = (t: string) => {
        garantirEspaco(26);
        doc.moveDown(0.4);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#7f1d1d').text(t.toUpperCase(), M, doc.y);
        doc.moveTo(M, doc.y + 2).lineTo(M + LARG, doc.y + 2).lineWidth(0.5).strokeColor('#ddd').stroke();
        doc.moveDown(0.4);
        doc.fillColor('#111');
      };

      // Par label/valor em duas colunas
      const par = (
        l1: string, v1: string | null | undefined,
        l2?: string, v2?: string | null | undefined,
      ) => {
        garantirEspaco(16);
        const y = doc.y;
        const meia = LARG / 2;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text(`${l1}: `, M, y, { continued: true });
        doc.font('Helvetica').fillColor('#111').text(valorOuLinha(v1, 30), { width: meia - 10 });
        const yFim1 = doc.y;
        if (l2 !== undefined) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text(`${l2}: `, M + meia, y, { continued: true });
          doc.font('Helvetica').fillColor('#111').text(valorOuLinha(v2, 22), { width: meia - 10 });
        }
        doc.y = Math.max(yFim1, doc.y);
        doc.x = M;
        doc.moveDown(0.2);
      };

      // Valor conhecido imprime nos DOIS modos (cliente/chassi vêm automáticos);
      // vazio vira linha de preenchimento no modo manual, travessão no digital.
      const valorOuLinha = (v: string | null | undefined, tracos: number) => {
        const s = String(v || '').trim();
        if (s) return s;
        return manual ? '_'.repeat(tracos) : '—';
      };

      const garantirEspaco = (alt: number) => {
        if (doc.y + alt > 841.89 - M - 30) {
          doc.addPage({ size: 'A4', margin: M });
          doc.y = M;
          doc.x = M;
        }
      };

      // Bloco de texto: no modo preenchido imprime o texto; no manual desenha
      // linhas pautadas pra escrever à mão.
      const blocoTexto = (titulo: string, texto: string | null | undefined, linhasManual: number) => {
        tituloSecao(titulo);
        if (!manual && String(texto || '').trim()) {
          doc.fontSize(9).font('Helvetica').fillColor('#111').text(String(texto).trim(), M, doc.y, {
            width: LARG,
            lineGap: 2,
          });
          doc.moveDown(0.3);
          return;
        }
        // Pautas
        for (let i = 0; i < linhasManual; i++) {
          garantirEspaco(18);
          const y = doc.y + 12;
          doc.moveTo(M, y).lineTo(M + LARG, y).lineWidth(0.5).strokeColor('#bbb').stroke();
          doc.y = y + 2;
        }
        doc.moveDown(0.3);
      };

      // ── Dados do cliente ─────────────────────────────────────────────────
      tituloSecao('Dados do cliente');
      par('Cliente', dados.cliente, 'CNPJ/CPF', dados.cnpj);
      par('Endereço', dados.endereco, 'Cidade', dados.cidade);

      // ── Dados do equipamento ─────────────────────────────────────────────
      tituloSecao('Dados do equipamento');
      par('Modelo', dados.modelo, 'Chassi', dados.chassis);
      par('Horímetro', dados.horimetro, 'Data da falha', dados.dataFalha);
      par('Data do atendimento', dados.dataAtendimento, 'Serviço', montarServico(dados, manual));

      // ── Relato ───────────────────────────────────────────────────────────
      blocoTexto('Reclamação do cliente', dados.reclamacao, 3);
      blocoTexto('Diagnóstico técnico', dados.diagnostico, 4);
      blocoTexto('Ação corretiva', dados.acao, 4);
      blocoTexto('Observações', dados.obs, 2);

      // ── Peças aplicadas em garantia ──────────────────────────────────────
      tituloSecao('Peças solicitadas em garantia');
      const cols = [
        { label: 'Código', w: 110 },
        { label: 'Descrição', w: LARG - 110 - 50 },
        { label: 'Qtde', w: 50, alignR: true },
      ];
      garantirEspaco(20);
      let x = M;
      const yCab = doc.y;
      doc.fontSize(8).font('Helvetica-Bold');
      cols.forEach((c) => {
        doc.fillColor('#fff').rect(x, yCab, c.w, 14).fill('#7f1d1d');
        doc.fillColor('#fff').text(c.label, x + 4, yCab + 3, { width: c.w - 8, align: c.alignR ? 'right' : 'left' });
        x += c.w;
      });
      doc.y = yCab + 16;
      doc.fillColor('#111').font('Helvetica');
      if (dados.pecas.length === 0) {
        doc.fontSize(8).fillColor('#666').text('Nenhuma peça vinculada.', M, doc.y);
        doc.moveDown(0.3);
      }
      dados.pecas.forEach((p, i) => {
        garantirEspaco(16);
        const y = doc.y;
        if (i % 2 === 1) {
          doc.fillColor('#f6f6f6').rect(M, y, LARG, 13).fill();
        }
        doc.fillColor('#111').fontSize(8);
        // height é obrigatório: sem ele o pdfkit ignora o ellipsis e QUEBRA a
        // linha, sobrepondo a zebra da linha seguinte em descrições longas
        doc.text(p.cod_produto || '—', M + 4, y + 3, { width: cols[0].w - 8, height: 10, ellipsis: true });
        doc.text(p.descricao, M + cols[0].w + 4, y + 3, { width: cols[1].w - 8, height: 10, ellipsis: true });
        doc.text(String(p.quantidade), M + cols[0].w + cols[1].w + 4, y + 3, { width: cols[2].w - 8, height: 10, align: 'right' });
        doc.y = y + 13;
      });

      // ── Assinaturas ──────────────────────────────────────────────────────
      garantirEspaco(80);
      doc.moveDown(1.6);
      const yAss = doc.y + 24;
      const colAss = (LARG - 30) / 2;
      doc.moveTo(M, yAss).lineTo(M + colAss, yAss).lineWidth(0.7).strokeColor('#333').stroke();
      doc.moveTo(M + colAss + 30, yAss).lineTo(M + LARG, yAss).lineWidth(0.7).strokeColor('#333').stroke();
      doc.fontSize(8).font('Helvetica').fillColor('#555');
      doc.text(`Técnico: ${manual ? '' : dados.tecnico || ''}`, M, yAss + 4, { width: colAss, align: 'center' });
      doc.text(`Garantista: ${manual ? '' : dados.garantista || ''}`, M + colAss + 30, yAss + 4, { width: colAss, align: 'center' });
      doc.y = yAss + 24;

      doc
        .fontSize(7)
        .fillColor('#999')
        .text(
          `Documento gerado pelo Portal Nova Tratores em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${manual ? ' — preencher à mão e anexar o escaneado na garantia.' : '.'}`,
          M,
          doc.y + 6,
          { width: LARG, align: 'center' },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function montarServico(d: DadosRAT, manual: boolean): string {
  if (manual) return '';
  const h = Number(d.horas) || 0;
  const km = Number(d.km) || 0;
  if (!h && !km) return '';
  return `${h}h · ${km} km`;
}
