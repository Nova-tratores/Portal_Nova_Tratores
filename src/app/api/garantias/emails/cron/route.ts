// Garantias — recebimento das respostas da fábrica por e-mail.
// Cron (GitHub Actions .github/workflows/garantias-emails.yml, 07:30 e 12:00
// BRT) lê a INBOX do Gmail via IMAP, casa cada resposta com a garantia
// (In-Reply-To → [GAR-XXXX] no assunto → numero_externo → remetente de fábrica
// + chassi) e grava em garantia_emails. Casadas geram evento na timeline +
// notificação no sininho dos garantistas.
import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_EMAILS, TBL_MONTADORAS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import { sanitizeFileName, normalizarMessageId } from '@/lib/garantias/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CAP_MENSAGENS = 300;

interface GarantiaRef {
  id: string;
  numero: string;
  numero_externo: string | null;
  chassis: string | null;
  status: string;
  montadora_id: string | null;
}

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
    if (provided !== secret) return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ ok: false, erro: 'GMAIL_USER/GMAIL_APP_PASSWORD não configurados' }, { status: 500 });
  }

  // ── Janela incremental: max(data) dos recebidos − 2 dias (dedupe por
  // message_id torna a releitura idempotente). Primeira execução: 7 dias.
  const { data: ultimo } = await supabase
    .from(TBL_GAR_EMAILS)
    .select('data')
    .eq('direcao', 'recebido')
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle();
  const margem = 2 * 86400000;
  // Clamp ao relógio do servidor: o header Date vem do REMETENTE — um relógio
  // errado na fábrica (data futura) envenenaria a janela e cegaria o cron.
  const desde = ultimo?.data
    ? new Date(Math.min(new Date(ultimo.data).getTime(), Date.now()) - margem)
    : new Date(Date.now() - 7 * 86400000);

  // ── Referências pra casamento
  const [garsRes, montsRes, enviadosRes] = await Promise.all([
    supabase
      .from(TBL_GARANTIAS)
      .select('id, numero, numero_externo, chassis, status, montadora_id')
      .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString()),
    supabase.from(TBL_MONTADORAS).select('id, nome, email_destinatarios'),
    supabase.from(TBL_GAR_EMAILS).select('message_id, garantia_id').eq('direcao', 'enviado').not('message_id', 'is', null),
  ]);
  const garantias = (garsRes.data || []) as GarantiaRef[];
  const porNumero = new Map(garantias.map((g) => [g.numero.toUpperCase(), g]));
  const comNumeroExterno = garantias.filter((g) => g.numero_externo);
  const naoFinalizadas = garantias.filter((g) => g.status !== 'aprovada' && g.status !== 'rejeitada');
  const enviadosPorMsgId = new Map(
    ((enviadosRes.data || []) as { message_id: string; garantia_id: string | null }[])
      .filter((e) => e.garantia_id)
      .map((e) => [e.message_id, e.garantia_id as string]),
  );
  // E-mails de fábrica POR montadora (o numero_externo é sequência POR
  // montadora — '2026-001' pode existir em duas ao mesmo tempo; o casamento
  // por numero_externo exige o remetente da montadora certa)
  const montEmails = new Map<string, Set<string>>();
  for (const m of (montsRes.data || []) as { id: string; email_destinatarios: string[] | null }[]) {
    montEmails.set(
      m.id,
      new Set((m.email_destinatarios || []).map((e) => e.toLowerCase().trim()).filter(Boolean)),
    );
  }
  const emailsFabrica = new Set([...montEmails.values()].flatMap((s) => [...s]));

  const stats = { examinados: 0, candidatos: 0, cortados: 0, casados: 0, semGarantia: 0, ignorados: 0, duplicados: 0 };

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = (await client.search({ since: desde })) || [];
      stats.examinados = uids.length;
      if (uids.length === 0) return NextResponse.json({ ok: true, ...stats, desde });

      // 1º passe barato (só envelope) sobre TODOS os uids da janela, em lotes —
      // cortar aqui perderia mensagens antigas pra sempre quando a janela avança.
      type Cand = { uid: number; envelope: Record<string, unknown> };
      const candidatos: Cand[] = [];
      for (let i = 0; i < uids.length; i += 500) {
        const lote = uids.slice(i, i + 500);
        for await (const msg of client.fetch(lote, { envelope: true, uid: true })) {
          const env = msg.envelope;
          if (!env) continue;
          const de = (env.from?.[0]?.address || '').toLowerCase();
          if (!de || de === user.toLowerCase()) continue; // nossos próprios envios
          const assunto = env.subject || '';
          const temReply = !!env.inReplyTo;
          const temNumero = /GAR-\d{3,}/i.test(assunto);
          const temExterno = comNumeroExterno.some((g) => g.numero_externo && assunto.includes(g.numero_externo));
          const deFabrica = emailsFabrica.has(de);
          if (temReply || temNumero || temExterno || deFabrica) {
            candidatos.push({ uid: msg.uid, envelope: env as unknown as Record<string, unknown> });
          } else {
            stats.ignorados++;
          }
        }
      }
      stats.candidatos = candidatos.length;
      if (candidatos.length === 0) return NextResponse.json({ ok: true, ...stats, desde });

      // O CAP vale só pros downloads completos (caros) — processando do mais
      // ANTIGO pro mais novo, o que sobrar continua dentro da janela do
      // próximo run (max(data) dos inseridos nunca passa de mensagem pulada).
      candidatos.sort((a, b) => a.uid - b.uid);
      const processar = candidatos.slice(0, CAP_MENSAGENS);
      stats.cortados = candidatos.length - processar.length;

      // Dedupe em lote por message_id
      const msgIds = processar
        .map((c) => normalizarMessageId(String((c.envelope as { messageId?: string }).messageId || '')))
        .filter(Boolean) as string[];
      const jaGravados = new Set<string>();
      for (let i = 0; i < msgIds.length; i += 100) {
        const { data } = await supabase
          .from(TBL_GAR_EMAILS)
          .select('message_id')
          .in('message_id', msgIds.slice(i, i + 100));
        for (const r of data || []) if (r.message_id) jaGravados.add(r.message_id);
      }

      // Fallback de dedupe pra mensagens SEM Message-ID: proveniência (pasta, uid)
      const uidsSemId = processar
        .filter((c) => !normalizarMessageId(String((c.envelope as { messageId?: string }).messageId || '')))
        .map((c) => c.uid);
      const uidsGravados = new Set<number>();
      for (let i = 0; i < uidsSemId.length; i += 100) {
        const { data } = await supabase
          .from(TBL_GAR_EMAILS)
          .select('uid')
          .eq('direcao', 'recebido')
          .eq('pasta', 'INBOX')
          .in('uid', uidsSemId.slice(i, i + 100));
        for (const r of data || []) if (r.uid != null) uidsGravados.add(Number(r.uid));
      }

      for (const cand of processar) {
        const envMsgId = normalizarMessageId(String((cand.envelope as { messageId?: string }).messageId || ''));
        if (envMsgId && jaGravados.has(envMsgId)) {
          stats.duplicados++;
          continue;
        }
        if (!envMsgId && uidsGravados.has(cand.uid)) {
          stats.duplicados++;
          continue;
        }

        // 2º passe: baixa a mensagem completa e parseia
        let parsed: ParsedMail;
        try {
          const full = await client.fetchOne(String(cand.uid), { source: true }, { uid: true });
          if (!full || !full.source) continue;
          parsed = await simpleParser(full.source);
        } catch (e) {
          console.warn('[garantias/emails] falha ao baixar/parsear uid', cand.uid, e);
          continue;
        }

        const messageId = normalizarMessageId(parsed.messageId) || envMsgId;
        if (messageId && jaGravados.has(messageId)) {
          stats.duplicados++;
          continue;
        }
        if (!messageId && uidsGravados.has(cand.uid)) {
          stats.duplicados++;
          continue;
        }
        const inReplyTo = normalizarMessageId(parsed.inReplyTo);
        const references = (Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])
          .map((r) => normalizarMessageId(r))
          .filter(Boolean) as string[];
        const assunto = parsed.subject || '';
        const de = (parsed.from?.value?.[0]?.address || '').toLowerCase();
        const corpoTexto = (parsed.text || '').slice(0, 20000);
        const corpoHtml = typeof parsed.html === 'string' ? parsed.html.slice(0, 100000) : null;

        // ── Casamento (ordem de confiabilidade)
        let garantiaId: string | null = null;
        let casadoPor: string | null = null;
        const refsTodas = [inReplyTo, ...references].filter(Boolean) as string[];
        for (const r of refsTodas) {
          const gid = enviadosPorMsgId.get(r);
          if (gid) { garantiaId = gid; casadoPor = 'reply'; break; }
        }
        if (!garantiaId) {
          const m = assunto.match(/GAR-\d{3,}/i);
          if (m) {
            const g = porNumero.get(m[0].toUpperCase());
            if (g) { garantiaId = g.id; casadoPor = 'numero'; }
          }
        }
        if (!garantiaId) {
          // Fronteira numérica (2026-001 não casa com 2026-0012) + remetente
          // precisa ser da fábrica da montadora DAQUELA garantia (a sequência
          // do numero_externo é por montadora — pode repetir entre elas)
          const cands = comNumeroExterno.filter((g) => {
            if (!g.numero_externo) return false;
            const esc = g.numero_externo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!new RegExp(`(^|[^0-9-])${esc}([^0-9]|$)`).test(assunto)) return false;
            const emailsMont = g.montadora_id ? montEmails.get(g.montadora_id) : null;
            return !!emailsMont && emailsMont.has(de);
          });
          const preferida = cands.find((g) => g.status !== 'aprovada' && g.status !== 'rejeitada') || cands[0];
          if (preferida) { garantiaId = preferida.id; casadoPor = 'numero_externo'; }
        }
        if (!garantiaId && emailsFabrica.has(de)) {
          const texto = `${assunto}\n${corpoTexto}`.toUpperCase();
          const matches = naoFinalizadas.filter((g) => g.chassis && g.chassis.length >= 6 && texto.includes(g.chassis.toUpperCase()));
          if (matches.length === 1) { garantiaId = matches[0].id; casadoPor = 'remetente_chassi'; }
        }
        if (!garantiaId && !emailsFabrica.has(de) && !casadoPor) {
          // Não casou e nem é remetente de fábrica conhecido → ruído da caixa
          stats.ignorados++;
          continue;
        }

        // ── Anexos → bucket garantias
        const anexosJson: { nome: string; url: string; content_type: string | null; size: number }[] = [];
        for (const att of (parsed.attachments || []).slice(0, 10)) {
          try {
            const nome = sanitizeFileName(att.filename || `anexo-${anexosJson.length + 1}`) || `anexo-${anexosJson.length + 1}`;
            const pasta = garantiaId || 'sem_garantia';
            const path = `${pasta}/emails_recebidos/${cand.uid}_${Date.now()}_${nome}`;
            const { error: upErr } = await supabase.storage
              .from(BUCKET_GARANTIAS)
              .upload(path, att.content, { contentType: att.contentType || 'application/octet-stream', upsert: true });
            if (upErr) continue;
            const { data: pub } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(path);
            anexosJson.push({ nome, url: pub.publicUrl, content_type: att.contentType || null, size: att.size || 0 });
          } catch (e) {
            console.warn('[garantias/emails] falha no upload de anexo:', e);
          }
        }

        // ── Grava
        const { error: insErr } = await supabase.from(TBL_GAR_EMAILS).insert({
          garantia_id: garantiaId,
          direcao: 'recebido',
          message_id: messageId,
          in_reply_to: inReplyTo,
          references_ids: references.length ? references : null,
          de: parsed.from?.text || de,
          para: (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
            .flatMap((t) => t.value)
            .map((t) => t.address || '')
            .filter(Boolean),
          assunto,
          corpo_texto: corpoTexto || null,
          corpo_html: corpoHtml,
          // clamp ao presente: Date futuro do remetente não pode envenenar a janela
          data: new Date(Math.min(parsed.date ? parsed.date.getTime() : Date.now(), Date.now())).toISOString(),
          anexos: anexosJson,
          uid: cand.uid,
          pasta: 'INBOX',
          lida: false,
          casado_por: casadoPor,
        });
        if (insErr) {
          // corrida com outro processo (unique message_id) conta como duplicado
          if (insErr.code === '23505') stats.duplicados++;
          else console.error('[garantias/emails] insert falhou:', insErr.message);
          continue;
        }
        if (messageId) jaGravados.add(messageId);
        else uidsGravados.add(cand.uid);

        if (garantiaId) {
          stats.casados++;
          const g = garantias.find((x) => x.id === garantiaId);
          await registrarEvento(garantiaId, {
            tipo: 'email_recebido',
            ator: de,
            detalhe: assunto.slice(0, 180) || '(sem assunto)',
          });
          await notificarGarantistas({
            titulo: `Fábrica respondeu — garantia ${g?.numero || ''}`.trim(),
            descricao: assunto.slice(0, 140),
            link: `/garantias?id=${garantiaId}`,
          });
        } else {
          stats.semGarantia++;
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[garantias/emails] cron falhou:', err);
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : 'erro desconhecido', ...stats },
      { status: 500 },
    );
  } finally {
    try { await client.logout(); } catch { /* já caiu */ }
  }

  return NextResponse.json({ ok: true, ...stats, desde });
}

export async function POST(req: NextRequest) {
  return executar(req);
}
export async function GET(req: NextRequest) {
  return executar(req);
}
