// Cron (GitHub Actions financeiro-emails.yml): 5 dias antes de cada
// vencimento, se o boleto foi ENVIADO POR E-MAIL, reenvia os mesmos
// documentos num e-mail educado de lembrete. Idempotente: 1 lembrete por
// card+vencimento (venc_ref). Parcelado: lembra cada parcela não paga.
// O lembrete sai pelo e-mail de quem fez o envio original (mesma conversa).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/cripto";
import { formatarBRL, valorTotalCard, formatarDataBR, montarParcelas } from "@/lib/financeiro/parcelas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

/* eslint-disable @typescript-eslint/no-explicit-any */

function urlsDoCard(card: any): { boletos: string[]; nfs: string[] } {
  const boletos: string[] = [];
  String(card.anexo_boleto || "").split(",").forEach((u: string) => { const t = u.trim(); if (t) boletos.push(t); });
  ["anexo_boleto_2", "anexo_boleto_3"].forEach((k) => { const t = String(card[k] || "").trim(); if (t && !boletos.includes(t)) boletos.push(t); });
  const nfs = [
    ...String(card.anexo_nf_servico || "").split(",").map((u: string) => u.trim()).filter(Boolean),
    ...String(card.anexo_nf_peca || "").split(",").map((u: string) => u.trim()).filter(Boolean),
  ];
  return { boletos, nfs };
}

// Datas de vencimento CRUAS (ISO) por parcela: 1ª = vencimento_boleto,
// demais = datas_parcelas (mesma correção de registros antigos dos kanbans).
function vencimentosISO(card: any): { n: number; iso: string }[] {
  const qtd = parseInt(card.qtd_parcelas) || 1;
  const raw = String(card.datas_parcelas || "").split(/[\s,]+/).map((s: string) => s.trim()).filter((d: string) => /^\d{4}-\d{2}-\d{2}/.test(d));
  if (raw.length > 0 && raw[0] === card.vencimento_boleto) raw.shift();
  const datas = [String(card.vencimento_boleto || "").slice(0, 10), ...raw.map((d: string) => d.slice(0, 10))];
  return Array.from({ length: qtd }, (_, i) => ({ n: i + 1, iso: datas[i] || "" })).filter((p) => p.iso);
}

function parcelaPaga(card: any, n: number): boolean {
  if (n === 1) return !!(card.comprovante_pagamento_p1 || card.comprovante_pagamento);
  return !!card[`comprovante_pagamento_p${n}`];
}

