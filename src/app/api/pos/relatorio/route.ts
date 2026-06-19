import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, PHASES } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";
import { OS_BADGE_LABEL, STATUS_COR } from "@/lib/garantias/constants";
import type { GarantiaStatus } from "@/lib/garantias/types";

const FASES_EXCLUIDAS = new Set(["Concluída", "Cancelada"]);

function extrairSolicitacao(texto: string): string {
  if (!texto) return "";
  const marcador = "Solicitação do cliente:";
  const idx = texto.indexOf(marcador);
  if (idx === -1) return texto.trim();
  const depois = texto.substring(idx + marcador.length);
  const fimMarcador = "Serviço Realizado:";
  const idxFim = depois.indexOf(fimMarcador);
  const resultado = idxFim !== -1 ? depois.substring(0, idxFim) : depois;
  return resultado.trim() || "";
}

const CORES_FASE: Record<string, string> = {
  "Orçamento": "#3B82F6",
  "Orçamento enviado para o cliente e aguardando": "#60A5FA",
  "Execução": "#F59E0B",
  "Execução (Realizando Diagnóstico)": "#F97316",
  "Execução aguardando peças (em transporte)": "#FB923C",
  "Relatório Atualizado": "#06B6D4",
  "Executada aguardando comercial": "#C084FC",
  "Aguardando outros": "#A855F7",
  "Aguardando ordem Técnico": "#0EA5E9",
  "Relatório Concluído": "#A78BFA",
};

