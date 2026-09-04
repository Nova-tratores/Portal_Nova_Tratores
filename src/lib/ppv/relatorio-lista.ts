/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// RELATÓRIO DA RELAÇÃO DO PPV — lado servidor.
// Busca os pedidos, gera PDF (pdfkit) + CSV e envia por e-mail (Gmail), no mesmo
// padrão do relatório semanal da Lista do Calendário DRE
// (src/lib/dre-financeiro/cron-relatorio-lista.ts).
//
// Dois usos:
//  1) Manual — botão "Enviar por e-mail" da tela /ppv (modo Relação): manda a
//     relação EXATAMENTE como está na tela (ids na ordem da tela + filtros).
//  2) Cron — GitHub Actions chama /api/ppv/cron/relatorio-lista: PPVs em aberto.
//
// Config: tela Dev → Envios de e-mail (/dev/envios-email), chave 'ppv_relacao' na
// tabela email_envios_config (ativo + destinatários + cc/bcc). Nada no Railway.
// E-mail via GMAIL_USER/GMAIL_APP_PASSWORD (provedor único do portal).
// ============================================================================
/* eslint-disable @typescript-eslint/no-require-imports */
const pdfkitMod = require("pdfkit");
const PDFDocument = pdfkitMod.default || pdfkitMod;

import { enviarEmail, parseDestinatarios, type EnviarEmailResultado } from "@/lib/dre-financeiro/email";
import { getConfigEnvio, registrarEnvioLog } from "@/lib/email/envios-config";
import { supabaseFetch, getValorInsensivel } from "./supabase";
import { TBL_PEDIDOS } from "./constants";
import type { KanbanItem } from "./types";
import {
  COLS_RELACAO, FASES_PDF, faseDoPedido, colTextoRelacao, estaAberto, fmtBRL, gerarCSVRelacao,
  totaisRelacao, ordenarRelacao,
} from "./relacao";

// ---------------------------------------------------------------------------
// Busca (mesmas colunas do kanban + Pedido Omie / O.S. / NF)
// ---------------------------------------------------------------------------
const SELECT = "id_pedido,cliente,tecnico,Tipo_Pedido,status,valor_total,desconto_percentual,data,observacao,email_usuario,pedido_omie,Id_Os,nf_numero,Projeto";

function mapear(r: Record<string, unknown>): KanbanItem {
  return {
    id: String(getValorInsensivel(r, "id_pedido") || ""),
    cliente: String(getValorInsensivel(r, "cliente") || ""),
    tecnico: String(getValorInsensivel(r, "tecnico") || ""),
    tipo: String(getValorInsensivel(r, "Tipo_Pedido") || ""),
    status: String(getValorInsensivel(r, "status") || ""),
    valor: parseFloat(String(getValorInsensivel(r, "valor_total") || 0)) || 0,
    desconto: parseFloat(String(getValorInsensivel(r, "desconto_percentual") || 0)) || 0,
    data: String(getValorInsensivel(r, "data") || ""),
    observacao: String(getValorInsensivel(r, "observacao") || ""),
    criadoPor: String(getValorInsensivel(r, "email_usuario") || ""),
    pedidoOmie: String(getValorInsensivel(r, "pedido_omie") || ""),
    osId: String(getValorInsensivel(r, "Id_Os") || ""),
    nfNumero: String(getValorInsensivel(r, "nf_numero") || ""),
    projeto: String(getValorInsensivel(r, "Projeto") || ""),
    ultimaAcao: "",
    ultimoUsuario: "",
    ultimaData: "",
  };
}

