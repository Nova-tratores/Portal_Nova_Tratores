/* eslint-disable @typescript-eslint/no-explicit-any */
// Relatório de Entrega e Assistência Técnica (IN LOCO) — layout OFICIAL da
// IPACOL, reproduzido fielmente do formulário físico da fábrica.
// Dois modos:
//  - 'preenchido': campos preenchidos digitalmente sobre as linhas do
//    formulário (anexado automaticamente ao e-mail de solicitação).
//  - 'imprimir': dados de identificação (cliente/endereço/revenda/modelo)
//    preenchidos e o resto em linhas pontilhadas — o técnico leva a campo,
//    preenche à mão, colhe as assinaturas e o garantista anexa o escaneado.
// Se existir public/ipacol-logo.png, entra no cabeçalho; senão sai só o texto.
/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
import fs from 'fs';
import path from 'path';

export type ModoRAT = 'preenchido' | 'imprimir';

export interface DadosRAT {
  numero: string;               // GAR-XXXX (referência interna)
  numeroFormulario?: string | null; // numeração vermelha do canto (como no bloco físico; editável)
  os: string;
  dataChamado?: string | null;  // dd/mm/aa
  tipo?: 'entrega' | 'assistencia';
  cliente?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  municipio?: string | null;
  uf?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;  // chassi
  horasMaquina?: string | null;
  horasPlataforma?: string | null;
  descricao?: string | null;    // "Descrição de Entrega Técnica e/ou Assistência Técnica"
  acao?: string | null;         // "Ação Tomada pelo Técnico (Solução do Problema)"
  kmIda?: string | null;
  kmVolta?: string | null;
  horaChegada?: string | null;
  horaSaida?: string | null;
  horasTrabalhadas?: string | null;
  dataAtendimento?: string | null;
  tecnico?: string | null;
  pecas: { cod_produto: string | null; descricao: string; quantidade: number }[];
}

// Dados fixos da revenda (como no formulário preenchido pela Nova Tratores)
const REVENDA = 'Nova Tratores';
const REVENDA_FONE = '14 3351-6643';
const REVENDA_CONTATO = 'Pós-Vendas';

const M = 46;                      // margem
const LARG = 595.28 - M * 2;       // largura útil A4 retrato
const ALTURA_MAX = 841.89 - M;

