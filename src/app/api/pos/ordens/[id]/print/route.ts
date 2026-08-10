import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_ITENS, TBL_REQ_SOL, TBL_REQ_ATT, TBL_PEDIDOS } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  // view=1 → modo VISUALIZAÇÃO (usado pelo QR Code): NÃO abre impressão, NÃO
  // mostra a folha de assinatura. É a página pública/ao-vivo da OS (relê o banco
  // a cada abertura, então o mesmo QR sempre reflete o estado atual).
  const viewMode = req.nextUrl.searchParams.get("view") === "1";
  const autoPrint = req.nextUrl.searchParams.get("auto") === "1" && !viewMode;
  // pecas=0 → NÃO lista as peças no PDF da OS (o usuário escolhe na hora de imprimir).
  const comPecas = req.nextUrl.searchParams.get("pecas") !== "0";

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
  const servicoInterno = !!safeGet(row, "Servico_Interno");
  const data = formatarDataBR(safeGet(row, "Data") as string);
  const servSolicitado = (safeGet(row, "Serv_Solicitado") as string) || "-";
  const servRealizado = (safeGet(row, "Serv_Realizado") as string) || "";
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

  const configPrint = await getConfigPOS();
  const vHoras = qtdHoras * configPrint.valor_hora;
  const vKm = qtdKm * configPrint.valor_km;

  // Alimentação (várias). Mostra no PDF só os itens com no_pdf=true; com a data.
  const alimentacaoTecnico = !!safeGet(row, "Alimentacao_Tecnico");
  const alimentacaoValor = parseFloat(String(safeGet(row, "Alimentacao_Valor") || 0));
  const alimentacaoNoPdf = !!safeGet(row, "Alimentacao_No_PDF");
  const alimentacoesArr = Array.isArray(safeGet(row, "Alimentacoes")) ? (safeGet(row, "Alimentacoes") as any[]) : [];
  const fmtDataAlim = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  let alimentacaoRows = "";
  if (alimentacoesArr.length > 0) {
    alimentacaoRows = alimentacoesArr
      .filter((a) => a?.no_pdf && (parseFloat(a?.valor) || 0) > 0)
      .map((a) => `<tr><td>Alimentação Técnico${a.data ? ` (${fmtDataAlim(a.data)})` : ""}</td><td style="text-align:center">—</td><td style="text-align:right">R$ ${(parseFloat(a.valor) || 0).toFixed(2)}</td></tr>`)
      .join("");
  } else if (alimentacaoTecnico && alimentacaoNoPdf && alimentacaoValor > 0) {
    alimentacaoRows = `<tr><td>Alimentação Técnico</td><td style="text-align:center">—</td><td style="text-align:right">R$ ${alimentacaoValor.toFixed(2)}</td></tr>`;
  }

  // Produtos (PPV)
  const ppvId = safeGet(row, "ID_PPV") as string;
  const listaIds = String(ppvId || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  let produtosHtml = "";
  let pecasSignRows = ""; // linhas das peças na folha de assinatura (com checkbox "não usado")
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
    // Sem peças: some da lista E do total (fica um PDF só do serviço).
    totalPecas = comPecas ? prods.reduce((s, [, p]) => s + p.total, 0) : 0;

    if (prods.length > 0 && comPecas) {
      produtosHtml = `
        <div class="section">
          <div class="section-title">Peças / Materiais</div>
          <table class="cost-table">
            <thead><tr><th>Código</th><th>Descrição</th><th style="text-align:center">Qtde</th><th style="text-align:right">Unitário</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>
              ${prods.map(([cod, p]) => `<tr><td>${cod}</td><td>${p.desc}</td><td style="text-align:center">${p.qtde}</td><td style="text-align:right">R$ ${p.preco.toFixed(2)}</td><td style="text-align:right">R$ ${p.total.toFixed(2)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <hr class="sep">`;
    }
    if (comPecas && prods.length > 0) {
      pecasSignRows = prods.map(([, p]) => `<tr><td>${p.qtde}× ${p.desc}</td><td style="text-align:center"><span class="chk"></span></td><td style="text-align:right">R$ ${p.total.toFixed(2)}</td></tr>`).join("");
    }
  }

  // PPVs vinculados
  let ppvHtml = "";
  if (listaIds.length > 0) {
    const { data: ppvs } = await supabase.from(TBL_PEDIDOS).select("id_pedido, status").in("id_pedido", listaIds);
    if (ppvs && ppvs.length > 0) {
      ppvHtml = `
        <div class="section">
          <div class="section-title">PPV Vinculado</div>
          <div class="info-grid" style="grid-template-columns: repeat(${Math.min(ppvs.length, 3)}, 1fr);">
            ${ppvs.map((p) => `<div class="field">
              <div class="lbl">Nº PPV</div>
              <div class="val" style="font-weight:700">${p.id_pedido}</div>
              <div style="margin-top:3px"><span style="display:inline-block;font-size:7pt;font-weight:700;padding:2px 8px;border-radius:4px;background:${p.status === 'Fechado' ? '#D1FAE5' : p.status === 'Cancelado' ? '#FEE2E2' : '#FEF3C7'};color:${p.status === 'Fechado' ? '#065F46' : p.status === 'Cancelado' ? '#991B1B' : '#92400E'};text-transform:uppercase;letter-spacing:0.5px">${p.status || 'Sem status'}</span></div>
            </div>`).join("")}
          </div>
        </div>
        <hr class="sep">`;
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
            <table class="cost-table">
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
  const totalCalculado = (vHoras - descontoHora) + (vKm - descontoKm) + totalPecas + totalReq - desconto;

  const descontoRows = [];
  if (descontoHora > 0) descontoRows.push(`<tr class="discount"><td>Desconto Horas</td><td style="text-align:center">—</td><td style="text-align:right">- R$ ${descontoHora.toFixed(2)}</td></tr>`);
  if (descontoKm > 0) descontoRows.push(`<tr class="discount"><td>Desconto KM</td><td style="text-align:center">—</td><td style="text-align:right">- R$ ${descontoKm.toFixed(2)}</td></tr>`);
  if (desconto > 0) descontoRows.push(`<tr class="discount"><td>Desconto Geral</td><td style="text-align:center">—</td><td style="text-align:right">- R$ ${desconto.toFixed(2)}</td></tr>`);

  // Tema: ordem interna usa roxo (comprovante de conclusão), externa usa azul (OS)
  const tema = servicoInterno
    ? { cor: "#7C3AED", clara: "#C4B5FD", titulo: "Comprovante de Conclusão", sub: "Ordem Interna — Uso Interno" }
    : { cor: "#1E3A5F", clara: "#93C5FD", titulo: "Ordem de Serviço", sub: "Ordem de Serviço — Pós-Vendas" };

  // Folha de assinatura (Modelo "Limpo") — sai SEMPRE junto com a OS, numa nova página.
  const servTextoAssin = (servRealizado || servSolicitado || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const assinaturaHtml = `
  <div class="sign-page">
    <div class="header">
      <div>
        <div class="company-name">Nova Tratores</div>
        <div class="company-sub">Termo de conclusão de serviço</div>
      </div>
      <div class="doc-box">
        <div class="doc-label">Ordem de Serviço</div>
        <div class="doc-number">${id}</div>
        <div class="doc-meta">${data}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Cliente</div>
      <div class="field"><div class="val-name">${cliente.toUpperCase()}</div></div>
      <div class="info-grid" style="margin-top:4px">
        <div class="field"><div class="lbl">CPF / CNPJ</div><div class="val">${cpf}</div></div>
        <div class="field span2"><div class="lbl">Endereço</div><div class="val">${endereco}</div></div>
        <div class="field"><div class="lbl">Tipo de serviço</div><div class="val">${tipoServico}${revisao ? ` — ${revisao}` : ""}</div></div>
        <div class="field"><div class="lbl">Técnico</div><div class="val">${tecnico}${tecnico2 ? ` / ${tecnico2}` : ""}</div></div>
        <div class="field"><div class="lbl">Data</div><div class="val">${data}</div></div>
      </div>
    </div>

    <hr class="sep">

    ${servTextoAssin ? `<div class="section">
      <div class="section-title">Serviços executados</div>
      <div class="obs-box">${servTextoAssin}</div>
    </div>` : ""}

    ${pecasSignRows ? `<div class="section" style="margin-top:10px">
      <div class="section-title">Peças utilizadas</div>
      <table class="cost-table">
        <thead><tr><th>Peça</th><th style="text-align:center">Não usado</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>${pecasSignRows}</tbody>
      </table>
    </div>` : ""}

    <div class="total-row" style="margin-top:12px">
      <div><div class="total-lbl">Total da ordem</div></div>
      <div class="total-val" style="font-size:18pt">R$ ${totalCalculado.toFixed(2)}</div>
    </div>

    <div class="aviso">Importante: as peças que não forem utilizadas serão retiradas do orçamento final — o mesmo vale para as horas. Da mesma forma, caso sejam necessárias mais horas ou peças, elas serão acrescentadas ao valor final.</div>

    <div class="declar">Declaro que os serviços descritos acima foram <b>executados e conferidos</b>, e que recebi o equipamento em condições de uso. Autorizo a cobrança dos valores correspondentes.</div>

    <div class="signs">
      <div><div class="sign-line"></div><div class="sign-name">${cliente.toUpperCase()}</div><div class="sign-role">Cliente — assinatura e data</div></div>
      <div><div class="sign-line"></div><div class="sign-name">${tecnico}${tecnico2 ? ` / ${tecnico2}` : ""}</div><div class="sign-role">Técnico responsável</div></div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${servicoInterno ? "Comprovante Interno" : "OS"} ${id} - ${cliente}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
  @page { margin: 0.8cm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Montserrat', sans-serif; font-size: 9pt; color: #111; margin: 0; padding: 16px; line-height: 1.4; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2.5px solid ${tema.cor}; margin-bottom: 14px; }
  .company-name { font-size: 20pt; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 1px; }
  .company-sub { font-size: 8pt; color: #555; margin-top: 2px; line-height: 1.5; }
  .doc-box { text-align: right; }
  .doc-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: ${tema.cor}; }
  .doc-number { font-size: 28pt; font-weight: 900; color: #000; line-height: 1; }
  .doc-meta { font-size: 8pt; color: #555; margin-top: 4px; }
  .doc-status { display: inline-block; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 10px; border: 1.5px solid ${tema.cor}; color: ${tema.cor}; margin-top: 5px; }

  .section { margin-bottom: 12px; }
  .section-title { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: ${tema.cor}; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid ${tema.clara}; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 20px; }
  .info-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; }
  .field { padding: 4px 0; }
  .field.full { grid-column: 1 / -1; }
  .field.span2 { grid-column: span 2; }
  .lbl { font-size: 6.5pt; color: #999; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
  .val { font-size: 9pt; color: #111; font-weight: 500; }
  .val-name { font-size: 12pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.3px; }

  .sep { border: none; border-top: 1px dashed #ddd; margin: 8px 0; }

  .obs-box { border: 1px solid #ddd; padding: 8px 10px; font-size: 9pt; white-space: pre-wrap; font-family: 'Montserrat', sans-serif; color: #222; line-height: 1.5; }

  table.cost-table { width: 100%; border-collapse: collapse; }
  .cost-table th { text-align: left; font-size: 7pt; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 2px solid #000; }
  .cost-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; font-size: 9pt; color: #222; }
  .cost-table tr.discount td { color: #C41E2A; }

  .total-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 10px; border-top: 2.5px solid ${tema.cor}; }
  .total-sub { font-size: 8pt; color: #888; margin-bottom: 2px; }
  .total-sub span { margin-right: 12px; }
  .total-lbl { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${tema.cor}; }
  .total-val { font-size: 22pt; font-weight: 900; color: ${tema.cor}; }

  .cancel-reason { margin-top: 8px; padding: 8px 10px; background: #FEE2E2; border: 1px solid #FECACA; color: #991B1B; font-size: 9pt; }

  .footer { margin-top: 24px; text-align: center; font-size: 7pt; color: #ccc; letter-spacing: 0.5px; }

  /* Folha de assinatura (2ª página) */
  .sign-page { page-break-before: always; padding-top: 4px; }
  .chk { display: inline-block; width: 12px; height: 12px; border: 1.4px solid #333; border-radius: 2px; vertical-align: -1px; }
  .declar { font-size: 8.5pt; color: #444; line-height: 1.6; margin: 16px 0; background: #f7f7f7; border: 1px solid #eee; padding: 10px 12px; border-radius: 6px; }
  .aviso { margin-top: 14px; padding: 12px 15px; border: 1.5px solid #C41E2A; background: #FFF5F5; border-radius: 6px; color: #C41E2A; font-size: 11pt; font-weight: 600; line-height: 1.55; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 10px; }
  .sign-line { border-top: 1.4px solid #000; margin-top: 44px; padding-top: 5px; }
  .sign-name { font-size: 10pt; font-weight: 700; color: #000; }
  .sign-role { font-size: 7pt; color: #888; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 1px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; } }
</style>
${viewMode ? "" : "<script>window.onload = function() { window.print(); }</script>"}
</head><body>

  <div class="header">
    <div>
      <div class="company-name">Nova Tratores</div>
      <div class="company-sub">${tema.sub}</div>
    </div>
    <div class="doc-box">
      <div class="doc-label">${tema.titulo}</div>
      <div class="doc-number">${id}</div>
      <div class="doc-meta">${data}</div>
      <div class="doc-status">${status}</div>
    </div>
  </div>

  ${servicoInterno ? `<div style="margin:0 0 14px;padding:12px 18px;background:#F3E8FF;border:1px solid #C4B5FD;border-left:5px solid #7C3AED;border-radius:8px">
    <div style="font-size:16px;font-weight:900;color:#6D28D9;letter-spacing:0.5px">COMPROVANTE DE CONCLUSÃO — ORDEM INTERNA</div>
    <div style="font-size:12px;color:#6B21A8;margin-top:3px">Uso interno — a OS não é enviada ao Omie.${ordemOmie ? ` Remessa de peças no Omie: <b>${ordemOmie}</b>.` : " Sem peças vinculadas."}</div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="field">
      <div class="val-name">${cliente.toUpperCase()}</div>
    </div>
    <div class="info-grid">
      <div class="field">
        <div class="lbl">CPF / CNPJ</div>
        <div class="val">${cpf}</div>
      </div>
      <div class="field span2">
        <div class="lbl">Endereço</div>
        <div class="val">${endereco}</div>
      </div>
    </div>
  </div>

  <hr class="sep">

  <div class="section">
    <div class="section-title">Dados da Ordem</div>
    <div class="info-grid">
      <div class="field">
        <div class="lbl">Técnico Responsável</div>
        <div class="val">${tecnico}${tecnico2 ? ` / ${tecnico2}` : ""}</div>
      </div>
      <div class="field">
        <div class="lbl">Tipo de Serviço</div>
        <div class="val">${tipoServico}${revisao ? ` — ${revisao}` : ""}</div>
      </div>
      <div class="field">
        <div class="lbl">Projeto / Equipamento</div>
        <div class="val">${projeto}</div>
      </div>
      ${ordemOmie ? `<div class="field">
        <div class="lbl">${servicoInterno ? "Remessa de Peças (Omie)" : "Nº Omie"}</div>
        <div class="val">${ordemOmie}</div>
      </div>` : ""}
      ${previsaoExec ? `<div class="field">
        <div class="lbl">Previsão Execução</div>
        <div class="val">${previsaoExec}</div>
      </div>` : ""}
      ${previsaoFat ? `<div class="field">
        <div class="lbl">Previsão Faturamento</div>
        <div class="val">${previsaoFat}</div>
      </div>` : ""}
    </div>
  </div>

  <hr class="sep">

  <div class="section">
    <div class="section-title">Serviço Solicitado</div>
    <div class="obs-box">${servSolicitado.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>

  ${servRealizado ? `<div class="section" style="margin-top:8px">
    <div class="section-title">Descrição do Serviço Realizado</div>
    <div class="obs-box">${servRealizado.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>` : ""}

  <hr class="sep">

  ${ppvHtml}
  ${produtosHtml}
  ${reqHtml}

  ${motivoCancel ? `<div class="cancel-reason">Motivo do Cancelamento: ${motivoCancel}</div>` : ""}

  <div class="section">
    <div class="section-title">Resumo Financeiro</div>
    <table class="cost-table">
      <thead><tr><th>Descrição</th><th style="text-align:center">Quantidade</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        <tr><td>Horas trabalhadas</td><td style="text-align:center">${qtdHoras}h</td><td style="text-align:right">R$ ${vHoras.toFixed(2)}</td></tr>
        <tr><td>Deslocamento</td><td style="text-align:center">${qtdKm} km</td><td style="text-align:right">R$ ${vKm.toFixed(2)}</td></tr>
        ${totalPecas > 0 ? `<tr><td>Peças / Materiais</td><td style="text-align:center">—</td><td style="text-align:right">R$ ${totalPecas.toFixed(2)}</td></tr>` : ""}
        ${totalReq > 0 ? `<tr><td>Requisições</td><td style="text-align:center">—</td><td style="text-align:right">R$ ${totalReq.toFixed(2)}</td></tr>` : ""}
        ${alimentacaoRows}
        ${descontoRows.join("")}
      </tbody>
    </table>

    <div class="total-row">
      <div>
        ${totalDescontos > 0 ? `<div class="total-sub"><span>Descontos: - R$ ${totalDescontos.toFixed(2)}</span></div>` : ""}
        <div class="total-lbl">Total da Ordem</div>
      </div>
      <div class="total-val">R$ ${totalCalculado.toFixed(2)}</div>
    </div>
  </div>

  ${viewMode ? "" : assinaturaHtml}

  <div class="footer">Documento gerado pelo Sistema POS &mdash; Nova Tratores</div>

</body></html>`;

  // ?auto=1 → abre a janela de impressão automaticamente ao carregar (usado pelo Tratorilson)
  const finalHtml = autoPrint
    ? html.replace("</body></html>", "<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>")
    : html;

  return new NextResponse(finalHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