/** Busca pedidos por id (mantém a ORDEM dos ids recebidos = ordem da tela). Lotes de 100. */
export async function buscarPedidosPorIds(ids: string[]): Promise<KanbanItem[]> {
  const limpos = Array.from(new Set(ids.map((s) => String(s || "").trim()).filter((s) => /^[A-Za-z]{2,4}-?\d{1,8}$/.test(s))));
  const porId = new Map<string, KanbanItem>();
  for (let i = 0; i < limpos.length; i += 100) {
    const lote = limpos.slice(i, i + 100);
    const lista = `(${lote.map((s) => `"${s}"`).join(",")})`;
    const rows = await supabaseFetch<Record<string, unknown>[]>(`${TBL_PEDIDOS}?select=${SELECT}&id_pedido=in.${encodeURIComponent(lista)}`);
    (rows || []).forEach((r) => { const it = mapear(r); porId.set(it.id, it); });
  }
  return limpos.map((id) => porId.get(id)).filter((x): x is KanbanItem => !!x);
}

/** Todos os pedidos (pra o cron). `soAbertos` = tudo menos Faturado/Cancelada. */
export async function buscarPedidosRelacao(opts: { soAbertos?: boolean } = {}): Promise<KanbanItem[]> {
  const rows = await supabaseFetch<Record<string, unknown>[]>(`${TBL_PEDIDOS}?select=${SELECT}&order=data.desc`);
  let lista = (rows || []).map(mapear);
  if (opts.soAbertos) lista = lista.filter(estaAberto);
  return ordenarRelacao(lista, { key: "data", dir: "desc" });
}

// ---------------------------------------------------------------------------
// PDF (pdfkit → Buffer). Mesmo visual do PDF da tela: faixa laranja, sub-header
// com filtros, legenda das fases, célula Fase com a cor do selo e linha tingida.
// ---------------------------------------------------------------------------
export interface GerarPDFRelacaoArgs {
  titulo?: string;
  subtitulo?: string;
  filtrosResumo?: string[];
  pedidos: KanbanItem[];
}

interface Col { k: string; label: string; w: number; alignR?: boolean }

const LARG: Record<string, number> = {
  id: 34, tipo: 30, cliente: 170, tecnico: 90, data: 52, valor: 66, status: 92, pedidoOmie: 50, osId: 36, nfNumero: 40, observacao: 120, criadoPor: 0,
};

