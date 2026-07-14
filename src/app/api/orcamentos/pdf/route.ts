import { NextRequest, NextResponse } from "next/server";

interface ItemOrc {
  codigo: string;
  descricao: string;
  quantidade: number;
  preco: number;
}

interface BodyOrc {
  numero?: string;
  cliente: string;
  documento?: string;
  endereco?: string;
  cidade?: string;
  observacao?: string;
  validade?: number;
  itens: ItemOrc[];
  maoObra: { valorHora: number; horas: number } | null;
  deslocamento: { valorKm: number; km: number } | null;
  userName?: string;
  dataEmissao?: string;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rich(text: string) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function gerarHTML(dados: BodyOrc) {
  const emissaoDate = dados.dataEmissao ? new Date(dados.dataEmissao) : new Date();
  const dataEmissao = emissaoDate.toLocaleDateString("pt-BR");
  const validade = dados.validade || 15;
  const dataValidade = new Date(emissaoDate.getTime() + validade * 86400000).toLocaleDateString("pt-BR");
  const numero = dados.numero || `ORC-${emissaoDate.getFullYear()}${String(emissaoDate.getMonth() + 1).padStart(2, "0")}${String(emissaoDate.getDate()).padStart(2, "0")}${String(emissaoDate.getHours()).padStart(2, "0")}${String(emissaoDate.getMinutes()).padStart(2, "0")}`;

  const totalPecas = dados.itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
  const totalMaoObra = dados.maoObra ? dados.maoObra.valorHora * dados.maoObra.horas : 0;
  const totalDeslocamento = dados.deslocamento ? dados.deslocamento.valorKm * dados.deslocamento.km : 0;
  const totalGeral = totalPecas + totalMaoObra + totalDeslocamento;

  const itensHTML = dados.itens.map((item, idx) => `
    <tr>
      <td style="text-align:center; color:#999; font-weight:700;">${idx + 1}</td>
      <td style="font-weight:600;">${item.codigo || "-"}</td>
      <td>${rich(item.descricao)}</td>
      <td style="text-align:center;">${item.quantidade}</td>
      <td style="text-align:right;">R$ ${fmt(item.preco)}</td>
      <td style="text-align:right; font-weight:700;">R$ ${fmt(item.quantidade * item.preco)}</td>
    </tr>
  `).join("");

  // Seção de serviços (mão de obra + deslocamento)
  const servicosRows: string[] = [];
  if (dados.maoObra) {
    servicosRows.push(`
      <tr>
        <td style="font-weight:600;">Mão de Obra</td>
        <td style="text-align:center;">${dados.maoObra.horas}h</td>
        <td style="text-align:right;">R$ ${fmt(dados.maoObra.valorHora)}/h</td>
        <td style="text-align:right; font-weight:700;">R$ ${fmt(totalMaoObra)}</td>
      </tr>
    `);
  }
  if (dados.deslocamento && dados.deslocamento.km > 0) {
    servicosRows.push(`
      <tr>
        <td style="font-weight:600;">Deslocamento</td>
        <td style="text-align:center;">${dados.deslocamento.km} km</td>
        <td style="text-align:right;">R$ ${fmt(dados.deslocamento.valorKm)}/km</td>
        <td style="text-align:right; font-weight:700;">R$ ${fmt(totalDeslocamento)}</td>
      </tr>
    `);
  }

  const totalServicos = totalMaoObra + totalDeslocamento;
  const servicosSection = servicosRows.length > 0 ? `
    <div class="section">
      <div class="section-title">Serviços</div>
      <table class="cost-table">
        <thead><tr>
          <th>Descrição</th>
          <th style="width:12%; text-align:center;">Quantidade</th>
          <th style="width:16%; text-align:right;">Valor Unit.</th>
          <th style="width:16%; text-align:right;">Total</th>
        </tr></thead>
        <tbody>${servicosRows.join("")}</tbody>
        ${servicosRows.length > 1 ? `<tfoot><tr>
          <td colspan="3" style="text-align:right;" class="sub-lbl">Total em Serviços</td>
          <td style="text-align:right;">R$ ${fmt(totalServicos)}</td>
        </tr></tfoot>` : ""}
      </table>
    </div>
  ` : "";

  // Resumo final: uma linha por parcela, com o mesmo destaque (antes as peças ficavam
  // numa linha cinza de 8pt, praticamente ilegível).
  const resumoLinhas: string[] = [];
  const linhaResumo = (lbl: string, val: number) =>
    `<div class="resumo-linha"><span class="resumo-lbl">${lbl}</span><span class="resumo-val">R$ ${fmt(val)}</span></div>`;
  if (dados.itens.length > 0) resumoLinhas.push(linhaResumo("Peças / Produtos", totalPecas));
  if (dados.maoObra) resumoLinhas.push(linhaResumo("Mão de Obra", totalMaoObra));
  if (dados.deslocamento && dados.deslocamento.km > 0) resumoLinhas.push(linhaResumo("Deslocamento", totalDeslocamento));

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Orçamento ${numero}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
  @page { margin: 0.8cm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Montserrat', sans-serif; font-size: 9pt; color: #111; margin: 0; padding: 16px; line-height: 1.4; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2.5px solid #C2410C; margin-bottom: 16px; }
  .company-name { font-size: 20pt; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 1px; }
  .company-sub { font-size: 8pt; color: #555; margin-top: 2px; line-height: 1.5; }
  .doc-box { text-align: right; }
  .doc-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #C2410C; }
  .doc-number { font-size: 22pt; font-weight: 900; color: #000; line-height: 1; }
  .doc-meta { font-size: 8pt; color: #555; margin-top: 4px; }

  .section { margin-bottom: 14px; }
  .section-title { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #C2410C; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid #FDBA74; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 20px; }
  .field { padding: 4px 0; }
  .field.full { grid-column: 1 / -1; }
  .lbl { font-size: 6.5pt; color: #999; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
  .val { font-size: 9pt; color: #111; font-weight: 500; }
  .val-name { font-size: 12pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.3px; }

  .obs-box { border: 1px solid #ddd; padding: 10px 12px; font-size: 9pt; font-family: 'Montserrat', sans-serif; color: #222; line-height: 1.5; }
  .obs-box strong { background: #FEF9C3; padding: 0 2px; }

  table { width: 100%; border-collapse: collapse; }
  .cost-table th { text-align: left; font-size: 7pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 2px solid #000; }
  .cost-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; font-size: 9pt; color: #222; }

  /* Subtotal no rodapé de cada tabela (Peças / Serviços) */
  .cost-table tfoot td { border-bottom: none; border-top: 2px solid #000; padding: 7px 8px;
    font-size: 9.5pt; font-weight: 800; color: #000; }
  .cost-table tfoot .sub-lbl { text-transform: uppercase; letter-spacing: 0.5px; font-size: 8pt; }

  /* Resumo final: largura TOTAL, alinhado com as tabelas (rótulo na margem esquerda,
     valor na margem direita — na mesma coluna do "Total" das tabelas). */
  .resumo { margin-top: 18px; width: 100%; }
  .resumo-linha { display: flex; justify-content: space-between; align-items: baseline;
    padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
  .resumo-lbl { font-size: 9.5pt; font-weight: 600; color: #333; }
  .resumo-val { font-size: 11pt; font-weight: 700; color: #000; }
  .total-row { display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 8px; padding: 12px 8px 0; border-top: 2.5px solid #C2410C; }
  .total-lbl { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #C2410C; }
  .total-val { font-size: 22pt; font-weight: 900; color: #C2410C; }

  .validade-box { margin-top: 20px; padding: 10px 14px; border: 1px dashed #FDBA74; font-size: 8pt; color: #92400e; }

  .footer { margin-top: 24px; text-align: center; font-size: 7pt; color: #ccc; letter-spacing: 0.5px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; } }
</style></head><body>

  <div class="header">
    <div>
      <div class="company-name">Nova Tratores</div>
      <div class="company-sub">Máquinas Agrícolas Ltda &mdash; CNPJ: 31.463.139/0001-03</div>
    </div>
    <div class="doc-box">
      <div class="doc-label">Orçamento</div>
      <div class="doc-number">${numero}</div>
      <div class="doc-meta">Emissão: ${dataEmissao}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="field">
      <div class="val-name">${(dados.cliente || "").toUpperCase()}</div>
    </div>
    ${dados.documento || dados.endereco || dados.cidade ? `
    <div class="info-grid">
      ${dados.documento ? `<div class="field"><div class="lbl">CPF / CNPJ</div><div class="val" style="font-weight:700;">${dados.documento}</div></div>` : ""}
      ${dados.endereco ? `<div class="field"><div class="lbl">Endereço</div><div class="val">${dados.endereco}</div></div>` : ""}
      ${dados.cidade ? `<div class="field"><div class="lbl">Cidade</div><div class="val">${dados.cidade}</div></div>` : ""}
    </div>` : ""}
  </div>

  ${dados.observacao ? `
  <div class="section">
    <div class="section-title">Observações</div>
    <div class="obs-box">${rich(dados.observacao!)}</div>
  </div>` : ""}

  ${servicosSection}

  ${dados.itens.length > 0 ? `
  <div class="section">
    <div class="section-title">Peças / Produtos</div>
    <table class="cost-table">
      <thead><tr>
        <th style="width:5%; text-align:center;">#</th>
        <th style="width:14%;">Código</th>
        <th>Descrição</th>
        <th style="width:8%; text-align:center;">Qtd</th>
        <th style="width:14%; text-align:right;">Unitário</th>
        <th style="width:14%; text-align:right;">Total</th>
      </tr></thead>
      <tbody>${itensHTML}</tbody>
      <tfoot><tr>
        <td colspan="5" style="text-align:right;" class="sub-lbl">Total em Peças</td>
        <td style="text-align:right;">R$ ${fmt(totalPecas)}</td>
      </tr></tfoot>
    </table>
  </div>` : ""}

  <div class="resumo">
    ${resumoLinhas.join("")}
    <div class="total-row">
      <div class="total-lbl">Total do Orçamento</div>
      <div class="total-val">R$ ${fmt(totalGeral)}</div>
    </div>
  </div>

  <div class="validade-box">
    <strong>Validade:</strong> Este orçamento é válido por ${validade} dias, até ${dataValidade}.
  </div>

  <div class="footer">Documento gerado pelo Portal Nova Tratores &mdash; Orçamento Personalizado</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body: BodyOrc = await req.json();

    if (!body.cliente?.trim()) {
      return NextResponse.json({ error: "Cliente obrigatório" }, { status: 400 });
    }

    const html = gerarHTML(body);
    return NextResponse.json({ html });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