// Fases consideradas "atrasadas" por natureza (ordem parada esperando algo)
const FASES_ATRASO = new Set([
  "Execução (Realizando Diagnóstico)",
  "Execução aguardando peças (em transporte)",
  "Executada aguardando comercial",
  "Aguardando outros",
  "Aguardando ordem Técnico",
  "Relatório Concluído",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filtroTecnico = searchParams.get("tecnico") || "todos";
  const filtroTipo = searchParams.get("tipo") || "todas"; // "todas" | "atrasadas"

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
      descricaoServico: extrairSolicitacao((safeGet(row, "Serv_Solicitado") as string) || ""),
      ppv: (safeGet(row, "ID_PPV") as string) || "",
      horas: qtdHr,
      km: qtdKm,
      total: vTotal,
      previsaoExec: (safeGet(row, "Previsao_Execucao") as string) || "",
      previsaoFat: (safeGet(row, "Previsao_Faturamento") as string) || "",
    };
  });

  // Filtrar fases ativas
  let rows = allRows.filter((o) => !FASES_EXCLUIDAS.has(o.status));

  // Filtro por técnico
  if (filtroTecnico !== "todos") {
    rows = rows.filter((o) => o.tecnico === filtroTecnico);
  }

  // Filtro por tipo: atrasadas = fases de espera OU com previsão vencida
  if (filtroTipo === "atrasadas") {
    const hoje = new Date().toISOString().split("T")[0];
    rows = rows.filter((o) => {
      if (FASES_ATRASO.has(o.status)) return true;
      if (o.previsaoExec && o.previsaoExec < hoje) return true;
      if (o.previsaoFat && o.previsaoFat < hoje) return true;
      return false;
    });
  }

  // Garantias por OS — mostra um escudo na coluna OS. Guarda a garantia mais
  // recente de cada OS (status atual). A cor/label vêm do mapa OS_BADGE_LABEL.
  const garPorOS: Record<string, { label: string; cor: string; numero: string }> = {};
  const osIds = rows.map((o) => o.id).filter(Boolean);
  if (osIds.length > 0) {
    const { data: gars } = await supabase
      .from("garantias")
      .select("id_ordem, status, numero, created_at")
      .in("id_ordem", osIds)
      .order("created_at", { ascending: false });
    for (const g of (gars || []) as Array<{ id_ordem: string; status: GarantiaStatus; numero: string }>) {
      const os = String(g.id_ordem);
      if (garPorOS[os]) continue; // já guardada a mais recente (ordenado desc)
      garPorOS[os] = {
        label: OS_BADGE_LABEL[g.status] || "Garantia",
        cor: STATUS_COR[g.status] || "#64748B",
        numero: g.numero,
      };
    }
  }
  const totalEmGarantia = rows.filter((o) => garPorOS[o.id]).length;

  const totalGeral = rows.reduce((s, o) => s + o.total, 0);

  // Subtítulo do filtro
  const subtitulos: string[] = [];
  if (filtroTecnico !== "todos") subtitulos.push(`Técnico: ${filtroTecnico}`);
  if (filtroTipo === "atrasadas") subtitulos.push("Apenas ordens atrasadas");
  const subtituloTexto = subtitulos.length > 0 ? ` &nbsp;|&nbsp; ${subtitulos.join(" &nbsp;|&nbsp; ")}` : "";

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
        <thead><tr><th>OS</th><th>Data</th><th>Cliente</th><th>Técnico</th><th>Projeto</th><th>Tipo</th><th>Descrição do Serviço</th><th>PPV</th><th>HR</th><th>KM</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${items.map((r) => {
            const gar = garPorOS[r.id];
            const garBadge = gar
              ? `<span class="gar-badge" style="background:${gar.cor}1a;color:${gar.cor};border:1px solid ${gar.cor}66" title="${gar.numero} — ${gar.label}">🛡️</span>`
              : "";
            return `<tr><td><b>${r.id}</b>${garBadge}</td><td>${r.data}</td><td>${r.cliente}</td><td>${r.tecnico}</td><td>${r.projeto || "-"}</td><td>${r.tipo}</td><td class="desc-col">${r.descricaoServico || "-"}</td><td>${r.ppv || "-"}</td><td>${r.horas}</td><td>${r.km}</td><td style="text-align:right;font-weight:600">R$ ${r.total.toFixed(2)}</td></tr>`;
          }).join("")}
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
  .desc-col { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gar-badge { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 8px; font-size: 8pt; line-height: 1.5; vertical-align: middle; font-weight: 700; }
  .summary-box.gar-box { background: #EEF2FF; border-color: #C7D2FE; }
  .summary-box.gar-box .num { color: #6366F1; }
  .total-bar { margin-top: 20px; padding: 14px 20px; background: #1E293B; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; color: white; }
  .total-bar .lbl { font-size: 10pt; font-weight: 700; }
  .total-bar .val { font-size: 20pt; font-weight: 900; }
  @media print { body { margin: 0.5cm; } .fase-group { page-break-inside: avoid; } }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>
<h1>Nova Tratores - Ordens em Aberto</h1>
<div class="info">Gerado em: ${new Date().toLocaleDateString("pt-BR")} &nbsp;|&nbsp; ${rows.length} ordens${totalEmGarantia > 0 ? ` &nbsp;|&nbsp; 🛡️ ${totalEmGarantia} em garantia` : ""}${subtituloTexto}</div>
<div class="summary">
  ${Object.entries(agrupado).map(([fase, items]) => {
    const cor = CORES_FASE[fase] || "#64748B";
    return `<div class="summary-box"><div class="num" style="color:${cor}">${items.length}</div><div class="lbl">${fase.length > 20 ? fase.substring(0, 18) + "..." : fase}</div></div>`;
  }).join("")}
  <div class="summary-box highlight"><div class="num">${rows.length}</div><div class="lbl">Total em Aberto</div></div>
  ${totalEmGarantia > 0 ? `<div class="summary-box gar-box"><div class="num">${totalEmGarantia}</div><div class="lbl">🛡️ Em Garantia</div></div>` : ""}
</div>
${tabelasPorFase}
<div class="total-bar">
  <span class="lbl">VALOR TOTAL DAS ORDENS EM ABERTO</span>
  <span class="val">R$ ${totalGeral.toFixed(2)}</span>
</div>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
