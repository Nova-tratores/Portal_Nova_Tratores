import { NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, PHASES } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";

const FASES_EXCLUIDAS = new Set(["Concluída", "Cancelada"]);

const CORES_FASE: Record<string, string> = {
  "Orçamento": "#3B82F6",
  "Orçamento enviado para o cliente e aguardando": "#60A5FA",
  "Execução": "#F59E0B",
  "Execução Procurando peças": "#F97316",
  "Execução aguardando peças (em transporte)": "#FB923C",
  "Executada aguardando comercial": "#C084FC",
  "Aguardando outros": "#A855F7",
  "Aguardando ordem Técnico": "#0EA5E9",
  "Executada aguardando cliente": "#A78BFA",
};

export async function GET() {
  const { data: ordens } = await supabase.from(TBL_OS).select("*").order("Id_Ordem", { ascending: false });

  const allRows = (ordens || []).map((row) => {
    const qtdHr = parseFloat(String(safeGet(row, "Qtd_HR") || 0));
    const qtdKm = parseFloat(String(safeGet(row, "Qtd_KM") || 0));
    const vTotal = parseFloat(String(safeGet(row, "Valor_Total") || 0));
    return {
      id: safeGet(row, "Id_Ordem") as string,
      data: formatarDataBR(safeGet(row, "Data") as string),
      cliente: (safeGet(row, "Os_Cliente") as string) || "",
      tecnico: (safeGet(row, "Os_Tecnico") as string) || "",
      status: (safeGet(row, "Status") as string) || "",
      projeto: (safeGet(row, "Projeto") as string) || "",
      tipo: (safeGet(row, "Tipo_Servico") as string) || "",
      horas: qtdHr,
      km: qtdKm,
      total: vTotal,
    };
  });

  // Apenas fases ativas (exclui Concluída e Cancelada)
  const rows = allRows.filter((o) => !FASES_EXCLUIDAS.has(o.status));
  const totalGeral = rows.reduce((s, o) => s + o.total, 0);

  // Agrupa por fase na ordem do PHASES
  const fasesAtivas = PHASES.filter((p) => !FASES_EXCLUIDAS.has(p));
  const agrupado: Record<string, typeof rows> = {};
  for (const fase of fasesAtivas) {
    const items = rows.filter((o) => o.status === fase);
    if (items.length > 0) agrupado[fase] = items;
  }

  // Monta HTML das tabelas por fase
  const tabelasPorFase = Object.entries(agrupado).map(([fase, items]) => {
    const cor = CORES_FASE[fase] || "#64748B";
    const subtotal = items.reduce((s, o) => s + o.total, 0);
    return `
    <div class="fase-group">
      <div class="fase-header" style="border-left: 4px solid ${cor};">
        <span class="fase-nome">${fase}</span>
        <span class="fase-count">${items.length} ordem${items.length > 1 ? "s" : ""}</span>
        <span class="fase-subtotal">R$ ${subtotal.toFixed(2)}</span>
      </div>
      <table>
        <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th>Técnico</th><th>Projeto</th><th>Tipo</th><th>HR</th><th>KM</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${items.map((r) => `<tr><td><b>${r.id}</b></td><td>${r.data}</td><td>${r.cliente}</td><td>${r.tecnico}</td><td>${r.projeto || "-"}</td><td>${r.tipo}</td><td>${r.horas}</td><td>${r.km}</td><td style="text-align:right;font-weight:600">R$ ${r.total.toFixed(2)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório - Ordens em Aberto</title>
<style>
  @page { margin: 1cm; size: A4 landscape; }
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; color: #333; margin: 20px; }
  h1 { font-size: 16pt; color: #1E293B; margin-bottom: 3px; }
  .info { font-size: 9pt; color: #666; margin-bottom: 15px; }
  .summary { display: flex; gap: 12px; margin-bottom: 20px; }
  .summary-box { flex: 1; padding: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; text-align: center; }
  .summary-box .num { font-size: 24pt; font-weight: 900; color: #1E293B; }
  .summary-box .lbl { font-size: 8pt; color: #64748B; text-transform: uppercase; font-weight: 600; }
  .summary-box.highlight { background: #EFF6FF; border-color: #BFDBFE; }
  .summary-box.highlight .num { color: #2563EB; }
  .fase-group { margin-bottom: 20px; page-break-inside: avoid; }
  .fase-header { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #F8FAFC; border-radius: 6px; margin-bottom: 6px; }
  .fase-nome { font-size: 11pt; font-weight: 800; color: #1E293B; }
  .fase-count { font-size: 9pt; color: #64748B; font-weight: 600; background: #E2E8F0; padding: 2px 8px; border-radius: 10px; }
  .fase-subtotal { margin-left: auto; font-size: 10pt; font-weight: 800; color: #1E293B; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1E293B; color: white; padding: 6px 8px; text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #F1F5F9; font-size: 9pt; }
  tr:nth-child(even) { background: #FAFBFC; }
  .total-bar { margin-top: 20px; padding: 14px 20px; background: #1E293B; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; color: white; }
  .total-bar .lbl { font-size: 10pt; font-weight: 700; }
  .total-bar .val { font-size: 20pt; font-weight: 900; }
  @media print { body { margin: 0.5cm; } .fase-group { page-break-inside: avoid; } }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>
<h1>Nova Tratores - Ordens em Aberto</h1>
<div class="info">Gerado em: ${new Date().toLocaleDateString("pt-BR")} &nbsp;|&nbsp; ${rows.length} ordens ativas</div>
<div class="summary">
  ${Object.entries(agrupado).map(([fase, items]) => {
    const cor = CORES_FASE[fase] || "#64748B";
    return `<div class="summary-box"><div class="num" style="color:${cor}">${items.length}</div><div class="lbl">${fase.length > 20 ? fase.substring(0, 18) + "..." : fase}</div></div>`;
  }).join("")}
  <div class="summary-box highlight"><div class="num">${rows.length}</div><div class="lbl">Total em Aberto</div></div>
</div>
${tabelasPorFase}
<div class="total-bar">
  <span class="lbl">VALOR TOTAL DAS ORDENS EM ABERTO</span>
  <span class="val">R$ ${totalGeral.toFixed(2)}</span>
</div>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