async function baixarAnexos(urls: string[]) {
  const anexos: { filename: string; content: Buffer }[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) continue;
      const limpo = url.split("?")[0];
      anexos.push({ filename: decodeURIComponent(limpo.substring(limpo.lastIndexOf("/") + 1)) || "anexo.pdf", content: buffer });
    } catch { /* pula anexo */ }
  }
  return anexos;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  // "Daqui a 5 dias" no relógio de Brasília
  const agoraBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const alvo = new Date(agoraBRT); alvo.setDate(alvo.getDate() + 5);
  const alvoISO = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
  const saudacao = agoraBRT.getHours() < 12 ? "Bom dia" : "Boa tarde";

  const { data: cards } = await supabase.from("Chamado_NF").select("*").eq("status", "aguardando_vencimento");
  const stats = { candidatos: 0, enviados: 0, semEnvioEmail: 0, jaLembrado: 0, erros: [] as string[] };

  for (const card of cards || []) {
    try {
      const vencs = vencimentosISO(card).filter((v) => v.iso === alvoISO && !parcelaPaga(card, v.n));
      if (vencs.length === 0) continue;
      stats.candidatos++;

      // Só lembra quem recebeu o boleto POR E-MAIL — pega o último envio pra
      // reaproveitar remetente, destinatários e a conversa (threading).
      const { data: envios } = await supabase.from("financeiro_emails")
        .select("de_email, destinatarios, message_id, user_id, assunto")
        .eq("chamado_id", card.id).eq("direcao", "enviado")
        .order("id", { ascending: false }).limit(1);
      const original = envios?.[0];
      if (!original?.destinatarios || !original.user_id) { stats.semEnvioEmail++; continue; }

      // Já lembrou este vencimento?
      const { data: jaTem } = await supabase.from("financeiro_emails")
        .select("id").eq("chamado_id", card.id).eq("tipo", "lembrete").eq("venc_ref", alvoISO).limit(1);
      if (jaTem && jaTem.length > 0) { stats.jaLembrado++; continue; }

      // Transporte do usuário que enviou o original
      const { data: cfg } = await supabase.from("financeiro_envio_config")
        .select("email_envio, smtp_host, smtp_port, smtp_secure, senha_enc")
        .eq("user_id", original.user_id).maybeSingle();
      if (!cfg?.email_envio || !cfg?.senha_enc) { stats.erros.push(`#${card.id}: remetente sem config de e-mail`); continue; }
      const transporter = nodemailer.createTransport({
        host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure !== false,
        auth: { user: cfg.email_envio, pass: decrypt(cfg.senha_enc) },
      });

      const nf = [card.num_nf_servico && `S ${card.num_nf_servico}`, card.num_nf_peca && `P ${card.num_nf_peca}`].filter(Boolean).join(" / ");
      const cliente = String(card.nom_cliente || "").replace(/[<>&"']/g, "");
      const qtd = parseInt(card.qtd_parcelas) || 1;

      // Bloco de valores: à vista mostra o total; parcelado mostra a(s)
      // parcela(s) que vence(m) + as restantes por vir.
      let bloco = "";
      if (qtd <= 1) {
        const total = valorTotalCard(card);
        bloco = `<p>${total != null ? `Valor: <strong>${formatarBRL(total)}</strong><br>` : ""}Vencimento: <strong>${formatarDataBR(alvoISO)}</strong></p>`;
      } else {
        const parcelas = montarParcelas(card);
        const doDia = parcelas.filter((p) => vencs.some((v) => v.n === p.n));
        const futuras = parcelas.filter((p) => !parcelaPaga(card, p.n) && !doDia.some((d) => d.n === p.n) && vencimentosISO(card).find((v) => v.n === p.n)!.iso > alvoISO);
        bloco = doDia.map((p) => `<p><strong>${p.n}ª parcela</strong> — vencimento <strong>${p.data}</strong>${p.valor ? ` — <strong>${p.valor}</strong>` : ""}</p>`).join("");
        if (futuras.length) bloco += `<p style="color:#666;font-size:13px">(parcelas seguintes: ${futuras.map((p) => `${p.n}ª — ${p.data}${p.valor ? ` — ${p.valor}` : ""}`).join(" · ")})</p>`;
      }

      const assunto = `Lembrete de vencimento${nf ? ` - NF ${nf}` : ""}${cliente ? ` - ${cliente}` : ""}`;
      const html = `
<p>${saudacao}${cliente ? `, <strong>${cliente}</strong>` : ""}.</p>
<p>Passando apenas para lembrar que o ${qtd > 1 ? "pagamento abaixo vence" : "boleto abaixo vence"} em <strong>5 dias</strong>:</p>
${bloco}
<p>Para facilitar, reenviamos em anexo o boleto e as notas fiscais.</p>
<p>Se o pagamento já foi realizado, por favor desconsidere esta mensagem — e agradecemos!</p>
<p>Qualquer dúvida estamos à disposição.</p>
<p>Nova Tratores<br>&nbsp;&nbsp;&nbsp;Financeiro / Pós-Vendas</p>`;

      const { boletos, nfs } = urlsDoCard(card);
      const attachments = await baixarAnexos([...boletos, ...nfs]);

      const info = await transporter.sendMail({
        from: `"Nova Tratores" <${cfg.email_envio}>`,
        to: original.destinatarios,
        subject: assunto,
        html,
        attachments,
        // Mesma conversa do envio original no Gmail
        ...(original.message_id ? { inReplyTo: original.message_id, references: original.message_id } : {}),
      });

      await supabase.from("financeiro_emails").insert({
        chamado_id: card.id, tipo: "lembrete", direcao: "enviado",
        de_email: cfg.email_envio, destinatarios: original.destinatarios,
        assunto, corpo: html, message_id: info.messageId || null,
        user_id: original.user_id, venc_ref: alvoISO,
        parcela_n: qtd > 1 ? vencs[0]?.n ?? null : null,
      });
      stats.enviados++;
    } catch (e) {
      stats.erros.push(`#${card.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`[lembrete-vencimento] alvo=${alvoISO}`, JSON.stringify(stats));
  return NextResponse.json({ ok: true, alvo: alvoISO, ...stats });
}

export const GET = POST;
