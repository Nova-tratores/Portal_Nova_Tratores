const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO = path.join(__dirname, '..', 'public', 'Logo_Nova.png');
const OUTPUT = path.join(__dirname, '..', 'relatorio-clientes-2026.pdf');

const BASE = 'https://app.omie.com.br/api/v1';
const KEY = process.env.OMIE_APP_KEY;
const SECRET = process.env.OMIE_APP_SECRET;

async function omieCall(endpoint, call, param) {
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: KEY, app_secret: SECRET, param: [param] })
  });
  if (res.status === 429) {
    console.error('Rate limit, aguardando 60s...');
    await new Promise(r => setTimeout(r, 60000));
    return omieCall(endpoint, call, param);
  }
  return await res.json();
}

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function run() {
  // 1. Buscar todas as OS de 2026
  let allOS = [];
  let page = 1;
  while (true) {
    const data = await omieCall('/servicos/os/', 'ListarOS', {
      pagina: page,
      registros_por_pagina: 50,
      filtrar_por_data_de: '01/01/2026',
      filtrar_por_data_ate: '31/12/2026'
    });
    if (data.faultstring) { console.error('Erro OS:', data.faultstring); break; }
    const registros = data.osCadastro || [];
    allOS = allOS.concat(registros);
    console.error('Pagina ' + page + '/' + data.total_de_paginas + ' (' + allOS.length + ' OS)');
    if (page >= data.total_de_paginas) break;
    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  // 2. Agrupar por nCodCli somando faturamento
  const map = {};
  let totalGeral = 0;
  for (const os of allOS) {
    const codCli = os.Cabecalho.nCodCli;
    const valor = parseFloat(os.Cabecalho.nValorTotal) || 0;
    totalGeral += valor;
    if (!map[codCli]) {
      map[codCli] = { codCli, qtd: 0, total: 0 };
    }
    map[codCli].qtd++;
    map[codCli].total += valor;
  }

  // Ordenar por faturamento (maior primeiro)
  const sorted = Object.values(map).sort((a, b) => b.total - a.total);
  const top50 = sorted.slice(0, 50);

  console.error('\nTotal OS: ' + allOS.length + ', Total faturado: ' + fmt(totalGeral));
  console.error('Buscando dados dos ' + top50.length + ' clientes...\n');

  // 3. Buscar dados dos clientes
  const clientes = [];
  for (let i = 0; i < top50.length; i++) {
    const c = top50[i];
    try {
      const cli = await omieCall('/geral/clientes/', 'ConsultarCliente', { codigo_cliente_omie: c.codCli });
      clientes.push({
        qtd: c.qtd,
        total: c.total,
        razao: cli.razao_social || cli.nome_fantasia || '',
        cnpj: cli.cnpj_cpf || '',
        endereco: (() => {
          const parts = [
            (cli.endereco || '') + (cli.endereco_numero ? ', ' + cli.endereco_numero : ''),
            cli.bairro,
            cli.cidade ? cli.cidade + (cli.estado ? ' (' + cli.estado + ')' : '') : ''
          ].filter(Boolean).join(' - ');
          // Remove estado duplicado ex: "PIRAJU (SP) (SP)" -> "PIRAJU (SP)"
          return parts.replace(/\(([A-Z]{2})\)\s*\(\1\)/g, '($1)');
        })()
      });
      console.error('  ' + (i + 1) + '/' + top50.length + ' ' + (cli.razao_social || c.codCli) + ' -> ' + fmt(c.total));
    } catch (e) {
      clientes.push({ qtd: c.qtd, total: c.total, razao: 'Cod ' + c.codCli, cnpj: '', endereco: '' });
      console.error('  ' + (i + 1) + '/' + top50.length + ' ERRO: ' + e.message);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  // ─── Gerar PDF ───
  const PRIMARY = '#18181B';
  const ACCENT = '#6366F1';
  const GRAY = '#71717A';
  const LIGHT_BG = '#F4F4F5';
  const WHITE = '#FFFFFF';
  const TABLE_HEADER_BG = '#27272A';
  const GREEN = '#059669';

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 40, bottom: 40, left: 40, right: 40 }
  });

  const stream = fs.createWriteStream(OUTPUT);
  doc.pipe(stream);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const contentW = pageW - 80;

  // ─── Header ───
  doc.image(LOGO, 40, 30, { width: 120 });

  doc.fillColor(PRIMARY)
     .fontSize(20)
     .font('Helvetica-Bold')
     .text('Relatório de Clientes - Maior Faturamento 2026', 170, 40, { width: contentW - 130 });

  doc.fillColor(GRAY)
     .fontSize(10)
     .font('Helvetica')
     .text('Top 50 clientes por faturamento no período de 01/01/2026 a 02/04/2026', 170, 65);

  doc.fillColor(ACCENT)
     .fontSize(10)
     .font('Helvetica-Bold')
     .text('Total: ' + allOS.length + ' OS  |  Faturamento geral: ' + fmt(totalGeral) + '  |  ' + sorted.length + ' clientes', 170, 80);

  doc.moveTo(40, 100).lineTo(pageW - 40, 100).strokeColor(ACCENT).lineWidth(2).stroke();

  // ─── Colunas ───
  const colX = [40, 70, 400, 530, 660];
  const colW = [30, 330, 130, 130, contentW - 620];

  function drawHeader(yPos) {
    doc.rect(40, yPos, contentW, 24).fill(TABLE_HEADER_BG);
    doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold');
    doc.text('#', colX[0] + 4, yPos + 7, { width: colW[0], align: 'center' });
    doc.text('RAZÃO SOCIAL', colX[1] + 8, yPos + 7, { width: colW[1] });
    doc.text('CPF / CNPJ', colX[2] + 8, yPos + 7, { width: colW[2] });
    doc.text('FATURAMENTO', colX[3] + 8, yPos + 7, { width: colW[3] });
    doc.text('ENDEREÇO', colX[4] + 8, yPos + 7, { width: colW[4] });
    return yPos + 24;
  }

  let y = drawHeader(112);
  const rowH = 34;

  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    const isAlt = i % 2 === 0;

    doc.font('Helvetica').fontSize(8);
    const endH = doc.heightOfString(c.endereco, { width: colW[4] - 16 });
    const razaoH = doc.heightOfString(c.razao, { width: colW[1] - 16 });
    const thisRowH = Math.max(rowH, endH + 14, razaoH + 14);

    if (y + thisRowH > pageH - 50) {
      doc.addPage();
      y = drawHeader(40);
    }

    if (isAlt) {
      doc.rect(40, y, contentW, thisRowH).fill(LIGHT_BG);
    }

    // Badge com posição
    const badgeW = 24;
    const badgeX = colX[0] + 3;
    const badgeY = y + (thisRowH - 16) / 2;
    doc.roundedRect(badgeX, badgeY, badgeW, 16, 4).fill(ACCENT);
    doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold');
    doc.text(String(i + 1), badgeX, badgeY + 4, { width: badgeW, align: 'center' });

    // Razão Social
    doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold');
    doc.text(c.razao, colX[1] + 8, y + 7, { width: colW[1] - 16 });

    // Qtd OS pequeno embaixo do nome
    doc.fillColor(GRAY).fontSize(6.5).font('Helvetica');
    const razaoBottom = y + 7 + doc.heightOfString(c.razao, { width: colW[1] - 16 });
    doc.text(c.qtd + ' OS', colX[1] + 8, razaoBottom + 1);

    // CNPJ
    doc.fillColor(GRAY).fontSize(8).font('Helvetica');
    doc.text(c.cnpj, colX[2] + 8, y + 7, { width: colW[2] - 16 });

    // Faturamento
    doc.fillColor(GREEN).fontSize(9).font('Helvetica-Bold');
    doc.text(fmt(c.total), colX[3] + 8, y + 7, { width: colW[3] - 16 });

    // Endereço
    doc.fillColor('#3F3F46').fontSize(7).font('Helvetica');
    doc.text(c.endereco, colX[4] + 8, y + 7, { width: colW[4] - 16 });

    y += thisRowH;
  }

  // Footer final
  doc.moveTo(40, y + 10).lineTo(pageW - 40, y + 10).strokeColor('#D4D4D8').lineWidth(0.5).stroke();
  doc.fillColor(GRAY).fontSize(8).font('Helvetica');
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' - Nova Tratores Máquinas Agrícolas', 40, y + 16);
  doc.text('Dados extraídos do sistema Omie', pageW - 240, y + 16);

  doc.end();

  stream.on('finish', () => {
    console.log('PDF gerado: ' + OUTPUT);
  });
}

run().catch(e => console.error(e));
