import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PEND, VALOR_HORA, VALOR_KM } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  pool: true,
  maxConnections: 3,
});

function sanitizeHtml(s: string): string {
  return String(s ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c),
  );
}

function saudacao(): string {
  const hora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(hora) < 12 ? 'Bom dia' : 'Boa tarde';
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// POST /api/garantias/[id]/solicitar-ressarcimento — 2ª etapa do fluxo em duas
// etapas: serviço executado, garantista pede o ressarcimento das horas/km à
// fábrica. Se a montadora tiver ressarcimento_por_email, dispara o e-mail;
// senão só muda a fase (garantista negocia por fora).
// body: { garantista_nome?, garantista_horas?, garantista_km?, garantista_obs? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.garantista_nome || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, status, id_ordem, cliente, chassis, modelo, tecnico_nome, tecnico_horas, tecnico_km, montadora:garantia_montadoras(nome, fluxo, ressarcimento_por_email, email_destinatarios, email_assinatura)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  type MontRess = {
    nome?: string;
    fluxo?: string;
    ressarcimento_por_email?: boolean;
    email_destinatarios?: string[];
    email_assinatura?: string | null;
  };
  const mont = (g as unknown as { montadora?: MontRess | MontRess[] }).montadora;
  const m = Array.isArray(mont) ? mont[0] : mont;
  if (m?.fluxo !== 'duas_etapas') {
    return NextResponse.json(
      { error: 'O ressarcimento em separado só existe em montadoras com fluxo em duas etapas.' },
      { status: 400 }
    );
  }
  if (g.status !== 'aguardando_servico') {
    return NextResponse.json(
      { error: 'O ressarcimento só pode ser solicitado com a garantia aguardando serviço.' },
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
    return NextResponse.json(
      { error: 'Resolva a pendência aberta antes de solicitar o ressarcimento.' },
      { status: 400 }
    );
  }

  // O serviço acabou de ser executado — repuxa horas/km/peças da OS (best-effort)
  try {
    await fetch(`${req.nextUrl.origin}/api/garantias/${id}/sincronizar-os`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ator }),
    });
  } catch (err) {
    console.error('Falha ao sincronizar OS antes do ressarcimento:', err);
  }

  // Horas/KM do garantista informados na tela sobrepõem os do técnico
  const gHoras = body.garantista_horas === '' || body.garantista_horas == null ? null : Number(body.garantista_horas);
  const gKm = body.garantista_km === '' || body.garantista_km == null ? null : Number(body.garantista_km);

  // Recarrega a garantia (o sync pode ter atualizado tecnico_horas/km)
  const { data: gAtual } = await supabase
    .from(TBL_GARANTIAS)
    .select('tecnico_horas, tecnico_km')
    .eq('id', id)
    .maybeSingle();

  const horas = gHoras ?? Number(gAtual?.tecnico_horas ?? g.tecnico_horas) ?? 0;
  const km = gKm ?? Number(gAtual?.tecnico_km ?? g.tecnico_km) ?? 0;
  const vh = (horas || 0) * VALOR_HORA;
  const vk = (km || 0) * VALOR_KM;

  // E-mail à fábrica (quando configurado na montadora)
  const porEmail = !!m?.ressarcimento_por_email;
  const destinatarios = (m?.email_destinatarios || []).filter(Boolean);
  if (porEmail) {
    if (destinatarios.length === 0) {
      return NextResponse.json(
        { error: `Cadastre os e-mails da fábrica em Montadoras → ${m?.nome || 'montadora'}.` },
        { status: 400 }
      );
    }
    const numeroRef = g.numero_externo || g.numero;
    const linhas: [string, string][] = [
      ['Garantia', String(numeroRef)],
      ['O.S.', String(g.id_ordem || '')],
      ['Cliente', String(g.cliente || '')],
      ['Chassi', String(g.chassis || '')],
      ['Modelo', String(g.modelo || '')],
      ['Mão de obra', `${horas || 0}h × ${fmtBRL(VALOR_HORA)} = ${fmtBRL(vh)}`],
      ['Deslocamento', `${km || 0} km × ${fmtBRL(VALOR_KM)} = ${fmtBRL(vk)}`],
      ['Total do ressarcimento', fmtBRL(vh + vk)],
    ];
    const tabela = linhas
      .map(
        ([label, valor]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;"><strong>${sanitizeHtml(label)}:</strong></td><td style="padding:4px 0;">${sanitizeHtml(valor)}</td></tr>`
      )
      .join('');
    const obs = String(body.garantista_obs || '').trim();
    const html = `
      <p>${saudacao()},</p>
      <p>Solicitamos o ressarcimento do serviço executado em garantia (peças já aprovadas):</p>
      <table style="border-collapse:collapse;font-size:14px;">${tabela}</table>
      ${obs ? `<p style="color:#555;">Obs.: ${sanitizeHtml(obs)}</p>` : ''}
      ${m?.email_assinatura || '<p>Atenciosamente,<br/>Pós-Vendas Nova Tratores</p>'}
    `;
    try {
      await transporter.sendMail({
        from: `"Pós-Vendas Nova Tratores" <${process.env.GMAIL_USER}>`,
        to: destinatarios.join(', '),
        subject: `Ressarcimento Garantia ${numeroRef} - ${g.cliente || ''} - OS ${g.id_ordem}`,
        html,
      });
    } catch (err) {
      console.error('Erro ao enviar e-mail de ressarcimento:', err);
      return NextResponse.json(
        { error: 'Falha ao enviar o e-mail à fábrica. A garantia não mudou de fase — tente de novo.' },
        { status: 500 }
      );
    }
  }

  const update: Record<string, unknown> = {
    status: 'ressarcimento_fabrica',
    ressarcimento_enviado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    garantista_horas: gHoras,
    garantista_km: gKm,
    garantista_obs: body.garantista_obs || null,
  };
  if (body.garantista_nome) update.garantista_nome = body.garantista_nome;

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao solicitar ressarcimento:', error.message);
    return NextResponse.json({ error: 'Falha ao solicitar o ressarcimento.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'ressarcimento_solicitado',
    statusAnterior: 'aguardando_servico',
    statusNovo: 'ressarcimento_fabrica',
    ator,
    detalhe: porEmail
      ? `Ressarcimento solicitado por e-mail (${destinatarios.join(', ')}) — M.O. ${fmtBRL(vh)} + desloc. ${fmtBRL(vk)}`
      : `Ressarcimento solicitado — M.O. ${fmtBRL(vh)} + desloc. ${fmtBRL(vk)}`,
  });
  await notificarGarantistas({
    titulo: `Ressarcimento da garantia ${g.numero} solicitado`,
    descricao: `OS ${g.id_ordem} · ${fmtBRL(vh + vk)}`,
    link: `/garantias?id=${id}`,
  });

  return NextResponse.json({ garantia: data, emailEnviado: porEmail });
}