export function gerarPDFRelacaoPPV({ titulo, subtitulo, filtrosResumo = [], pedidos }: GerarPDFRelacaoArgs): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const M = 24;
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: M, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const xStart = M;
      const largUtil = pageW - 2 * M;

      // Colunas: "Criado por" fica de fora do PDF (cabe no CSV); Cliente/Observação absorvem a sobra.
      const cols: Col[] = COLS_RELACAO.filter((c) => LARG[c.k] > 0).map((c) => ({ k: c.k, label: c.label, w: LARG[c.k], alignR: c.k === "valor" }));
      const somaFixa = cols.reduce((s, c) => s + c.w, 0);
      const sobra = largUtil - somaFixa;
      if (sobra > 0) {
        const cli = cols.find((c) => c.k === "cliente"); const obs = cols.find((c) => c.k === "observacao");
        if (cli) cli.w += Math.floor(sobra / 2);
        if (obs) obs.w += sobra - Math.floor(sobra / 2);
      }
      const larguraTotal = cols.reduce((s, c) => s + c.w, 0);
      const HDR_H = 16; const ROW_H = 14;
      const yBottom = pageH - M - ROW_H - 10;

      function cabecalhoPagina() {
        // Faixa laranja (cor do sistema Peças)
        doc.rect(0, 0, pageW, 40).fill("#E8730C");
        doc.fillColor("#fff").font("Helvetica-Bold").fontSize(13).text("NOVA TRATORES MAQUINAS AGRICOLAS LTDA.", M, 14, { lineBreak: false });
        doc.fontSize(9).text(titulo || "PRÉ-PEDIDOS DE VENDA — RELAÇÃO", M, 16, { width: pageW - 2 * M, align: "right", lineBreak: false });
        doc.fillColor("#666").font("Helvetica").fontSize(8.5);
        let y = 48;
        doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, M, y, { lineBreak: false });
        doc.text(`Total: ${pedidos.length} registro${pedidos.length !== 1 ? "s" : ""}`, M, y, { width: pageW - 2 * M, align: "right", lineBreak: false });
        y += 12;
        if (subtitulo) { doc.fillColor("#444").text(subtitulo, M, y, { width: largUtil }); y = doc.y + 2; }
        const filtrosTxt = filtrosResumo.length ? `Filtros da tela: ${filtrosResumo.join("  ·  ")}` : "Filtros da tela: nenhum (relação completa)";
        doc.fillColor("#666").fontSize(8).text(filtrosTxt, M, y, { width: largUtil });
        y = doc.y + 4;
        // Legenda das fases (mesmas cores da tela)
        doc.fontSize(7).fillColor("#555").text("Fases:", M, y + 2, { lineBreak: false });
        let x = M + doc.widthOfString("Fases:") + 6;
        for (const f of FASES_PDF) {
          const w = doc.widthOfString(f.label) + 8;
          if (x + w > pageW - M) break;
          doc.roundedRect(x, y, w, 11, 2).fillAndStroke(f.fillHex, f.textHex);
          doc.fillColor(f.textHex).text(f.label, x + 4, y + 2, { lineBreak: false });
          x += w + 4;
        }
        doc.y = y + 18;
        doc.fillColor("#000");
      }

      function desenharCabec() {
        const y = doc.y;
        doc.rect(xStart, y, larguraTotal, HDR_H).fill("#27272A");
        doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8);
        let x = xStart;
        cols.forEach((c) => { doc.text(c.label, x + 3, y + 4.5, { width: c.w - 6, align: c.alignR ? "right" : "left", lineBreak: false }); x += c.w; });
        doc.fillColor("#000").font("Helvetica");
        doc.y = y + HDR_H;
      }

      function desenharLinha(o: KanbanItem, alt: boolean) {
        const y = doc.y;
        const fase = faseDoPedido(o);
        const fundoLinha = fase ? fase.fillHex : alt ? "#F4F4F5" : "#FFFFFF";
        doc.rect(xStart, y, larguraTotal, ROW_H).fill(fundoLinha);
        doc.strokeColor("#E4E4E7").lineWidth(0.4).rect(xStart, y, larguraTotal, ROW_H).stroke();
        let x = xStart;
        cols.forEach((c) => {
          const v = colTextoRelacao(o, c.k as any);
          const isStatus = c.k === "status";
          doc.font(isStatus || c.k === "valor" ? "Helvetica-Bold" : "Helvetica").fontSize(7.8)
            .fillColor(isStatus && fase ? fase.textHex : c.k === "valor" ? "#C2570A" : "#111");
          doc.text(v || "", x + 3, y + 3.5, { width: c.w - 6, align: c.alignR ? "right" : "left", lineBreak: false, ellipsis: true });
          x += c.w;
        });
        doc.fillColor("#000").font("Helvetica");
        doc.y = y + ROW_H;
      }

      cabecalhoPagina();
      desenharCabec();
      pedidos.forEach((o, i) => {
        if (doc.y > yBottom) {
          doc.addPage({ size: "A4", layout: "landscape", margin: M });
          cabecalhoPagina();
          desenharCabec();
        }
        desenharLinha(o, i % 2 === 1);
      });

      // Rodapé: totais (à direita)
      const t = totaisRelacao(pedidos);
      let y = doc.y + 10;
      if (y + 40 > pageH - M) { doc.addPage({ size: "A4", layout: "landscape", margin: M }); y = M; }
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#C2570A")
        .text(`VALOR TOTAL (${t.n} pedido${t.n !== 1 ? "s" : ""}): ${fmtBRL(t.valor)}`, M, y, { width: largUtil, align: "right", lineBreak: false });
      y += 14;
      doc.font("Helvetica").fontSize(9).fillColor("#666")
        .text(`Em aberto: ${t.abertosN} · ${fmtBRL(t.abertosV)}   |   Faturados: ${t.faturadosN} · ${fmtBRL(t.faturadosV)}   |   Remessas: ${t.remN} · ${fmtBRL(t.remV)}`, M, y, { width: largUtil, align: "right", lineBreak: false });

      // "Página X de Y"
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font("Helvetica").fontSize(8).fillColor("#999")
          .text(`Pagina ${i - range.start + 1} de ${range.count}`, M, pageH - M + 6, { width: largUtil, align: "right", lineBreak: false });
      }
      doc.end();
    } catch (e) { reject(e); }
  });
}

