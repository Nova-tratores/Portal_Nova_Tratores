// Cron (GitHub Actions financeiro-emails.yml): lê a caixa de entrada de CADA
// usuário que envia boleto (financeiro_envio_config, via IMAP com a mesma
// senha de app) e casa as RESPOSTAS dos clientes com o card certo pelo
// In-Reply-To/References dos e-mails que enviamos (financeiro_emails).
// Resposta casada → grava no histórico do card + notifica o setor.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decrypt } from "@/lib/cripto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CAP_MENSAGENS = 200;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const norm = (id?: string | null) => String(id || "").trim().replace(/^<|>$/g, "").toLowerCase();

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  // Mapa: message-id enviado → card
  const { data: enviados } = await supabase.from("financeiro_emails")
    .select("message_id, chamado_id").eq("direcao", "enviado").not("message_id", "is", null)
    .order("id", { ascending: false }).limit(3000);
  const porMsgId = new Map<string, number>();
  for (const e of enviados || []) {
    const k = norm(e.message_id);
    if (k && !porMsgId.has(k)) porMsgId.set(k, Number(e.chamado_id));
  }
  if (porMsgId.size === 0) return NextResponse.json({ ok: true, aviso: "nenhum envio registrado ainda" });

  // Janela incremental: última resposta − 2 dias (dedupe por message_id) ou 7 dias
  const { data: ultima } = await supabase.from("financeiro_emails")
    .select("criado_em").eq("direcao", "recebido")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const desde = ultima?.criado_em
    ? new Date(Math.min(new Date(ultima.criado_em).getTime(), Date.now()) - 2 * 86400000)
    : new Date(Date.now() - 7 * 86400000);

  const { data: configs } = await supabase.from("financeiro_envio_config")
    .select("user_id, email_envio, smtp_host, senha_enc");

  const stats = { caixas: 0, examinados: 0, respostas: 0, duplicadas: 0, erros: [] as string[] };
  const novasRespostas: { chamado_id: number; de: string; trecho: string }[] = [];

  for (const cfg of configs || []) {
    if (!cfg.email_envio || !cfg.senha_enc || !cfg.smtp_host) continue;
    // smtp.gmail.com → imap.gmail.com (padrão dos provedores)
    const imapHost = String(cfg.smtp_host).replace(/^smtp/i, "imap");
    let client: ImapFlow | null = null;
    try {
      client = new ImapFlow({
        host: imapHost, port: 993, secure: true,
        auth: { user: cfg.email_envio, pass: decrypt(cfg.senha_enc) },
        logger: false,
      });
      await client.connect();
      stats.caixas++;
      const lock = await client.getMailboxLock("INBOX");
      try {
        const seqs = await client.search({ since: desde });
        const lista = (Array.isArray(seqs) ? seqs : []).slice(-CAP_MENSAGENS);
        for (const seq of lista) {
          stats.examinados++;
          try {
            const msg = await client.fetchOne(String(seq), { source: true });
            if (!msg || typeof msg === "boolean" || !msg.source) continue;
            const mail = await simpleParser(msg.source);
            // Casa por In-Reply-To OU qualquer id do References
            const refs = [norm(mail.inReplyTo), ...String(mail.references || "").split(/\s+/).map(norm)].filter(Boolean);
            const chamadoId = refs.map((r) => porMsgId.get(r)).find((v) => v != null);
            if (chamadoId == null) continue;

            const msgId = norm(mail.messageId);
            if (msgId) {
              const { data: dup } = await supabase.from("financeiro_emails")
                .select("id").eq("message_id", mail.messageId).limit(1);
              if (dup && dup.length > 0) { stats.duplicadas++; continue; }
            }
            const de = mail.from?.value?.[0]?.address || "";
            // Ignora resposta do PRÓPRIO remetente (cópia da caixa de saída)
            if (de.toLowerCase() === cfg.email_envio.toLowerCase()) continue;

            const texto = String(mail.text || "").trim().slice(0, 4000);
            await supabase.from("financeiro_emails").insert({
              chamado_id: chamadoId, tipo: "resposta", direcao: "recebido",
              de_email: de, assunto: String(mail.subject || "").slice(0, 300),
              corpo: texto, message_id: mail.messageId || null,
              in_reply_to: mail.inReplyTo || null,
              criado_em: mail.date && mail.date.getTime() < Date.now() ? mail.date.toISOString() : new Date().toISOString(),
            });
            stats.respostas++;
            novasRespostas.push({ chamado_id: chamadoId, de, trecho: texto.slice(0, 120) });
          } catch { /* mensagem problemática não derruba a leitura */ }
        }
      } finally { lock.release(); }
      await client.logout();
    } catch (e) {
      stats.erros.push(`${cfg.email_envio}: ${e instanceof Error ? e.message : String(e)}`);
      try { await client?.logout(); } catch { /* já caiu */ }
    }
  }

  // Notifica o setor no sininho (uma notificação por resposta nova)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://portalnovatratores-production.up.railway.app").replace(/\/$/, "");
  for (const r of novasRespostas) {
    try {
      const { data: card } = await supabase.from("Chamado_NF").select("nom_cliente").eq("id", r.chamado_id).maybeSingle();
      await fetch(`${base}/api/financeiro/notificar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `Cliente respondeu o e-mail — ${card?.nom_cliente || `card #${r.chamado_id}`}`,
          descricao: r.trecho,
          link: `/financeiro/home-financeiro?id=${r.chamado_id}&tipo=boleto`,
        }),
      });
    } catch { /* notificação é best-effort */ }
  }

  console.log("[ler-respostas]", JSON.stringify(stats));
  return NextResponse.json({ ok: true, ...stats });
}

export const GET = POST;
