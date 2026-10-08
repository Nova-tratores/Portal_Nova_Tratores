// Conta de e-mail DO USUÁRIO (financeiro_envio_config): tudo o que é comum à
// caixa do cabeçalho, ao envio de boletos, ao lembrete e ao cron de respostas.
//  · presets de servidor (Gmail, Office 365, e-mail da empresa no cPanel da Cednet)
//  · opções de SMTP/IMAP com timeout (servidor mudo não trava a rota por 90 s)
//  · teste da conta antes de salvar
//  · cópia na pasta Enviados: Gmail e Office 365 guardam sozinhos o que sai
//    pelo SMTP; o cPanel (mail.novatratores.com.br) NÃO — sem a cópia, a
//    resposta dada pelo portal não aparece em Enviados nem na conversa.
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import { ImapFlow } from "imapflow";
import { randomUUID } from "crypto";

export interface ContaEmail {
  email_envio: string;
  smtp_host: string;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
}

export const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { host: "smtp.office365.com", port: 587, secure: false },
  // E-mail @novatratores.com.br — cPanel da Cednet (Exim + Dovecot), senha normal da caixa
  empresa: { host: "mail.novatratores.com.br", port: 465, secure: true },
};

/** Provedor (chave de PRESETS ou 'outro') a partir do host salvo. */
export function provedorDoHost(host: string): string {
  const h = String(host || "").toLowerCase().trim();
  if (!h) return "";
  if (h.includes("gmail")) return "gmail";
  if (h.includes("office365") || h.includes("outlook")) return "outlook";
  if (h === PRESETS.empresa.host) return "empresa";
  return "outro";
}

/** SSL implícito na 465; STARTTLS na 587/25. Outras portas: o que foi pedido.
 *  (secure=true na 587 nunca conecta — a tela deixava salvar assim.) */
export function seguroPorPorta(port: number | null | undefined, pedido: boolean | null | undefined): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25) return false;
  return pedido !== false;
}

/** Servidor IMAP da conta. Regra antiga: smtp.x → imap.x (Gmail);
 *  host sem "smtp" (mail.novatratores.com.br) é o mesmo nos dois. */
export function imapDoSmtp(smtpHost: string): string {
  const h = String(smtpHost || "").trim();
  if (/office365|outlook/i.test(h)) return "outlook.office365.com";
  return h.replace(/^smtp/i, "imap");
}

/** Gmail e Office 365 já gravam em Enviados o que sai pelo SMTP. */
export function precisaCopiaEnviados(smtpHost: string): boolean {
  return !/gmail|googlemail|office365|outlook/i.test(String(smtpHost || ""));
}

const NOMES_PASTA: Record<"enviados" | "spam", string[]> = {
  enviados: ["sent", "sent items", "sent messages", "sent mail", "enviados", "itens enviados", "e-mails enviados", "mensagens enviadas"],
  spam: ["junk", "spam", "junk e-mail", "junk email", "lixo eletrônico", "lixo eletronico", "bulk mail"],
};

/** Acha a pasta especial na lista do servidor: 1º pela marca (\Sent/\Junk),
 *  depois pelo nome — o Dovecot do cPanel usa "INBOX.Sent", "INBOX.spam"… */
export function escolherPasta(
  caixas: { path: string; specialUse?: string | null; name?: string }[],
  qual: "enviados" | "spam",
): string | null {
  const marca = qual === "spam" ? "\\Junk" : "\\Sent";
  const porMarca = caixas.find((c) => String(c.specialUse || "") === marca);
  if (porMarca?.path) return porMarca.path;
  const nomes = NOMES_PASTA[qual];
  const folha = (c: { path: string; name?: string }) =>
    String(c.name || c.path.split(/[./]/).pop() || "").toLowerCase().trim();
  for (const nome of nomes) {
    const hit = caixas.find((c) => folha(c) === nome);
    if (hit?.path) return hit.path;
  }
  return null;
}

/** Erro de SMTP/IMAP em português, sem perder o texto original. */
export function traduzirErroEmail(err: unknown, servidor?: string): string {
  const e = err as { code?: string; message?: string; responseText?: string; authenticationFailed?: boolean };
  const bruto = String(e?.responseText || e?.message || err || "").trim();
  const code = String(e?.code || "");
  const onde = servidor ? ` (${servidor})` : "";
  if (e?.authenticationFailed || code === "EAUTH" || /auth|login|credential|password|senha|535|534/i.test(bruto)) {
    return `Usuário ou senha recusados pelo servidor${onde}. Confira o e-mail completo e a senha da caixa.`;
  }
  if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(bruto)) {
    return `Servidor${onde} não encontrado. Confira o endereço do servidor.`;
  }
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ESOCKET", "ECONNECTION"].includes(code) || /timeout|timed out|ECONNREFUSED|ECONNRESET/i.test(bruto)) {
    return `O servidor${onde} não respondeu. Confira servidor e porta; se estiver certo, a rede (firewall da hospedagem) pode estar bloqueando.`;
  }
  if (/certificate|self.signed|CERT_|wrong version number|SSL routines/i.test(bruto)) {
    return `Falha na conexão segura${onde}: a porta e o tipo de segurança não combinam ou o certificado é inválido. (${bruto})`;
  }
  return bruto || "Erro desconhecido no servidor de e-mail.";
}

