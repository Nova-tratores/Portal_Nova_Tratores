// Caixa de e-mail DO USUÁRIO logado (IMAP com o e-mail/senha de app que ele
// configurou em financeiro_envio_config). Cada um vê SÓ a própria caixa.
//   GET            → últimos 30 e-mails da INBOX (respostas a envios nossos
//                    vêm marcadas com ehResposta + o card ligado)
//   GET ?uid=N     → corpo completo de um e-mail
//   GET ?badge=1   → contagem (via banco, leve) de respostas não lidas aos
//                    envios DESTE usuário — badge do header sem abrir IMAP
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { autenticar } from "@/lib/auth/server";
import { decrypt } from "@/lib/cripto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const norm = (id?: string | null) => String(id || "").trim().replace(/^<|>$/g, "").toLowerCase();

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: cfg } = await supabase.from("financeiro_envio_config")
    .select("email_envio, smtp_host, senha_enc")
    .eq("user_id", auth.userId).maybeSingle();
  if (!cfg?.email_envio || !cfg?.senha_enc || !cfg?.smtp_host) {
    return NextResponse.json({ semConfig: true });
  }

  // ── Badge leve (sem IMAP): respostas não lidas aos envios DESTE usuário
  if (req.nextUrl.searchParams.get("badge") === "1") {
    const { data: meus } = await supabase.from("financeiro_emails")
      .select("message_id").eq("direcao", "enviado").eq("user_id", auth.userId)
      .not("message_id", "is", null).order("id", { ascending: false }).limit(1000);
    const meusIds = new Set((meus || []).map((m) => norm(m.message_id)));
    if (meusIds.size === 0) return NextResponse.json({ naoLidas: 0 });
    const { data: resps } = await supabase.from("financeiro_emails")
      .select("in_reply_to").eq("tipo", "resposta").is("lido_em", null)
      .order("id", { ascending: false }).limit(200);
    const naoLidas = (resps || []).filter((r) => meusIds.has(norm(r.in_reply_to))).length;
    return NextResponse.json({ naoLidas });
  }

  const imapHost = String(cfg.smtp_host).replace(/^smtp/i, "imap");
  const client = new ImapFlow({
    host: imapHost, port: 993, secure: true,
    auth: { user: cfg.email_envio, pass: decrypt(cfg.senha_enc) },
    logger: false,
  });

  const uidParam = req.nextUrl.searchParams.get("uid");
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // ── Corpo completo de um e-mail
      if (uidParam) {
        const msg = await client.fetchOne(uidParam, { source: true }, { uid: true });
        if (!msg || typeof msg === "boolean" || !msg.source) {
          return NextResponse.json({ error: "E-mail não encontrado." }, { status: 404 });
        }
        const mail = await simpleParser(msg.source);
        return NextResponse.json({
          assunto: mail.subject || "",
          de: mail.from?.text || "",
          data: mail.date?.toISOString() || null,
          texto: String(mail.text || "").slice(0, 20000),
        });
      }

      // ── Lista: últimos 30 da INBOX
      const exists = (client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0) || 0;
      if (exists === 0) return NextResponse.json({ emails: [], conta: cfg.email_envio });
      const inicio = Math.max(1, exists - 29);

      // Envios da equipe → marca "resposta a envio nosso" e liga o card
      const { data: enviados } = await supabase.from("financeiro_emails")
        .select("message_id, chamado_id").eq("direcao", "enviado")
        .not("message_id", "is", null).order("id", { ascending: false }).limit(3000);
      const porMsgId = new Map<string, number>();
      for (const e of enviados || []) {
        const k = norm(e.message_id);
        if (k && !porMsgId.has(k)) porMsgId.set(k, Number(e.chamado_id));
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const emails: any[] = [];
      for await (const msg of client.fetch(`${inicio}:*`, { envelope: true, flags: true, uid: true })) {
        const env: any = msg.envelope || {};
        const chamadoId = porMsgId.get(norm(env.inReplyTo)) ?? null;
        emails.push({
          uid: msg.uid,
          de: env.from?.[0]?.address || "",
          deNome: env.from?.[0]?.name || "",
          assunto: env.subject || "(sem assunto)",
          data: env.date ? new Date(env.date).toISOString() : null,
          naoLida: !(msg.flags && msg.flags.has("\\Seen")),
          ehResposta: chamadoId != null,
          chamadoId,
        });
      }
      emails.reverse(); // mais novo primeiro

      // Nome do cliente dos cards ligados
      const ids = [...new Set(emails.filter((e) => e.chamadoId != null).map((e) => e.chamadoId))];
      if (ids.length) {
        const { data: cards } = await supabase.from("Chamado_NF").select("id, nom_cliente").in("id", ids);
        const nomes = Object.fromEntries((cards || []).map((c) => [c.id, c.nom_cliente || ""]));
        emails.forEach((e) => { if (e.chamadoId != null) e.cliente = nomes[e.chamadoId] || ""; });
      }

      return NextResponse.json({ emails, conta: cfg.email_envio });
    } finally { lock.release(); }
  } catch (e) {
    return NextResponse.json({ error: `Não consegui conectar na sua caixa (${imapHost}): ${e instanceof Error ? e.message : e}` }, { status: 502 });
  } finally {
    try { await client.logout(); } catch { /* já caiu */ }
  }
}
