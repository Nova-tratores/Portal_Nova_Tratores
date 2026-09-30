// Cheque de revisão em PDF (pdfkit), A4, MESMA geometria do HTML
// (GEOMETRIA_CHEQUE em cheque.ts). Serve pra anexar no e-mail à Mahindra
// pela tela de Revisões sem depender de navegador. Fontes: Helvetica /
// Helvetica-Bold (o talão usa uma fonte própria; o HTML usa Arial Black).
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import { GEOMETRIA_CHEQUE as G, PAGINA_TALAO, assinaturaTecnicoPadrao, type DadosCheque } from './cheque';

const pdfkitMod = require('pdfkit');
const PDFDocument = pdfkitMod.default || pdfkitMod;

const MM = 72 / 25.4;
const mm = (v: number) => v * MM;
const VERMELHO = '#E8462B';

export interface OpcoesPdf {
  horas: number;
  assinaturaClienteUrl?: string | null;
  assinaturaTecnicoUrl?: string | null;
  carimbo?: boolean;
}

/** Assinatura do técnico só se o PNG existir em /public (senão null — nada de imagem quebrada). */
export function assinaturaTecnicoDisponivel(nome: string | null | undefined): string | null {
  const rel = assinaturaTecnicoPadrao(nome);
  if (!rel) return null;
  return fs.existsSync(path.join(process.cwd(), 'public', rel.replace(/^\//, ''))) ? rel : null;
}

/** Baixa uma imagem (URL http ou caminho em /public) para Buffer; null se falhar. */
async function carregarImagem(ref: string | null | undefined): Promise<Buffer | null> {
  if (!ref) return null;
  try {
    if (/^https?:\/\//i.test(ref)) {
      const r = await fetch(ref);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    }
    const p = path.join(process.cwd(), 'public', ref.replace(/^\//, ''));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch { return null; }
}

function paralelogramo(doc: any, xPe: number, yIni: number, yFim: number, w: number, ang: number, cor: string) {
  const h = yFim - yIni; const dx = Math.tan(ang * Math.PI / 180) * h;
  doc.save().fillColor(cor)
    .moveTo(mm(xPe + dx), mm(yIni)).lineTo(mm(xPe + dx + w), mm(yIni)).lineTo(mm(xPe + w), mm(yFim)).lineTo(mm(xPe), mm(yFim)).closePath().fill()
    .restore();
}

export async function pdfCheque(d: DadosCheque, o: OpcoesPdf): Promise<Buffer> {
  const [imgCliente, imgTecnico] = await Promise.all([
    carregarImagem(o.assinaturaClienteUrl),
    carregarImagem(o.assinaturaTecnicoUrl ?? assinaturaTecnicoDisponivel(d.tecnico)),
  ]);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Cheque de revisão ${o.horas}h — ${d.chassi}`, Author: 'Nova Tratores' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // borda (sem o lado de cima; o topo é a linha fina)
    const bd = G.borda;
    doc.save().opacity(0.5).strokeColor('#8a8a8a').lineWidth(mm(0.3))
      .moveTo(mm(bd.x0), mm(bd.y0)).lineTo(mm(bd.x0), mm(bd.y1)).lineTo(mm(bd.x1), mm(bd.y1)).lineTo(mm(bd.x1), mm(bd.y0)).stroke()
      .restore();
    // linha fina de cima
    doc.rect(mm(G.linhaTopo.x0), mm(G.linhaTopo.y), mm(G.linhaTopo.x1 - G.linhaTopo.x0), mm(0.3)).fill('#7f7f7f');
    // faixa do título
    const f = G.faixa;
    doc.save().fillColor(VERMELHO)
      .moveTo(mm(f.x), mm(f.y)).lineTo(mm(f.x + f.wTopo), mm(f.y)).lineTo(mm(f.x + f.wBase), mm(f.y + f.h)).lineTo(mm(f.x), mm(f.y + f.h)).closePath().fill()
      .restore();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10.5);
    doc.text('CHEQUE DE REVISÃO', mm(G.titulo.x), mm(G.titulo.y1 - 2.7), { lineBreak: false, characterSpacing: 0.4 });
    doc.text(`DAS ${o.horas} HORAS`, mm(G.titulo.x), mm(G.titulo.y2 - 2.7), { lineBreak: false, characterSpacing: 0.4 });
    // listras do topo
    const lt = G.listrasTopo;
    paralelogramo(doc, lt.xBase, lt.yIni, lt.yFim, lt.w, lt.ang, VERMELHO);
    paralelogramo(doc, lt.xBase + lt.finaCinza.off, lt.yIni, lt.finaCinza.yFim, 0.3, lt.ang, '#4a4a4a');
    paralelogramo(doc, lt.xBase + lt.finaVermelha.off, lt.yIni, lt.finaVermelha.yFim, 0.3, lt.ang, VERMELHO);
    // bloco dos campos
    const b = G.bloco;
    doc.rect(mm(b.x0), mm(b.yTopo), mm(b.x1 - b.x0), mm(b.esp)).fill('#8a8a8a');
    doc.rect(mm(b.x0), mm(b.yBase), mm(b.x1 - b.x0), mm(b.esp)).fill('#8a8a8a');
    for (const l of G.campos) {
      for (const [chave, x0, x1, rot] of l.campos) {
        doc.fillColor('#333').font('Helvetica').fontSize(5.6);
        doc.text(rot, mm(x0), mm(l.y - 2.1), { lineBreak: false });
        const wRot = doc.widthOfString(rot + ' ') / MM; // mm
        const xv = x0 + wRot + 0.6;
        // sublinhado fino
        doc.rect(mm(x0 + wRot), mm(l.y), mm(Math.max(0, x1 - x0 - wRot)), mm(0.2)).fill('#b3b3b3');
        const val = d[chave] || '';
        if (val) {
          // encolhe a fonte até caber no espaço da linha (nome comprido na coluna curta)
          const livre = mm(x1 - xv - 0.4);
          let fs = 6.2;
          doc.font('Helvetica').fontSize(fs);
          while (fs > 4.2 && doc.widthOfString(val) > livre) { fs -= 0.2; doc.fontSize(fs); }
          doc.fillColor('#111');
          doc.text(val, mm(xv), mm(l.y - 2.4 + (6.2 - fs) * 0.12), { lineBreak: false });
        }
      }
    }
    // assinaturas
    for (const a of G.assin) {
      doc.rect(mm(a.x0), mm(a.y), mm(a.x1 - a.x0), mm(0.3)).fill('#7f7f7f');
      doc.fillColor('#333').font('Helvetica').fontSize(5.6);
      doc.text(a.rot, mm(a.x0), mm(a.y + 1), { width: mm(a.x1 - a.x0), align: 'center', lineBreak: false });
      const cx = (a.x0 + a.x1) / 2;
      if (a.id === 'carimbo' && o.carimbo) {
        const w = 46, h = 7.5, x = cx - w / 2, y = a.y - 9.2;
        doc.save().translate(mm(cx), mm(y + h / 2)).rotate(-2).translate(-mm(cx), -mm(y + h / 2))
          .opacity(0.85).strokeColor('#1f4e79').lineWidth(mm(0.35)).roundedRect(mm(x), mm(y), mm(w), mm(h), mm(0.8)).stroke()
          .fillColor('#1f4e79').font('Helvetica-Bold').fontSize(5.4)
          .text('NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA', mm(x), mm(y + 1.6), { width: mm(w), align: 'center', lineBreak: false })
          .text('CNPJ 31.463.139/0001-03 · Piraju/SP', mm(x), mm(y + 4.2), { width: mm(w), align: 'center', lineBreak: false })
          .restore();
      }
      if (a.id === 'cliente' && imgCliente) {
        try { doc.image(imgCliente, mm(cx - 22.5), mm(a.y - 9.6), { fit: [mm(45), mm(8.5)], align: 'center', valign: 'bottom' }); } catch { /* imagem inválida */ }
      }
      if (a.id === 'tecnico') {
        // com a rubrica do técnico, sai SÓ a rubrica (e o CPF, se informado); sem rubrica, sai o nome
        const txt = imgTecnico
          ? (d.tecnicoCpf ? `CPF ${d.tecnicoCpf}` : '')
          : [d.tecnico, d.tecnicoCpf ? `CPF ${d.tecnicoCpf}` : ''].filter(Boolean).join(' — ');
        if (imgTecnico) {
          // ocupa o espaço entre a legenda da linha de cima (termina ~165,5) e a linha do técnico
          const h = txt ? 6.8 : 8.6;
          try { doc.image(imgTecnico, mm(cx - 25), mm(a.y - 1 - h), { fit: [mm(50), mm(h)], align: 'center', valign: 'bottom' }); } catch { /* imagem inválida */ }
        }
        if (txt) { doc.fillColor('#111').font('Helvetica').fontSize(6); doc.text(txt, mm(a.x0), mm(a.y - 3.2), { width: mm(a.x1 - a.x0), align: 'center', lineBreak: false }); }
      }
    }
    // via
    const v = G.via;
    doc.rect(mm(v.x0), mm(v.y0), mm(v.x1 - v.x0), mm(0.3)).fill('#7f7f7f');
    doc.rect(mm(v.x0), mm(v.y1), mm(v.x1 - v.x0), mm(0.3)).fill('#7f7f7f');
    doc.fillColor('#333').font('Helvetica').fontSize(5.6);
    doc.text(d.via || '2ª via Mahindra Brasil', mm(v.x0), mm(v.y0 + 1), { width: mm(v.x1 - v.x0), align: 'center', lineBreak: false });
    // listras da base + número
    const lb = G.listrasBase; const t = Math.tan(lb.ang * Math.PI / 180);
    paralelogramo(doc, lb.xBase, lb.yIni, lb.yFim, lb.w, lb.ang, VERMELHO);
    paralelogramo(doc, lb.xBase + lb.finaCinza.off + t * (lb.yFim - lb.finaCinza.yFim), lb.finaCinza.yIni, lb.finaCinza.yFim, 0.3, lb.ang, '#4a4a4a');
    paralelogramo(doc, lb.xBase + lb.finaVermelha.off + t * (lb.yFim - lb.finaVermelha.yFim), lb.finaVermelha.yIni, lb.finaVermelha.yFim, 0.3, lb.ang, VERMELHO);
    const n = G.numero;
    doc.save().fillColor(VERMELHO)
      .moveTo(mm(n.xTopo), mm(n.y)).lineTo(mm(n.x1), mm(n.y)).lineTo(mm(n.x1), mm(n.y + n.h)).lineTo(mm(n.xBase), mm(n.y + n.h)).closePath().fill()
      .restore();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(17);
    doc.text(String(PAGINA_TALAO[o.horas] ?? ''), mm(n.xBase), mm(n.y + 2.2), { width: mm(n.x1 - n.xBase - 3.6), align: 'right', lineBreak: false });

    doc.end();
  });
}
