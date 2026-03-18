import { NextRequest, NextResponse } from "next/server";
import { buscarPPVPorId, montarDadosParaImpressao, buscarDadosCliente } from "@/lib/ppv/queries";

function gerarHTML(dado: ReturnType<typeof montarDadosParaImpressao>) {
  const itensHTML = dado.itens.map((p) => `
    <tr>
      <td style="font-weight:600;">${p.codigo}</td>
      <td>${p.descricao}</td>
      <td style="text-align:center;">${p.saida}</td>
      <td style="text-align:center; color:#C41E2A; font-style:italic; font-weight:700;">${p.devStr}</td>
      <td style="text-align:center; font-weight:700;">${p.ficou}</td>
      <td style="text-align:right;">R$ ${p.unit}</td>
      <td style="text-align:right; font-weight:700;">R$ ${p.total}</td>
    </tr>
  `).join("");

  const statusLabel = dado.pedidoOmie && dado.pedidoOmie !== "-"
    ? "FECHADO" : "EM ABERTO";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PPV ${dado.id}</title>
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
  .doc-number { font-size: 28pt; font-weight: 900; color: #000; line-height: 1; }
  .doc-meta { font-size: 8pt; color: #555; margin-top: 4px; }
  .doc-status { display: inline-block; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 10px; border: 1.5px solid #C2410C; color: #C2410C; margin-top: 5px; }

  .section { margin-bottom: 14px; }
  .section-title { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #C2410C; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid #FDBA74; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 20px; }
  .info-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; }
  .field { padding: 4px 0; }
  .field.full { grid-column: 1 / -1; }
  .field.span2 { grid-column: span 2; }
  .lbl { font-size: 6.5pt; color: #999; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
  .val { font-size: 9pt; color: #111; font-weight: 500; }
  .val-name { font-size: 12pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.3px; }
  .val-bold { font-size: 9pt; color: #000; font-weight: 700; }

  .sep { border: none; border-top: 1px dashed #ddd; margin: 6px 0; }

  .obs-box { border: 1px solid #ddd; padding: 10px 12px; font-size: 9pt; white-space: pre-wrap; font-family: 'Montserrat', sans-serif; color: #222; line-height: 1.5; }

  table { width: 100%; border-collapse: collapse; }
  .cost-table th { text-align: left; font-size: 7pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 2px solid #000; }
  .cost-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; font-size: 9pt; color: #222; }

  .total-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 10px; border-top: 2.5px solid #C2410C; }
  .total-sub { font-size: 8pt; color: #888; margin-bottom: 2px; }
  .total-sub span { margin-right: 12px; }
  .total-lbl { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #C2410C; }
  .total-val { font-size: 22pt; font-weight: 900; color: #C2410C; }

  .footer { margin-top: 24px; text-align: center; font-size: 7pt; color: #ccc; letter-spacing: 0.5px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; } }
</style></head><body>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">Nova Tratores</div>
      <div class="company-sub">Máquinas Agrícolas Ltda &mdash; CNPJ: 31.463.139/0001-03</div>
    </div>
    <div class="doc-box">
      <div class="doc-label">${dado.tipo}</div>
      <div class="doc-number">${dado.id}</div>
      <div class="doc-meta">Emissão: ${dado.data}</div>
      <div class="doc-status">${statusLabel}</div>
    </div>
  </div>

  <!-- Cliente -->
  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="field">
      <div class="val-name">${(dado.cliente || "").toUpperCase()}</div>
    </div>
    <div class="info-grid">
      <div class="field">
        <div class="lbl">CPF / CNPJ</div>
        <div class="val-bold">${dado.documentoCliente || "-"}</div>
      </div>
      <div class="field span2">
        <div class="lbl">Endereço</div>
        <div class="val">${dado.enderecoCliente || "-"}</div>
      </div>
      <div class="field">
        <div class="lbl">Cidade</div>
        <div class="val">${dado.cidadeCliente || "-"}</div>
      </div>
    </div>
  </div>

  <!-- Dados do Pedido -->
  <div class="section">
    <div class="section-title">Dados do Pedido</div>
    <div class="info-grid">
      <div class="field">
        <div class="lbl">Técnico / Vendedor</div>
        <div class="val-bold">${dado.tecnico}</div>
      </div>
      <div class="field">
        <div class="lbl">Motivo da Saída</div>
        <div class="val-bold">${dado.motivo}</div>
      </div>
      <div class="field">
        <div class="lbl">Ordem de Serviço</div>
        <div class="val">${dado.os && dado.os !== "-" ? "OS #" + dado.os : "-"}</div>
      </div>
      ${dado.pedidoOmie && dado.pedidoOmie !== "-" ? `
      <div class="field">
        <div class="lbl">Pedido Omie</div>
        <div class="val-bold">${dado.pedidoOmie}</div>
      </div>` : ""}
    </div>
  </div>

  <!-- Observações -->
  ${dado.obs ? `
  <div class="section">
    <div class="section-title">Observações</div>
    <div class="obs-box">${dado.obs}</div>
  </div>` : ""}

  <!-- Itens -->
  <div class="section">
    <div class="section-title">Itens do Pedido</div>
    <table class="cost-table">
      <thead><tr>
        <th style="width:14%;">Código</th>
        <th>Descrição</th>
        <th style="width:7%; text-align:center;">Saída</th>
        <th style="width:7%; text-align:center;">Dev.</th>
        <th style="width:7%; text-align:center;">Ficou</th>
        <th style="width:14%; text-align:right;">Unitário</th>
        <th style="width:14%; text-align:right;">Total</th>
      </tr></thead>
      <tbody>${itensHTML}</tbody>
    </table>

    <!-- Total -->
    <div class="total-row">
      <div>
        ${dado.totalDev !== "0,00" ? `
        <div class="total-sub">
          <span>Devoluções: - R$ ${dado.totalDev}</span>
        </div>` : ""}
        <div class="total-lbl">Total do Pedido</div>
      </div>
      <div class="total-val">R$ ${dado.totalFinal}</div>
    </div>
  </div>

  <div class="footer">Documento gerado pelo Sistema PPV &mdash; Nova Tratores</div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  try {
    const detalhes = await buscarPPVPorId(id);
    if (!detalhes) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const dado = montarDadosParaImpressao(detalhes);
    const clienteInfo = await buscarDadosCliente(detalhes.cliente);
    dado.documentoCliente = clienteInfo.documento;
    dado.enderecoCliente = clienteInfo.endereco;
    dado.cidadeCliente = clienteInfo.cidade;
    const html = gerarHTML(dado);
    return NextResponse.json({ html });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
