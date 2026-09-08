// Envia o relatório de contrapartida por e-mail PRA FÁBRICA.
//
// Única ação do módulo que manda mensagem pra fora da empresa — por isso a
// permissão é separada ('relatorio:enviar') e conferida AQUI, não só no botão.
// Destinatário padrão vem de email_envios_config (tela Dev), nunca do Railway.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { enviarContrapartida } from '@/lib/marketing/relatorio-contrapartida';
import { logMarketing, nomeDoUsuario } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ apoioId: string }> }) {
  const g = await guardar(req, 'marketing', 'relatorio:enviar');
  if (g.resposta) return g.resposta;

  try {
    const { apoioId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const autor = await nomeDoUsuario(g.auth);

    const r = await enviarContrapartida({
      apoioId,
      to: body?.to,
      cc: body?.cc,
      bcc: body?.bcc,
      assunto: body?.assunto,
      mensagem: body?.mensagem,
      enviadoPor: autor,
      origem: body?.teste ? 'teste' : 'manual',
    });

    await logMarketing(g.auth, {
      acao: 'enviar',
      entidade: 'relatorio_contrapartida',
      entidadeId: apoioId,
      detalhes: { ok: r.email.ok, motivo: r.email.motivo, destinatarios: r.destinatarios, pendencias: r.pendencias.length, teste: !!body?.teste },
    });

    if (!r.email.ok) {
      const motivo = r.email.motivo === 'sem_destinatario'
        ? 'Nenhum destinatário configurado. Configure em Dev → Envios de e-mail, ou informe na hora do envio.'
        : r.email.motivo === 'gmail_nao_configurado'
          ? 'O envio de e-mail não está configurado no servidor.'
          : (r.email.erro || 'O e-mail não pôde ser enviado.');
      return NextResponse.json({ ok: false, error: motivo, ...r }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return erroResposta(e, 'POST /contrapartida/enviar');
  }
}