export function gerarRATPdf(dados: DadosRAT, modo: ModoRAT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: M });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const manual = modo === 'imprimir';
      const v = (s?: string | null) => (manual ? '' : String(s || '').trim());
      const fixo = (s?: string | null) => String(s || '').trim(); // sai nos dois modos

      // ── Cabeçalho ──────────────────────────────────────────────────────────
      let temLogo = false;
      try {
        const logoPath = path.join(process.cwd(), 'public', 'ipacol-logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, M, M - 16, { fit: [130, 40] });
          temLogo = true;
        }
      } catch { /* logo é decorativa */ }
      if (!temLogo) {
        doc.fontSize(20).font('Helvetica-BoldOblique').fillColor('#1a7a3a').text('ipacol', M, M - 10);
        doc.fontSize(6.5).font('Helvetica').fillColor('#555').text('parceria de sol a sol', M, doc.y - 2);
      }
      // Numeração em vermelho no canto — igual ao bloco físico ('0000' por
      // padrão, intacto como no formulário original; editável na tela)
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#dc2626')
        .text(String(dados.numeroFormulario || '0000'), M, M + 2, { width: LARG, align: 'right' });

      doc.fontSize(11.5).font('Helvetica-Bold').fillColor('#111')
        .text('RELATÓRIO DE ENTREGA E ASSISTÊNCIA TÉCNICA (IN LOCO)', M, M + 34, {
          width: LARG, align: 'center', underline: true,
        });
      doc.y = M + 62;
      doc.x = M;

      // ── Helpers de desenho ─────────────────────────────────────────────────
      const F = 9;      // fonte dos campos
      const ALT = 17;   // altura de cada linha de campo

      // Escreve "Label:" e devolve o x onde a linha pontilhada começa
      const label = (txt: string, x: number, y: number) => {
        doc.fontSize(F).font('Helvetica-Bold').fillColor('#111').text(txt, x, y);
        return x + doc.widthOfString(txt) + 3;
      };

      // Linha pontilhada de xIni até xFim, com o valor escrito por cima
      const linhaCampo = (valor: string, xIni: number, xFim: number, y: number) => {
        const yLinha = y + F + 1.5;
        doc.save();
        doc.moveTo(xIni, yLinha).lineTo(xFim, yLinha).lineWidth(0.6).dash(1.5, { space: 1.5 }).strokeColor('#444').stroke();
        doc.restore();
        if (valor) {
          doc.fontSize(F).font('Helvetica').fillColor('#1d4ed8')
            .text(valor, xIni + 2, y, { width: xFim - xIni - 4, height: F + 2, ellipsis: true, lineBreak: false });
        }
      };

      // Checkbox quadrada com X opcional
      const checkbox = (x: number, y: number, marcado: boolean) => {
        doc.save();
        doc.rect(x, y, 11, 11).lineWidth(0.8).undash().strokeColor('#111').stroke();
        doc.restore();
        if (marcado && !manual) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1d4ed8').text('X', x + 2, y + 0.5, { lineBreak: false });
        }
      };

      // Bloco de linhas pontilhadas com texto corrido por cima (Descrição/Ação)
      const blocoLinhas = (titulo: string, texto: string, qtdLinhas: number) => {
        const y0 = doc.y;
        const xTexto = label(titulo + ':', M, y0);
        const passo = 15;
        const conteudo = manual ? '' : String(texto || '').trim();

        // Divide na fronteira de PALAVRA: o que cabe na 1ª linha (depois do
        // label) e o resto, que desce pras pautas de baixo. Desenhar a fatia
        // exata evita perder letra no clipping do pdfkit.
        let primeira = '';
        let resto = '';
        if (conteudo) {
          doc.fontSize(F).font('Helvetica');
          const larguraDisp = M + LARG - xTexto - 6;
          let corte = conteudo.length;
          while (corte > 0 && doc.widthOfString(conteudo.slice(0, corte)) > larguraDisp) corte--;
          if (corte < conteudo.length) {
            const ultimoEspaco = conteudo.lastIndexOf(' ', corte);
            if (ultimoEspaco > 0) corte = ultimoEspaco;
          }
          primeira = conteudo.slice(0, corte).trim();
          resto = conteudo.slice(corte).trim();
        }

        if (primeira) {
          doc.fontSize(F).font('Helvetica').fillColor('#1d4ed8')
            .text(primeira, xTexto + 2, y0, { lineBreak: false });
        }
        // pauta da 1ª linha (do fim do label até a margem)
        doc.save();
        doc.moveTo(xTexto, y0 + F + 1.5).lineTo(M + LARG, y0 + F + 1.5).lineWidth(0.6).dash(1.5, { space: 1.5 }).strokeColor('#444').stroke();
        doc.restore();

        if (resto) {
          doc.fontSize(F).font('Helvetica').fillColor('#1d4ed8')
            .text(resto, M + 2, y0 + passo, { width: LARG - 4, lineGap: passo - F - 2.5 });
        }
        const linhasUsadasPeloTexto = resto
          ? Math.ceil(doc.heightOfString(resto, { width: LARG - 4, lineGap: passo - F - 2.5 }) / passo)
          : 0;
        const totalLinhas = Math.max(qtdLinhas, linhasUsadasPeloTexto + 1);
        for (let i = 1; i < totalLinhas; i++) {
          doc.save();
          doc.moveTo(M, y0 + F + 1.5 + i * passo).lineTo(M + LARG, y0 + F + 1.5 + i * passo)
            .lineWidth(0.6).dash(1.5, { space: 1.5 }).strokeColor('#444').stroke();
          doc.restore();
        }
        doc.y = y0 + totalLinhas * passo + 6;
        doc.x = M;
      };

      // ── Linha 1: data do chamado + checkboxes ─────────────────────────────
      let y = doc.y;
      const xData = label('Data Abertura Chamado:', M, y);
      linhaCampo(v(dados.dataChamado), xData, xData + 90, y);
      const xEnt = label('Entrega Técnica:', M + 265, y);
      checkbox(xEnt + 2, y - 1, dados.tipo === 'entrega');
      const xAss = label('Assistência Técnica:', M + 385, y);
      checkbox(xAss + 2, y - 1, (dados.tipo || 'assistencia') === 'assistencia');
      doc.y = y + ALT + 4;

      // ── Identificação (dados fixos: saem nos DOIS modos) ──────────────────
      y = doc.y;
      let x1 = label('Nome do Cliente:', M, y);
      linhaCampo(fixo(dados.cliente), x1, M + 330, y);
      x1 = label('Telefone:', M + 336, y);
      linhaCampo(fixo(dados.telefone), x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Endereço:', M, y);
      linhaCampo(fixo(dados.endereco), x1, M + 300, y);
      x1 = label('Município:', M + 306, y);
      linhaCampo(fixo(dados.municipio), x1, M + 430, y);
      x1 = label('UF:', M + 436, y);
      linhaCampo(fixo(dados.uf), x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Revenda:', M, y);
      linhaCampo(REVENDA, x1, M + 190, y);
      x1 = label('Fone:', M + 196, y);
      linhaCampo(REVENDA_FONE, x1, M + 320, y);
      x1 = label('Contato:', M + 326, y);
      linhaCampo(REVENDA_CONTATO, x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Modelo do Equipamento:', M, y);
      linhaCampo(fixo(dados.modelo), x1, M + 360, y);
      x1 = label('Nº de Série:', M + 366, y);
      linhaCampo(fixo(dados.numeroSerie), x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Horas da Máquina:', M, y);
      linhaCampo(v(dados.horasMaquina), x1, M + 250, y);
      x1 = label('Horas da Plataforma:', M + 256, y);
      linhaCampo(v(dados.horasPlataforma), x1, M + LARG, y);
      doc.y = y + ALT + 2;

      // ── Descrição + Ação ──────────────────────────────────────────────────
      blocoLinhas('Descrição de Entrega Técnica e/ou Assistência Técnica', dados.descricao || '', 6);
      blocoLinhas('Ação Tomada pelo Técnico (Solução do Problema)', dados.acao || '', 5);

      // ── Tabela de peças ───────────────────────────────────────────────────
      doc.fontSize(F).font('Helvetica-Bold').fillColor('#111')
        .text('Relação de Peças Utilizadas para Assistência Técnica:', M, doc.y);
      doc.moveDown(0.3);
      const cols = [
        { label: 'Código', w: 90 },
        { label: 'Descrição', w: LARG - 90 - 70 },
        { label: 'Quantidade', w: 70 },
      ];
      const LIN_TAB = 16;
      const QTD_LINHAS_TAB = 9;
      let yT = doc.y;
      // cabeçalho
      let xT = M;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111');
      for (const c of cols) {
        doc.save();
        doc.rect(xT, yT, c.w, LIN_TAB).lineWidth(0.8).undash().strokeColor('#111').stroke();
        doc.restore();
        doc.text(c.label, xT, yT + 4, { width: c.w, align: 'center' });
        xT += c.w;
      }
      yT += LIN_TAB;
      const pecas = manual ? [] : dados.pecas.slice(0, QTD_LINHAS_TAB);
      for (let i = 0; i < QTD_LINHAS_TAB; i++) {
        xT = M;
        const p = pecas[i];
        for (let ci = 0; ci < cols.length; ci++) {
          doc.save();
          doc.rect(xT, yT, cols[ci].w, LIN_TAB).lineWidth(0.6).undash().strokeColor('#333').stroke();
          doc.restore();
          if (p) {
            const val = ci === 0 ? (p.cod_produto || '') : ci === 1 ? p.descricao : String(p.quantidade);
            doc.fontSize(8).font('Helvetica').fillColor('#1d4ed8')
              .text(val, xT + 3, yT + 4, { width: cols[ci].w - 6, height: 10, ellipsis: true, align: ci === 2 ? 'center' : 'left' });
          }
          xT += cols[ci].w;
        }
        yT += LIN_TAB;
      }
      if (!manual && dados.pecas.length > QTD_LINHAS_TAB) {
        doc.fontSize(7).fillColor('#666').text(`(+${dados.pecas.length - QTD_LINHAS_TAB} peça(s) — ver anexo da solicitação)`, M, yT + 2);
        yT += 10;
      }
      doc.y = yT + 8;
      doc.x = M;

      // ── KM / horários / datas ─────────────────────────────────────────────
      y = doc.y;
      x1 = label('KM Rodado Ida:', M, y);
      linhaCampo(v(dados.kmIda), x1, M + 240, y);
      x1 = label('KM Rodado Volta:', M + 246, y);
      linhaCampo(v(dados.kmVolta), x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Hora da Chegada:', M, y);
      linhaCampo(v(dados.horaChegada), x1, M + 240, y);
      x1 = label('Hora de Saída:', M + 246, y);
      linhaCampo(v(dados.horaSaida), x1, M + LARG, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Horas Trabalhadas:', M, y);
      linhaCampo(v(dados.horasTrabalhadas), x1, M + 240, y);
      doc.y = y + ALT;

      y = doc.y;
      x1 = label('Data Atendimento:', M, y);
      linhaCampo(v(dados.dataAtendimento), x1, M + 240, y);
      doc.y = y + ALT;

      // ── Assinaturas ───────────────────────────────────────────────────────
      y = doc.y;
      x1 = label('Nome do Técnico/Assinatura:', M, y);
      linhaCampo(v(dados.tecnico), x1, M + LARG, y);
      doc.y = y + ALT + 2;

      y = doc.y;
      x1 = label('Nome do Cliente/Assinatura:', M, y);
      // assinatura do cliente é SEMPRE à mão — só a pauta
      linhaCampo('', x1, M + LARG, y);
      doc.y = y + ALT + 8;

      // ── Garantia Sim/Não ──────────────────────────────────────────────────
      y = Math.min(doc.y, ALTURA_MAX - 30);
      x1 = label('Garantia:', M, y);
      const xSim = label('Sim:', M + 90, y);
      checkbox(xSim + 2, y - 1, true);
      const xNao = label('Não:', M + 180, y);
      checkbox(xNao + 2, y - 1, false);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
