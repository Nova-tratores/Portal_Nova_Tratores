/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Helper de envio de e-mail via GMAIL — usa o MESMO provedor ja configurado em
// producao (env GMAIL_USER + GMAIL_APP_PASSWORD), como revisoes/enviar-boleto/
// inspecoes/garantias. Reune num unico ponto o padrao que hoje esta inline em
// cada rota, com a mesma interface do helper SMTP (src/lib/ajustes/email.ts).
//
// Sem GMAIL_USER/GMAIL_APP_PASSWORD, enviarEmail() retorna
// { ok:false, motivo:'gmail_nao_configurado' } sem lancar excecao.
// ============================================================================
import nodemailer from 'nodemailer'

let _transportador: nodemailer.Transporter | null = null

function getTransportador(): nodemailer.Transporter | null {
  if (_transportador) return _transportador
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null
  _transportador = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    pool: true,
    maxConnections: 3,
  })
  return _transportador
}

/** Parser CSV-friendly: aceita "a@b.com,c@d.com;e@f.com" e devolve array. */
export function parseDestinatarios(s: unknown): string[] {
  if (!s) return []
  return String(s)
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export interface AnexoEmail {
  filename?: string
  content?: any
  contentType?: string
}

export interface EnviarEmailArgs {
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject?: string
  html?: string
  text?: string
  attachments?: AnexoEmail[]
  /** nome amigavel do remetente (default "Portal Nova Tratores"). */
  fromNome?: string
}

export interface EnviarEmailResultado {
  ok: boolean
  motivo?: string
  erro?: string
  messageId?: string
  accepted?: any
  rejected?: any
}

/** Envia um e-mail via Gmail (com anexos opcionais). Nao lanca: devolve { ok, motivo }. */
export async function enviarEmail(args: EnviarEmailArgs = {}): Promise<EnviarEmailResultado> {
  const { to, cc, bcc, subject, html, text, attachments, fromNome } = args
  const t = getTransportador()
  if (!t) return { ok: false, motivo: 'gmail_nao_configurado' }
  const destinatarios = Array.isArray(to) ? to : parseDestinatarios(to)
  if (!destinatarios.length) return { ok: false, motivo: 'sem_destinatario' }
  try {
    const info = await t.sendMail({
      from: `"${fromNome || 'Portal Nova Tratores'}" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      cc: Array.isArray(cc) ? cc.join(', ') : cc ? parseDestinatarios(cc).join(', ') : undefined,
      bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc ? parseDestinatarios(bcc).join(', ') : undefined,
      subject: subject || '(sem assunto)',
      html: html || undefined,
      text: text || (html ? undefined : '(sem corpo)'),
      attachments: Array.isArray(attachments)
        ? attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
        : undefined,
    })
    return { ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }
  } catch (e: any) {
    return { ok: false, motivo: 'erro_gmail', erro: e.message }
  }
}
