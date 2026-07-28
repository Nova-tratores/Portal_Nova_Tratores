import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, TBL_GAR_PEND, FOTOS_OS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import {
  transporter,
  sanitizeHtml,
  aplicarTemplate,
  saudacao,
  baixarUrl,
  ehVideo,
  tagAssuntoGarantia,
  registrarEmailEnviado,
} from '@/lib/garantias/email';

export const runtime = 'nodejs';

// Limite prático de anexos do Gmail (~25MB); deixamos folga pro overhead base64
const LIMITE_ANEXOS_BYTES = 22 * 1024 * 1024;

// GET /api/garantias/[id]/enviar-email-solicitacao — dados pro preview da
// seção no drawer: fotos disponíveis da OS, assunto/corpo default e prontidão.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(*)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  const mont = Array.isArray(g.montadora) ? g.montadora[0] : g.montadora;
  if (!mont || mont.tipo_template !== 'email') {
    return NextResponse.json({ error: 'Montadora não usa solicitação por e-mail.' }, { status: 400 });
  }

  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select(FOTOS_OS.map((f) => f.chave).join(', '))
    .eq('Ordem_Servico', g.id_ordem)
    .maybeSingle();
  const fotos = FOTOS_OS.map((f) => ({
    chave: f.chave,
    label: f.label,
    url: String((tec as unknown as Record<string, unknown> | null)?.[f.chave] || ''),
  })).filter((f) => f.url);

  const respostas = ((g.checklist_respostas as Record<string, unknown>) || {});
  const varsSan = {
    numero: sanitizeHtml(g.numero_externo || g.numero),
    cliente: sanitizeHtml(g.cliente || ''),
    os: sanitizeHtml(g.id_ordem || ''),
    chassis: sanitizeHtml(g.chassis || ''),
    modelo: sanitizeHtml(g.modelo || ''),
  };
  const assunto = tagAssuntoGarantia(
    (mont.email_assunto
      ? aplicarTemplate(mont.email_assunto, varsSan)
      : `Solicitação de Garantia - ${varsSan.cliente} - ${varsSan.modelo}`
    ).replace(/[<>"']/g, '').trim(),
    g.numero,
  );
  const corpo = mont.email_corpo
    ? aplicarTemplate(mont.email_corpo, varsSan)
    : `${saudacao()}, solicitamos a garantia referente à OS ${varsSan.os} do cliente ${varsSan.cliente}${varsSan.chassis ? ` (chassi ${varsSan.chassis})` : ''}. Seguem em anexo o Relatório de Assistência Técnica, a nota fiscal de venda do equipamento e as fotos da ocorrência.`;

  return NextResponse.json({
    fotos,
    assunto,
    corpo,
    destinatarios: (mont.email_destinatarios || []).filter(Boolean),
    textosProntos: !!(String(respostas['sg_reclamacao'] || '').trim() || String(respostas['sg_diagnostico'] || '').trim()),
  });
}

// POST /api/garantias/[id]/enviar-email-solicitacao
// Fluxo de solicitação por E-MAIL (montadora tipo_template='email', ex. Ipacol):
// monta o e-mail com o template da montadora + relato do Tratorilson e anexa
// fotos da OS selecionadas + RAT + NF de venda + anexos de envio à fábrica.
// body: { ator, fotosSelecionadas?: string[] (chaves FOTOS_OS), assuntoOverride?, corpoOverride? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(*)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  const mont = Array.isArray(g.montadora) ? g.montadora[0] : g.montadora;
  if (!mont) return NextResponse.json({ error: 'Defina a montadora da garantia.' }, { status: 400 });
  if (mont.tipo_template !== 'email') {
    return NextResponse.json(
      { error: 'Esta montadora não usa solicitação por e-mail (configure o formato em Montadoras).' },
      { status: 400 }
    );
  }
  if (g.status !== 'enviada') {
    return NextResponse.json(
      { error: 'Envie a garantia à fábrica antes de disparar o e-mail de solicitação.' },
      { status: 400 }
    );
  }
  const destinatarios: string[] = (mont.email_destinatarios || []).filter(Boolean);
  if (destinatarios.length === 0) {
    return NextResponse.json(
      { error: `Cadastre os e-mails da fábrica em Montadoras → ${mont.nome}.` },
      { status: 400 }
    );
  }
  const { data: pendAberta } = await supabase
    .from(TBL_GAR_PEND)
    .select('id')
    .eq('garantia_id', id)
    .eq('status', 'aberta')
    .limit(1);
  if (pendAberta && pendAberta.length > 0) {
    return NextResponse.json({ error: 'Resolva a pendência aberta antes de enviar o e-mail.' }, { status: 400 });
  }

  // Relato do Tratorilson: se ainda não formatado, tenta agora (best-effort)
  let respostas = ((g.checklist_respostas as Record<string, unknown>) || {});
  const temTextos = String(respostas['sg_reclamacao'] || '').trim() || String(respostas['sg_diagnostico'] || '').trim();
  if (!temTextos) {
    try {
      await fetch(`${req.nextUrl.origin}/api/garantias/${id}/formatar-textos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ator }),
      });
      const { data: gAtual } = await supabase
        .from(TBL_GARANTIAS)
        .select('checklist_respostas')
        .eq('id', id)
        .maybeSingle();
      respostas = ((gAtual?.checklist_respostas as Record<string, unknown>) || respostas);
    } catch (e) {
      console.warn('[garantias] formatar-textos indisponível no envio:', e);
    }
  }
  const texto = (k: string) => String(respostas[k] || '').trim();

  // Dados pro template ({{numero}} {{cliente}} {{os}} {{chassis}} {{modelo}})
  const varsSan = {
    numero: sanitizeHtml(g.numero_externo || g.numero),
    cliente: sanitizeHtml(g.cliente || ''),
    os: sanitizeHtml(g.id_ordem || ''),
    chassis: sanitizeHtml(g.chassis || ''),
    modelo: sanitizeHtml(g.modelo || ''),
  };

  const assuntoBase = String(body.assuntoOverride || '').trim()
    || (mont.email_assunto
      ? aplicarTemplate(mont.email_assunto, varsSan)
      : `Solicitação de Garantia - ${varsSan.cliente} - ${varsSan.modelo}`);
  // [GAR-XXXX] sempre no assunto: âncora pro cron casar a resposta da fábrica
  const assunto = tagAssuntoGarantia(assuntoBase.replace(/[<>"']/g, '').trim(), g.numero);

  const corpoBase = String(body.corpoOverride || '').trim()
    || (mont.email_corpo
      ? aplicarTemplate(mont.email_corpo, varsSan)
      : `${saudacao()}, solicitamos a garantia referente à OS ${varsSan.os} do cliente ${varsSan.cliente}${varsSan.chassis ? ` (chassi ${varsSan.chassis})` : ''}. Seguem em anexo o Relatório de Assistência Técnica, a nota fiscal de venda do equipamento e as fotos da ocorrência.`);
  const corpoHtml = `<p>${sanitizeHtml(corpoBase).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

  // Bloco "Relato técnico" com os textos do Tratorilson
  const blocosRelato: string[] = [];
  if (texto('sg_reclamacao')) blocosRelato.push(`<p><strong>Reclamação do cliente:</strong><br>${sanitizeHtml(texto('sg_reclamacao'))}</p>`);
  if (texto('sg_diagnostico')) blocosRelato.push(`<p><strong>Diagnóstico técnico:</strong><br>${sanitizeHtml(texto('sg_diagnostico'))}</p>`);
  if (texto('sg_acao_tomada')) blocosRelato.push(`<p><strong>Ação corretiva:</strong><br>${sanitizeHtml(texto('sg_acao_tomada'))}</p>`);
  if (texto('sg_observacoes')) blocosRelato.push(`<p><strong>Observações:</strong><br>${sanitizeHtml(texto('sg_observacoes'))}</p>`);
  const relatoHtml = blocosRelato.length ? `<hr style="border:none;border-top:1px solid #ddd"/>${blocosRelato.join('')}` : '';

  // ── Anexos ─────────────────────────────────────────────────────────────────
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  const nomesAnexos: { nome: string; url?: string | null; content_type?: string | null }[] = [];

  // 1) Fotos da OS (selecionáveis; ausente = todas as existentes)
  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select(FOTOS_OS.map((f) => f.chave).join(', '))
    .eq('Ordem_Servico', g.id_ordem)
    .maybeSingle();
  const selecionadas: string[] | null = Array.isArray(body.fotosSelecionadas) ? body.fotosSelecionadas : null;
  const fotosEscolhidas = FOTOS_OS.filter((f) => {
    const url = (tec as unknown as Record<string, unknown> | null)?.[f.chave];
    if (!url) return false;
    return selecionadas === null || selecionadas.includes(f.chave);
  });
  await Promise.all(
    fotosEscolhidas.map(async (f) => {
      const url = String((tec as unknown as Record<string, unknown>)?.[f.chave] || '');
      const buf = await baixarUrl(url);
      if (!buf) return;
      const ext = (url.split('?')[0].match(/\.([a-zA-Z0-9]{3,4})$/)?.[1] || 'jpg').toLowerCase();
      attachments.push({ filename: `${f.label.replace(/\s+/g, '_')}.${ext}`, content: buf });
      nomesAnexos.push({ nome: `${f.label}.${ext}`, url });
    })
  );

  // 2) RAT + NF de venda (mais recentes) + demais anexos de envio à fábrica
  const { data: anexosDb } = await supabase
    .from(TBL_GAR_ANEXOS)
    .select('id, categoria, url, nome_arquivo, content_type, created_at')
    .eq('garantia_id', id)
    .in('categoria', ['relatorio_at', 'nf_venda', 'envio_fabrica'])
    .order('created_at', { ascending: false });
  type Ax = { id: string; categoria: string; url: string; nome_arquivo: string | null; content_type: string | null };
  const lista = (anexosDb || []) as Ax[];
  const ratMaisRecente = lista.find((a) => a.categoria === 'relatorio_at' && !ehVideo(a));
  const nfMaisRecente = lista.find((a) => a.categoria === 'nf_venda' && !ehVideo(a));
  const envioExtras = lista.filter((a) => a.categoria === 'envio_fabrica' && !ehVideo(a));
  const paraAnexar = [ratMaisRecente, nfMaisRecente, ...envioExtras].filter(Boolean) as Ax[];
  for (const a of paraAnexar) {
    const buf = await baixarUrl(a.url);
    if (!buf) continue;
    attachments.push({ filename: a.nome_arquivo || `anexo-${a.id}`, content: buf, contentType: a.content_type || undefined });
    nomesAnexos.push({ nome: a.nome_arquivo || `anexo-${a.id}`, url: a.url, content_type: a.content_type });
  }

  // 3) Vídeos de qualquer categoria viram LINK no corpo (nunca anexados)
  const { data: anexosTodos } = await supabase
    .from(TBL_GAR_ANEXOS)
    .select('id, url, nome_arquivo, content_type')
    .eq('garantia_id', id);
  const videos = ((anexosTodos || []) as { id: string; url: string; nome_arquivo: string | null; content_type: string | null }[]).filter(ehVideo);
  const videosHtml = videos.length
    ? `<p><strong>Vídeos da ocorrência (links):</strong></p><ul>${videos
        .map((v) => `<li><a href="${String(v.url).replace(/"/g, '%22')}">${sanitizeHtml(v.nome_arquivo || 'vídeo')}</a></li>`)
        .join('')}</ul>`
    : '';

  // Limite do Gmail
  const totalBytes = attachments.reduce((s, a) => s + a.content.length, 0);
  if (totalBytes > LIMITE_ANEXOS_BYTES) {
    return NextResponse.json(
      {
        error: `Os anexos somam ${(totalBytes / 1024 / 1024).toFixed(1)}MB — acima do limite de e-mail (~22MB). Desmarque algumas fotos e tente de novo.`,
      },
      { status: 400 }
    );
  }

  const assinaturaHtml = mont.email_assinatura || '<p>Atenciosamente,<br/>Pós-Vendas Nova Tratores</p>';
  const html = [corpoHtml, relatoHtml, videosHtml, assinaturaHtml].filter(Boolean).join('\n');

  try {
    const info = await transporter.sendMail({
      from: `"Pós-Vendas Nova Tratores" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject: assunto,
      html,
      attachments,
    });

    await registrarEmailEnviado(id, {
      messageId: info.messageId,
      para: destinatarios,
      assunto,
      corpoHtml: html,
      anexos: nomesAnexos,
    });
    await registrarEvento(id, {
      tipo: 'solicitacao_email_enviada',
      ator,
      detalhe: `Solicitação enviada por e-mail para ${destinatarios.join(', ')} (${attachments.length} anexo(s)${videos.length ? `, ${videos.length} vídeo(s) por link` : ''})`,
    });
    await notificarGarantistas({
      titulo: `Solicitação da garantia ${g.numero} enviada por e-mail`,
      descricao: `${mont.nome} · OS ${g.id_ordem}`,
      link: `/garantias?id=${id}`,
    });

    return NextResponse.json({
      ok: true,
      messageId: info.messageId,
      destinatarios,
      anexos: { total: attachments.length, fotos: fotosEscolhidas.length, rat: !!ratMaisRecente, nf: !!nfMaisRecente, videosPorLink: videos.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    console.error('Erro ao enviar e-mail de solicitação:', err);
    return NextResponse.json({ error: `Falha ao enviar o e-mail: ${msg}` }, { status: 500 });
  }
}