// ---------------------------------------------------------------------------
// E-mail (PDF + CSV em anexo)
// ---------------------------------------------------------------------------
export interface EnviarRelacaoArgs {
  pedidos: KanbanItem[];
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  titulo?: string;         // faixa do PDF
  assunto?: string;
  filtrosResumo?: string[];
  mensagem?: string;       // texto livre no corpo (opcional)
  enviadoPor?: string;     // nome/e-mail de quem disparou (manual)
  origem?: "manual" | "cron";
}

export interface EnviarRelacaoResultado { email: EnviarEmailResultado; total: number; destinatarios: string[]; arquivos: string[] }

function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Chave deste envio na tela Dev → Envios de e-mail (tabela email_envios_config). */
export const CHAVE_ENVIO_PPV = "ppv_relacao";

/** Destinatários padrão — vêm do BANCO (tela Dev), não mais do Railway. Servem de padrão no modal e são os únicos do cron. */
export async function destinatariosPadrao() {
  const cfg = await getConfigEnvio(CHAVE_ENVIO_PPV);
  return {
    to: cfg.to,
    cc: cfg.cc,
    bcc: cfg.bcc,
    ativo: cfg.ativo,
    migrationFaltando: cfg.migrationFaltando,
    gmailConfigurado: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
  };
}

