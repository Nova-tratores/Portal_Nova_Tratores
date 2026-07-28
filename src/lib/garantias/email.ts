// Helpers de e-mail do módulo de Garantias — compartilhados pelas rotas novas
// (enviar-email-solicitacao, cron de recebimento) e pelos ajustes mínimos nas
// rotas antigas (enviar-sg, solicitar-ressarcimento). Os utilitários foram
// copiados do enviar-sg sem refatorar a rota antiga (em produção).
import nodemailer from 'nodemailer';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GAR_EMAILS } from './constants';

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  pool: true,
  maxConnections: 3,
});

export function sanitizeHtml(s: string): string {
  return String(s ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c),
  );
}

export function aplicarTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

export function saudacao(): string {
  const hora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(hora) < 12 ? 'Bom dia' : 'Boa tarde';
}

export async function baixarUrl(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function sanitizeFileName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
}

// Vídeo NUNCA vai anexado no e-mail (estoura o limite do Gmail) — vai como
// LINK no corpo (o bucket garantias é público).
export function ehVideo(a: { content_type?: string | null; nome_arquivo?: string | null; url?: string }): boolean {
  if ((a.content_type || '').startsWith('video/')) return true;
  return /\.(mp4|mov|avi|mkv|webm|3gpp?|m4v)(\?|$)/i.test(a.nome_arquivo || a.url || '');
}

// Garante o número interno (GAR-XXXX) no assunto — é a âncora que o cron de
// recebimento usa pra casar a resposta da fábrica quando o In-Reply-To some
// (respostas via sistema de tickets/webmail). Sufixo não quebra o template.
export function tagAssuntoGarantia(assunto: string, numero: string): string {
  const limpo = String(assunto || '').replace(/[<>"']/g, '').trim();
  if (/GAR-\d{3,}/i.test(limpo)) return limpo;
  return `${limpo} [${numero}]`;
}

// Normaliza Message-ID: sem <>, sem espaços.
export function normalizarMessageId(id?: string | null): string | null {
  const v = String(id || '').trim().replace(/^<|>$/g, '');
  return v || null;
}

// Grava o e-mail ENVIADO na conversa da garantia (garantia_emails).
// Best-effort: a tabela pode ainda não existir (migration pendente) e o
// envio JAMAIS pode falhar por causa do registro.
export async function registrarEmailEnviado(
  garantiaId: string,
  info: {
    messageId?: string | null;
    de?: string | null;
    para: string[];
    assunto: string;
    corpoHtml?: string | null;
    anexos?: { nome: string; url?: string | null; content_type?: string | null }[];
  },
): Promise<void> {
  try {
    await supabase.from(TBL_GAR_EMAILS).insert({
      garantia_id: garantiaId,
      direcao: 'enviado',
      message_id: normalizarMessageId(info.messageId),
      de: info.de || process.env.GMAIL_USER || null,
      para: info.para,
      assunto: info.assunto,
      corpo_html: info.corpoHtml || null,
      data: new Date().toISOString(),
      anexos: (info.anexos || []).map((a) => ({
        nome: a.nome,
        url: a.url || null,
        content_type: a.content_type || null,
      })),
      lida: true,
    });
  } catch (e) {
    console.warn('[garantias] registrarEmailEnviado falhou (segue sem registro):', e);
  }
}
