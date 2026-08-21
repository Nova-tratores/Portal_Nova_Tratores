// Caixa de e-mail DO USUÁRIO logado — RÁPIDA:
//  · conexão IMAP reaproveitada (pool) — sem pagar 1–3s de login a cada ação
//  · lista com cache curto no servidor (30s) + ?fresh=1 no botão de atualizar
//  · corpo da mensagem baixado por PARTE (só o texto/HTML, não os anexos)
//   GET               → últimos 30 e-mails da INBOX
//   GET ?uid=N        → corpo (HTML/texto) + lista de anexos (sem baixá-los)
//   GET ?uid=N&anexo=P→ baixa só o anexo da parte P
//   GET ?badge=1      → não lidos da INBOX (STATUS)
//   PATCH {uid|todas} → marca como lida (\Seen direto na caixa)
//   POST {uid, texto} → responde na mesma conversa (SMTP do usuário)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { autenticar } from "@/lib/auth/server";
import { decrypt } from "@/lib/cripto";
import { comImap } from "@/lib/financeiro/imapPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

/* eslint-disable @typescript-eslint/no-explicit-any */

const norm = (id?: string | null) => String(id || "").trim().replace(/^<|>$/g, "").toLowerCase();

async function configDoUsuario(userId: string) {
  const { data: cfg } = await supabase.from("financeiro_envio_config")
    .select("email_envio, smtp_host, smtp_port, smtp_secure, senha_enc")
    .eq("user_id", userId).maybeSingle();
  if (!cfg?.email_envio || !cfg?.senha_enc || !cfg?.smtp_host) return null;
  return cfg;
}

// Caches curtos em memória (o processo do Railway vive entre requests)
const cacheLista = new Map<string, { ts: number; payload: any }>();
let cacheMapa: { ts: number; mapa: Map<string, number> } | null = null;

async function mapaEnviados(): Promise<Map<string, number>> {
  if (cacheMapa && Date.now() - cacheMapa.ts < 60000) return cacheMapa.mapa;
  const { data: enviados } = await supabase.from("financeiro_emails")
    .select("message_id, chamado_id").eq("direcao", "enviado")
    .not("message_id", "is", null).order("id", { ascending: false }).limit(3000);
  const m = new Map<string, number>();
  for (const e of enviados || []) {
    const k = norm(e.message_id);
    if (k && !m.has(k)) m.set(k, Number(e.chamado_id));
  }
  cacheMapa = { ts: Date.now(), mapa: m };
  return m;
}

// Anda pela ESTRUTURA do e-mail: acha a parte do corpo (html/texto) e os
// anexos SEM baixar nada — baixamos só a parte pedida.
function mapearEstrutura(node: any, out: { html: string | null; texto: string | null; charsetHtml: string; charsetTexto: string; anexos: any[] }) {
  if (!node) return out;
  const tipo = String(node.type || "").toLowerCase();
  const disp = String(node.disposition || "").toLowerCase();
  const nome = node.dispositionParameters?.filename || node.parameters?.name || "";
  const ehAnexo = disp === "attachment" || (!!nome && !tipo.startsWith("multipart"));
  if (ehAnexo && node.part) {
    out.anexos.push({ part: node.part, nome: nome || `anexo_${out.anexos.length + 1}`, tipo, tamanho: node.size || 0 });
  } else if (tipo === "text/html" && !out.html && node.part !== undefined) {
    out.html = node.part || "TEXT";
    out.charsetHtml = String(node.parameters?.charset || "utf-8");
  } else if (tipo === "text/plain" && !out.texto && node.part !== undefined) {
    out.texto = node.part || "TEXT";
    out.charsetTexto = String(node.parameters?.charset || "utf-8");
  }
  for (const filho of node.childNodes || []) mapearEstrutura(filho, out);
  return out;
}

async function baixarParte(client: any, uid: string, part: string): Promise<Buffer> {
  const { content } = await client.download(uid, part, { uid: true });
  const pedacos: Buffer[] = [];
  for await (const chunk of content) pedacos.push(chunk as Buffer);
  return Buffer.concat(pedacos);
}