export async function enviarRelacaoPPVPorEmail(args: EnviarRelacaoArgs): Promise<EnviarRelacaoResultado> {
  const padrao = await destinatariosPadrao();
  const to = Array.isArray(args.to) ? args.to : args.to ? parseDestinatarios(args.to) : padrao.to;
  const cc = Array.isArray(args.cc) ? args.cc : args.cc ? parseDestinatarios(args.cc) : padrao.cc;
  const bcc = Array.isArray(args.bcc) ? args.bcc : args.bcc ? parseDestinatarios(args.bcc) : padrao.bcc;
  const pedidos = args.pedidos || [];
  const t = totaisRelacao(pedidos);
  const filtros = args.filtrosResumo || [];
  const titulo = args.titulo || "PRÉ-PEDIDOS DE VENDA — RELAÇÃO";
  const hojeISO = new Date().toISOString().slice(0, 10);
  const base = `ppv-relacao-${hojeISO}`;

  if (!to.length) {
    return { email: { ok: false, motivo: "sem_destinatario" }, total: pedidos.length, destinatarios: [], arquivos: [] };
  }

  const pdf = await gerarPDFRelacaoPPV({ titulo, filtrosResumo: filtros, pedidos, subtitulo: args.enviadoPor ? `Enviado por ${args.enviadoPor}` : undefined });
  const csv = gerarCSVRelacao(pedidos);

  const linhasPrev = pedidos.slice(0, 15).map((o) =>
    `<tr>${["id", "tipo", "cliente", "tecnico", "data", "valor", "status"].map((k) => `<td style="padding:3px 8px;border-bottom:1px solid #eee;white-space:nowrap">${esc(colTextoRelacao(o, k as any))}</td>`).join("")}</tr>`,
  ).join("");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b">` +
    `<p>Segue a <b>relação de Pré-Pedidos de Venda (PPV)</b>${args.origem === "cron" ? " — envio automático" : ""}.</p>` +
    (args.mensagem ? `<p style="white-space:pre-wrap">${esc(args.mensagem)}</p>` : "") +
    `<p>Pedidos: <b>${t.n}</b> · Total: <b>${esc(fmtBRL(t.valor))}</b><br>` +
    `Em aberto: ${t.abertosN} (${esc(fmtBRL(t.abertosV))}) · Faturados: ${t.faturadosN} (${esc(fmtBRL(t.faturadosV))}) · Remessas: ${t.remN}</p>` +
    `<p style="color:#64748b">Filtros: ${filtros.length ? esc(filtros.join(" · ")) : "nenhum (relação completa)"}</p>` +
    (pedidos.length
      ? `<table style="border-collapse:collapse;font-size:12px"><thead><tr>${["Nº", "Tipo", "Cliente", "Técnico", "Data", "Valor", "Fase"].map((h) => `<th style="text-align:left;padding:4px 8px;background:#27272a;color:#fff">${h}</th>`).join("")}</tr></thead><tbody>${linhasPrev}</tbody></table>` +
        (pedidos.length > 15 ? `<p style="color:#64748b;font-size:12px">… e mais ${pedidos.length - 15} pedido(s) no PDF/CSV em anexo.</p>` : "")
      : "<p><i>Nenhum pedido na relação.</i></p>") +
    `<p>Anexos: PDF (relação como na tela) e CSV (detalhado).</p>` +
    (args.enviadoPor ? `<p style="color:#94a3b8;font-size:12px">Enviado por ${esc(args.enviadoPor)} pelo Portal Nova Tratores.</p>` : "") +
    `</div>`;

  const email = await enviarEmail({
    to, cc, bcc,
    subject: args.assunto || `Relação de PPVs (${t.n}) — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    html,
    attachments: [
      { filename: `${base}.pdf`, content: pdf, contentType: "application/pdf" },
      { filename: `${base}.csv`, content: csv, contentType: "text/csv; charset=utf-8" },
    ],
  });
  return { email, total: pedidos.length, destinatarios: to, arquivos: [`${base}.pdf`, `${base}.csv`] };
}

export interface CronRelacaoOpts {
  /** 'cron' (GitHub Actions) | 'manual' ("Enviar agora" na tela Dev) | 'teste' (destinatário avulso). */
  origem?: "cron" | "manual" | "teste";
  /** Sobrescreve os destinatários (teste). Sem isto, usa a config da tela Dev. */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  usuario?: string;
  /** Ignora a chave "ativo" (Enviar agora / teste). */
  forcar?: boolean;
}

/** Cron/tela Dev: relação dos PPVs EM ABERTO pros destinatários configurados no banco. Grava no histórico. */
export async function cronRelacaoPPV(opts: CronRelacaoOpts = {}): Promise<any> {
  const origem = opts.origem || "cron";
  const cfg = await getConfigEnvio(CHAVE_ENVIO_PPV);
  const assunto = `PPVs em aberto — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

  if (!cfg.ativo && !opts.forcar && !opts.to?.length) {
    await registrarEnvioLog({ chave: CHAVE_ENVIO_PPV, origem, ok: false, motivo: "desativado", assunto, usuario: opts.usuario });
    return { pulado: true, motivo: "desativado", migrationFaltando: cfg.migrationFaltando };
  }

  const pedidos = await buscarPedidosRelacao({ soAbertos: true });
  const r = await enviarRelacaoPPVPorEmail({
    pedidos,
    origem: origem === "cron" ? "cron" : "manual",
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    enviadoPor: opts.usuario,
    titulo: "PRÉ-PEDIDOS DE VENDA — EM ABERTO",
    filtrosResumo: ["Só em aberto (todas as fases menos Faturado e Cancelada)", "Ordenado por Data (Z-A)"],
    assunto: `PPVs em aberto (${pedidos.length}) — ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  });
  await registrarEnvioLog({
    chave: CHAVE_ENVIO_PPV, origem, ok: r.email.ok, motivo: r.email.ok ? undefined : (r.email.erro || r.email.motivo),
    assunto, destinatarios: r.destinatarios, total: r.total, usuario: opts.usuario,
    detalhes: { arquivos: r.arquivos, messageId: r.email.messageId },
  });
  return r;
}