// ── Opções das conexões ──────────────────────────────────────────────────────

export function smtpOpcoes(cfg: ContaEmail, senha: string) {
  const port = Number(cfg.smtp_port) || 465;
  return {
    host: cfg.smtp_host,
    port,
    secure: seguroPorPorta(port, cfg.smtp_secure),
    auth: { user: cfg.email_envio, pass: senha },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  };
}

export function criarTransporte(cfg: ContaEmail, senha: string) {
  return nodemailer.createTransport(smtpOpcoes(cfg, senha));
}

export function imapOpcoes(cfg: ContaEmail, senha: string) {
  return {
    host: imapDoSmtp(cfg.smtp_host),
    port: 993,
    secure: true,
    auth: { user: cfg.email_envio, pass: senha },
    logger: false as const,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
  };
}

// ── Teste da conta ───────────────────────────────────────────────────────────

export interface ResultadoTeste {
  ok: boolean;
  smtp: { ok: boolean; erro?: string };
  imap: { ok: boolean; erro?: string };
}

/** Faz login no SMTP (envio) e no IMAP (caixa) — nada é enviado. */
export async function testarConta(cfg: ContaEmail, senha: string): Promise<ResultadoTeste> {
  const smtpServ = `${cfg.smtp_host}:${Number(cfg.smtp_port) || 465}`;
  const imapServ = `${imapDoSmtp(cfg.smtp_host)}:993`;
  const [smtp, imap] = await Promise.all([
    (async () => {
      const t = criarTransporte(cfg, senha);
      try { await t.verify(); return { ok: true }; }
      catch (e) { return { ok: false, erro: traduzirErroEmail(e, smtpServ) }; }
      finally { t.close(); }
    })(),
    (async () => {
      const c = new ImapFlow(imapOpcoes(cfg, senha));
      c.on("error", () => { /* tratado no connect */ });
      try { await c.connect(); await c.logout().catch(() => c.close()); return { ok: true }; }
      catch (e) { try { c.close(); } catch { /* já caiu */ } return { ok: false, erro: traduzirErroEmail(e, imapServ) }; }
    })(),
  ]);
  return { ok: smtp.ok && imap.ok, smtp, imap };
}

// ── Envio com cópia em Enviados ──────────────────────────────────────────────

/** Envia pelo SMTP da conta e, se o servidor não guarda sozinho, grava a
 *  MESMA mensagem (mesmo Message-ID) na pasta Enviados por IMAP. A cópia é
 *  best-effort: falha nela não desfaz o envio. */
export async function enviarComCopia(
  cfg: ContaEmail,
  senha: string,
  opts: Mail.Options,
  transporter?: ReturnType<typeof criarTransporte>,
) {
  const dominio = String(cfg.email_envio || "").split("@")[1] || "novatratores.com.br";
  const mail: Mail.Options = {
    ...opts,
    messageId: opts.messageId || `<${randomUUID()}@${dominio}>`,
    date: opts.date || new Date(),
  };
  const t = transporter || criarTransporte(cfg, senha);
  const info = await t.sendMail(mail);
  if (precisaCopiaEnviados(cfg.smtp_host)) {
    try { await copiarParaEnviados(cfg, senha, mail); }
    catch (e) { console.warn("[email-conta] envio OK, mas a cópia em Enviados falhou:", traduzirErroEmail(e)); }
  }
  return info;
}

async function copiarParaEnviados(cfg: ContaEmail, senha: string, mail: Mail.Options) {
  const bruto: Buffer = await new Promise((resolve, reject) => {
    new MailComposer(mail).compile().build((err, msg) => (err ? reject(err) : resolve(msg)));
  });
  const c = new ImapFlow(imapOpcoes(cfg, senha));
  c.on("error", () => { /* tratado abaixo */ });
  await c.connect();
  try {
    const caixas = await c.list();
    const pasta = escolherPasta(caixas as never, "enviados") || "INBOX.Sent";
    await c.append(pasta, bruto, ["\\Seen"], mail.date instanceof Date ? mail.date : new Date());
  } finally {
    await c.logout().catch(() => c.close());
  }
}