const decodificar = (buf: Buffer, charset: string) => {
  const cs = charset.toLowerCase();
  return buf.toString(cs.includes("8859") || cs.includes("latin") ? "latin1" : "utf-8");
};

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const cfg = await configDoUsuario(auth.userId);
  if (!cfg) return NextResponse.json({ semConfig: true });
  const senha = decrypt(cfg.senha_enc);

  const uidParam = req.nextUrl.searchParams.get("uid");
  const anexoParam = req.nextUrl.searchParams.get("anexo");
  try {
    // ── Badge: não lidos (STATUS, rápido com pool)
    if (req.nextUrl.searchParams.get("badge") === "1") {
      const unseen = await comImap(auth.userId, cfg, senha, async (client) => {
        const st = await client.status("INBOX", { unseen: true });
        return st.unseen ?? 0;
      });
      return NextResponse.json({ naoLidas: unseen });
    }

    // ── Anexo: baixa SÓ a parte pedida
    if (uidParam && anexoParam) {
      const r = await comImap(auth.userId, cfg, senha, async (client) => {
        const lock = await client.getMailboxLock("INBOX");
        try {
          const msg: any = await client.fetchOne(uidParam, { bodyStructure: true }, { uid: true });
          if (!msg?.bodyStructure) return null;
          const est = mapearEstrutura(msg.bodyStructure, { html: null, texto: null, charsetHtml: "utf-8", charsetTexto: "utf-8", anexos: [] });
          const alvo = est.anexos.find((a) => a.part === anexoParam);
          if (!alvo) return null;
          const buf = await baixarParte(client, uidParam, alvo.part);
          return { buf, alvo };
        } finally { lock.release(); }
      });
      if (!r) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
      return new NextResponse(new Uint8Array(r.buf), {
        headers: {
          "Content-Type": r.alvo.tipo || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(r.alvo.nome)}"`,
        },
      });
    }

    // ── Detalhe: corpo por parte + metadados dos anexos (sem baixá-los)
    if (uidParam) {
      const det = await comImap(auth.userId, cfg, senha, async (client) => {
        const lock = await client.getMailboxLock("INBOX");
        try {
          const msg: any = await client.fetchOne(uidParam, { bodyStructure: true, envelope: true }, { uid: true });
          if (!msg?.bodyStructure) return null;
          const env: any = msg.envelope || {};
          const est = mapearEstrutura(msg.bodyStructure, { html: null, texto: null, charsetHtml: "utf-8", charsetTexto: "utf-8", anexos: [] });
          let html: string | null = null, texto = "";
          if (est.html) html = decodificar(await baixarParte(client, uidParam, est.html), est.charsetHtml);
          else if (est.texto) texto = decodificar(await baixarParte(client, uidParam, est.texto), est.charsetTexto);
          return { env, est, html, texto };
        } finally { lock.release(); }
      });
      if (!det) return NextResponse.json({ error: "E-mail não encontrado." }, { status: 404 });

      const porMsgId = await mapaEnviados();
      const chamadoId = porMsgId.get(norm(det.env.inReplyTo)) ?? null;
      return NextResponse.json({
        assunto: det.env.subject || "(sem assunto)",
        de: det.env.from?.[0]?.name ? `${det.env.from[0].name} <${det.env.from[0].address}>` : (det.env.from?.[0]?.address || ""),
        deEmail: det.env.from?.[0]?.address || "",
        data: det.env.date ? new Date(det.env.date).toISOString() : null,
        html: det.html,
        texto: det.texto,
        chamadoId,
        anexos: det.est.anexos.map((a: any) => ({ i: a.part, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho })),
      });
    }

    // ── Lista: cache de 30s (o botão Atualizar manda ?fresh=1)
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const chaveCache = auth.userId;
    const emCache = cacheLista.get(chaveCache);
    if (!fresh && emCache && Date.now() - emCache.ts < 30000) {
      return NextResponse.json(emCache.payload);
    }

    const porMsgId = await mapaEnviados();
    const emails = await comImap(auth.userId, cfg, senha, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const exists = (client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0) || 0;
        if (exists === 0) return [];
        const inicio = Math.max(1, exists - 29);
        const lista: any[] = [];
        for await (const msg of client.fetch(`${inicio}:*`, { envelope: true, flags: true, uid: true })) {
          const env: any = msg.envelope || {};
          const chamadoId = porMsgId.get(norm(env.inReplyTo)) ?? null;
          lista.push({
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
        lista.reverse();
        return lista;
      } finally { lock.release(); }
    });

    const ids = [...new Set(emails.filter((e: any) => e.chamadoId != null).map((e: any) => e.chamadoId))];
    if (ids.length) {
      const { data: cards } = await supabase.from("Chamado_NF").select("id, nom_cliente").in("id", ids);
      const nomes = Object.fromEntries((cards || []).map((c) => [c.id, c.nom_cliente || ""]));
      emails.forEach((e: any) => { if (e.chamadoId != null) e.cliente = nomes[e.chamadoId] || ""; });
    }
    const payload = { emails, conta: cfg.email_envio };
    cacheLista.set(chaveCache, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: `Não consegui conectar na sua caixa: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}

// ── MARCAR COMO LIDA (\Seen direto na caixa; o cache da lista é invalidado)
export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const cfg = await configDoUsuario(auth.userId);
  if (!cfg) return NextResponse.json({ error: "Sem e-mail configurado." }, { status: 400 });
  const senha = decrypt(cfg.senha_enc);

  const { uid, todas } = await req.json().catch(() => ({}));
  if (!uid && !todas) return NextResponse.json({ error: "uid ou todas é obrigatório." }, { status: 400 });

  try {
    const marcadas = await comImap(auth.userId, cfg, senha, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        if (todas) {
          const naoLidas = await client.search({ seen: false });
          const lista = Array.isArray(naoLidas) ? naoLidas : [];
          if (lista.length > 0) await client.messageFlagsAdd(lista.join(","), ["\\Seen"]);
          return lista.length;
        }
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        return 1;
      } finally { lock.release(); }
    });
    cacheLista.delete(auth.userId);
    return NextResponse.json({ ok: true, marcadas });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao marcar: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}

// ── RESPONDER (mesma conversa, SMTP do próprio usuário)
export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const cfg = await configDoUsuario(auth.userId);
  if (!cfg) return NextResponse.json({ error: "Configure seu e-mail de envio primeiro." }, { status: 400 });
  const senha = decrypt(cfg.senha_enc);

  const { uid, texto } = await req.json().catch(() => ({}));
  const corpo = String(texto || "").trim();
  if (!uid || !corpo) return NextResponse.json({ error: "uid e texto são obrigatórios." }, { status: 400 });

  let original: { de: string; assunto: string; messageId: string; inReplyTo: string } | null = null;
  try {
    original = await comImap(auth.userId, cfg, senha, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const msg: any = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        if (!msg?.envelope) return null;
        const env: any = msg.envelope;
        return {
          de: env.from?.[0]?.address || "",
          assunto: env.subject || "",
          messageId: env.messageId || "",
          inReplyTo: env.inReplyTo || "",
        };
      } finally { lock.release(); }
    });
  } catch { /* segue sem original */ }
  if (!original?.de) return NextResponse.json({ error: "Não consegui identificar o e-mail original." }, { status: 404 });

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure !== false,
      auth: { user: cfg.email_envio, pass: senha },
    });
    const assunto = /^re:/i.test(original.assunto) ? original.assunto : `Re: ${original.assunto}`;
    const html = corpo.split("\n").map((l) => l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))).join("<br>");
    const info = await transporter.sendMail({
      from: `"Nova Tratores" <${cfg.email_envio}>`,
      to: original.de,
      subject: assunto,
      html: `<p>${html}</p>`,
      ...(original.messageId ? { inReplyTo: original.messageId, references: [original.inReplyTo, original.messageId].filter(Boolean).join(" ") } : {}),
    });

    // Conversa ligada a um card? Registra no histórico (tipo 'mensagem')
    try {
      const porMsgId = await mapaEnviados();
      let chamadoId = porMsgId.get(norm(original.inReplyTo)) ?? null;
      if (chamadoId == null && original.messageId) {
        const { data: r } = await supabase.from("financeiro_emails")
          .select("chamado_id").eq("message_id", original.messageId).limit(1);
        if (r && r.length > 0) chamadoId = Number(r[0].chamado_id);
      }
      if (chamadoId != null) {
        await supabase.from("financeiro_emails").insert({
          chamado_id: chamadoId, tipo: "mensagem", direcao: "enviado",
          de_email: cfg.email_envio, destinatarios: original.de,
          assunto, corpo: `<p>${html}</p>`, message_id: info.messageId || null,
          in_reply_to: original.messageId || null, user_id: auth.userId,
        });
        cacheMapa = null;
      }
    } catch { /* registro é best-effort */ }

    return NextResponse.json({ ok: true, para: original.de });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao enviar: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
