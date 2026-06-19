/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Helper de envio de e-mail via SMTP (provedor generico - Cednet, Office365,
// Gmail, etc). Portado de src/email.js.
//
// Configuracao via env vars:
//   SMTP_HOST                     host do servidor (ex.: smtp.cednet.com.br)
//   SMTP_PORT                     ex.: 587 (STARTTLS) ou 465 (SSL direto)
//   SMTP_USER                     email do remetente
//   SMTP_PASS                     senha
//   SMTP_FROM                     opcional - default SMTP_USER
//   SMTP_TLS_REJECT_UNAUTHORIZED  default true (deixar false p/ self-signed)
//
// Sem essas vars, enviarEmail() retorna { ok:false, motivo:'smtp_nao_configurado' }
// sem lancar excecao -> o resto do sistema continua funcionando.
//
// (Usado pela Fase 6 no relatorio semanal; aqui so e' criado.)
// ============================================================================

import nodemailer from 'nodemailer';

let _transportador: nodemailer.Transporter | null = null;

function getTransportador(): nodemailer.Transporter | null {
  if (_transportador) return _transportador;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  _transportador = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL direto; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
  });
  return _transportador;
}

/** Parser CSV-friendly: aceita "a@b.com,c@d.com;e@f.com" e devolve array. */
export function parseDestinatarios(s: unknown): string[] {
  if (!s) return [];
  return String(s)
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface AnexoEmail {
  filename?: string;
  content?: any;
  contentType?: string;
}

export interface EnviarEmailArgs {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  attachments?: AnexoEmail[];
}

export interface EnviarEmailResultado {
  ok: boolean;
  motivo?: string;
  erro?: string;
  messageId?: string;
  accepted?: any;
  rejected?: any;
}

/** Envia um e-mail (com anexos opcionais). Nao lanca: devolve { ok, motivo }. */
export async function enviarEmail(args: EnviarEmailArgs = {}): Promise<EnviarEmailResultado> {
  const { to, cc, bcc, subject, html, text, attachments } = args;
  const t = getTransportador();
  if (!t) return { ok: false, motivo: 'smtp_nao_configurado' };
  const destinatarios = Array.isArray(to) ? to : parseDestinatarios(to);
  if (!destinatarios.length) return { ok: false, motivo: 'sem_destinatario' };
  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destinatarios.join(', '),
      cc: Array.isArray(cc) ? cc.join(', ') : cc ? parseDestinatarios(cc).join(', ') : undefined,
      bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc ? parseDestinatarios(bcc).join(', ') : undefined,
      subject: subject || '(sem assunto)',
      html: html || undefined,
      text: text || (html ? undefined : '(sem corpo)'),
      attachments: Array.isArray(attachments)
        ? attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
        : undefined,
    });
    return { ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
  } catch (e: any) {
    return { ok: false, motivo: 'erro_smtp', erro: e.message };
  }
}

export interface TestarSMTPResultado {
  ok: boolean;
  configurado?: boolean;
  faltam?: string[];
  motivo?: string;
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  erro?: string;
  code?: string;
}

/**
 * Testa se o SMTP esta configurado e a conexao+auth funcionam, SEM enviar email.
 * Util para debug rapido apos mexer nas env vars.
 */
export async function testarSMTP(): Promise<TestarSMTPResultado> {
  const t = getTransportador();
  if (!t) {
    const faltam: string[] = [];
    if (!process.env.SMTP_HOST) faltam.push('SMTP_HOST');
    if (!process.env.SMTP_USER) faltam.push('SMTP_USER');
    if (!process.env.SMTP_PASS) faltam.push('SMTP_PASS');
    return { ok: false, configurado: false, faltam, motivo: 'smtp_nao_configurado' };
  }
  try {
    await t.verify();
    return {
      ok: true,
      configurado: true,
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    };
  } catch (e: any) {
    return {
      ok: false,
      configurado: true,
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      motivo: 'falha_verify',
      erro: e.message,
      code: e.code,
    };
  }
}
