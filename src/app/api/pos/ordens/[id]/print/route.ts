import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_ITENS, TBL_REQ_SOL, TBL_REQ_ATT, VALOR_HORA, VALOR_KM } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;

  const { data: res } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOs).limit(1);
  if (!res || !res.length) {
    return new NextResponse("<h1>Ordem não encontrada</h1>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 404,
    });
  }

  const row = res[0];
  const id = safeGet(row, "Id_Ordem") as string;
  const cliente = (safeGet(row, "Os_Cliente") as string) || "-";
  const cpf = (safeGet(row, "Cnpj_Cliente") as string) || "-";
  const endereco = (safeGet(row, "Endereco_Cliente") as string) || "-";
  const tecnico = (safeGet(row, "Os_Tecnico") as string) || "-";
  const tecnico2 = (safeGet(row, "Os_Tecnico2") as string) || "";
  const tipoServico = (safeGet(row, "Tipo_Servico") as string) || "-";
  const revisao = (safeGet(row, "Revisao") as string) || "";
  const projeto = (safeGet(row, "Projeto") as string) || "-";
  const status = (safeGet(row, "Status") as string) || "-";
  const data = formatarDataBR(safeGet(row, "Data") as string);
  const servSolicitado = (safeGet(row, "Serv_Solicitado") as string) || "-";
  const ordemOmie = (safeGet(row, "Ordem_Omie") as string) || "";
  const motivoCancel = (safeGet(row, "Motivo_Cancelamento") as string) || "";
  const previsaoExec = safeGet(row, "Previsao_Execucao") ? formatarDataBR(safeGet(row, "Previsao_Execucao") as string) : "";
  const previsaoFat = safeGet(row, "Previsao_Faturamento") ? formatarDataBR(safeGet(row, "Previsao_Faturamento") as string) : "";

  const qtdHoras = parseFloat(String(safeGet(row, "Qtd_HR") || 0));
  const qtdKm = parseFloat(String(safeGet(row, "Qtd_KM") || 0));
  const desconto = parseFloat(String(safeGet(row, "Desconto") || 0));
  const descontoHora = parseFloat(String(safeGet(row, "Desconto_Hora") || 0));
  const descontoKm = parseFloat(String(safeGet(row, "Desconto_KM") || 0));
  const valorTotal = parseFloat(String(safeGet(row, "Valor_Total") || 0));

  const vHoras = qtdHoras * VALOR_HORA;
  const vKm = qtdKm * VALOR_KM;

  // Produtos (PPV)
  const ppvId = safeGet(row, "ID_PPV") as string;
  const listaIds = String(ppvId || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  let produtosHtml = "";
  let totalPecas = 0;

  if (listaIds.length) {
    const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", listaIds);
    const resumo: Record<string, { desc: string; qtde: number; preco: number; total: number }> = {};
    (items || []).forEach((item) => {
      const cod = item.CodProduto;
      const desc = item.Descricao || cod;
      const preco = parseFloat(item.Preco || 0);
      let qtd = Math.abs(parseFloat(item.Qtde || 0));
      if (String(item.TipoMovimento || "").toLowerCase().includes("devolu")) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { desc, qtde: 0, preco, total: 0 };
      resumo[cod].qtde += qtd;
      resumo[cod].total += preco * qtd;
    });

    const prods = Object.entries(resumo).filter(([, p]) => p.qtde !== 0);
    totalPecas = prods.reduce((s, [, p]) => s + p.total, 0);

    if (prods.length > 0) {
      produtosHtml = `
        <div class="section">
          <div class="section-title">Peças / Materiais</div>
          <table>
            <thead><tr><th>Código</th><th>Descrição</th><th style="text-align:center">Qtde</th><th style="text-align:right">Unitário</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>
              ${prods.map(([cod, p]) => `<tr><td>${cod}</td><td>${p.desc}</td><td style="text-align:center">${p.qtde}</td><td style="text-align:right">R$ ${p.preco.toFixed(2)}</td><td style="text-align:right">R$ ${p.total.toFixed(2)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    }
  }

  // Requisições
  const idReqStr = safeGet(row, "Id_Req") as string;
  let reqHtml = "";
  let totalReq = 0;
  if (idReqStr) {
    const cleanIds = idReqStr.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (cleanIds.length > 0) {
      const { data: sols } = await supabase.from(TBL_REQ_SOL).select("*").in("IdReq", cleanIds);
      const { data: atts } = await supabase.from(TBL_REQ_ATT).select("*").in("ReqREF", cleanIds);

      const reqs = cleanIds.map((rid) => {
        const sol = (sols || []).find((s) => s.IdReq == rid);
        const att = (atts || []).find((a) => a.ReqREF == rid);
        const valor = att ? parseFloat(att.ReqValor || 0) : 0;
        totalReq += valor;
        return {
          id: rid,
          material: sol ? sol.Material_Serv_Solicitado : "N/A",
          atualizada: !!att,
          valor,
        };
      });

      if (reqs.length > 0) {
        reqHtml = `
          <div class="section">
            <div class="section-title">Requisições</div>
            <table>
              <thead><tr><th>ID</th><th>Material/Serviço</th><th style="text-align:center">Status</th><th style="text-align:right">Valor</th></tr></thead>
              <tbody>
                ${reqs.map((r) => `<tr><td>${r.id}</td><td>${r.material}</td><td style="text-align:center">${r.atualizada ? "Atualizada" : "Pendente"}</td><td style="text-align:right">R$ ${r.valor.toFixed(2)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      }
    }
  }

  // Status badge color
  const statusColor = status.includes("Exec") ? "#92400E" : status === "Concluída" ? "#065F46" : status === "Cancelada" ? "#991B1B" : "#1E3A5F";
  const statusBg = status.includes("Exec") ? "#FEF3C7" : status === "Concluída" ? "#D1FAE5" : status === "Cancelada" ? "#FEE2E2" : "#E8E0D0";

  const totalDescontos = desconto + descontoHora + descontoKm;

  const descontoRows = [];
  if (descontoHora > 0) descontoRows.push(`<tr class="discount"><td>Desconto Horas</td><td style="text-align:right">- R$ ${descontoHora.toFixed(2)}</td></tr>`);
  if (descontoKm > 0) descontoRows.push(`<tr class="discount"><td>Desconto KM</td><td style="text-align:right">- R$ ${descontoKm.toFixed(2)}</td></tr>`);
  if (desconto > 0) descontoRows.push(`<tr class="discount"><td>Desconto Geral</td><td style="text-align:right">- R$ ${desconto.toFixed(2)}</td></tr>`);

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>OS ${id} - ${cliente}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 10pt; color: #333; padding: 20px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1E3A5F; padding-bottom: 16px; margin-bottom: 20px; }
  .header-left h1 { font-size: 22pt; color: #1E3A5F; margin-bottom: 2px; }
  .header-left .subtitle { font-size: 10pt; color: #666; }
  .header-right { text-align: right; }
  .header-right .os-number { font-size: 28pt; font-weight: 900; color: #1E3A5F; line-height: 1; }
  .header-right .os-date { font-size: 10pt; color: #666; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 6px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .field { padding: 10px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; }
  .field .label { font-size: 8pt; color: #64748B; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 3px; }
  .field .value { font-size: 11pt; font-weight: 600; color: #1E293B; }
  .field.full { grid-column: 1 / -1; }

  .section { margin-bottom: 16px; }
  .section-title { font-size: 11pt; font-weight: 800; color: #1E3A5F; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 6px; border-bottom: 2px solid #E2E8F0; margin-bottom: 10px; }

  .description { white-space: pre-wrap; font-size: 10pt; line-height: 1.6; padding: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #1E3A5F; color: white; padding: 6px 10px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 6px 10px; border-bottom: 1px solid #E2E8F0; }
  tr:nth-child(even) { background: #FAFBFC; }

  .totals { margin-top: 16px; }
  .totals table { max-width: 380px; margin-left: auto; }
  .totals td { font-size: 10pt; padding: 6px 12px; }
  .totals tr.discount td { color: #C41E2A; }
  .totals tr.total { background: #1E3A5F; }
  .totals tr.total td { color: white; font-size: 13pt; font-weight: 900; padding: 10px 12px; }

  .cancel-reason { margin-top: 12px; padding: 12px; background: #FEE2E2; border: 1px solid #FECACA; border-radius: 6px; color: #991B1B; }
  .cancel-reason .label { font-weight: 700; margin-bottom: 4px; }

  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 8pt; color: #94A3B8; }

  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>

<div class="header">
  <div class="header-left">
    <h1>Nova Tratores</h1>
    <div class="subtitle">Ordem de Serviço — Pós-Vendas</div>
  </div>
  <div class="header-right">
    <div class="os-number">OS ${id}</div>
    <div class="os-date">${data}</div>
    <div style="margin-top:6px">
      <span class="status-badge" style="background:${statusBg};color:${statusColor}">${status}</span>
    </div>
  </div>
</div>

<div class="grid">
  <div class="field"><div class="label">Cliente</div><div class="value">${cliente}</div></div>
  <div class="field"><div class="label">CPF / CNPJ</div><div class="value">${cpf}</div></div>
  <div class="field full"><div class="label">Endereço</div><div class="value">${endereco}</div></div>
  <div class="field"><div class="label">Técnico Responsável</div><div class="value">${tecnico}${tecnico2 ? ` / ${tecnico2}` : ""}</div></div>
  <div class="field"><div class="label">Tipo de Serviço</div><div class="value">${tipoServico}${revisao ? ` — ${revisao}` : ""}</div></div>
  <div class="field"><div class="label">Projeto / Equipamento</div><div class="value">${projeto}</div></div>
  <div class="field"><div class="label">Nº Omie</div><div class="value">${ordemOmie || "-"}</div></div>
  ${previsaoExec ? `<div class="field"><div class="label">Previsão Execução</div><div class="value">${previsaoExec}</div></div>` : ""}
  ${previsaoFat ? `<div class="field"><div class="label">Previsão Faturamento</div><div class="value">${previsaoFat}</div></div>` : ""}
</div>

<div class="section">
  <div class="section-title">Serviço Solicitado</div>
  <div class="description">${servSolicitado.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
</div>

${produtosHtml}
${reqHtml}

${motivoCancel ? `<div class="cancel-reason"><div class="label">Motivo do Cancelamento:</div>${motivoCancel}</div>` : ""}

<div class="totals">
  <table>
    <tr><td>Horas (${qtdHoras}h × R$ ${VALOR_HORA.toFixed(2)})</td><td style="text-align:right">R$ ${vHoras.toFixed(2)}</td></tr>
    <tr><td>KM (${qtdKm}km × R$ ${VALOR_KM.toFixed(2)})</td><td style="text-align:right">R$ ${vKm.toFixed(2)}</td></tr>
    ${totalPecas > 0 ? `<tr><td>Peças / Materiais</td><td style="text-align:right">R$ ${totalPecas.toFixed(2)}</td></tr>` : ""}
    ${totalReq > 0 ? `<tr><td>Requisições</td><td style="text-align:right">R$ ${totalReq.toFixed(2)}</td></tr>` : ""}
    ${descontoRows.join("")}
    <tr class="total"><td>TOTAL</td><td style="text-align:right">R$ ${valorTotal.toFixed(2)}</td></tr>
  </table>
</div>

<div class="footer">
  Nova Tratores — Sistema POS &nbsp;|&nbsp; Impresso em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}
</div>

</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
