// =============================================================================
// RELATÓRIO DE CONTRAPARTIDA — junta os dados do banco, o PDF e o e-mail.
//
// É o entregável que destrava a verba: a fábrica libera o apoio contra a
// prestação de contas do que foi feito.
//
// O desenho do documento vive em pdf-contrapartida.ts (sem banco nem e-mail,
// pra poder ser testado sozinho).
//
// Config de destinatário: tela Dev → Envios de e-mail, chave
// 'marketing_contrapartida'. NADA de e-mail em variável do Railway.
// =============================================================================
import { enviarEmail, parseDestinatarios, type EnviarEmailResultado } from '@/lib/dre-financeiro/email';
import { getConfigEnvio, registrarEnvioLog } from '@/lib/email/envios-config';
import { db, carregarAcaoCompleta } from './db';
import { montarRelatorio, type Relatorio } from './contrapartida';
import { gerarPDFContrapartida } from './pdf-contrapartida';
import type { Apoio } from './tipos';

export { gerarPDFContrapartida };

// ── Dados ────────────────────────────────────────────────────────────────────
export async function dadosDoRelatorio(apoioId: string): Promise<Relatorio | null> {
  const { data: apoio, error } = await db.from('mkt_apoios').select('*').eq('id', apoioId).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!apoio) return null;

  const ficha = await carregarAcaoCompleta(apoio.acao_id);
  if (!ficha) return null;

  return montarRelatorio({
    acao: ficha.acao,
    apoio: apoio as Apoio,
    custos: ficha.custos,
    leads: ficha.leads,
    propostas: ficha.propostas,
    apoios: ficha.apoios,
    equipe: ficha.equipe,
    itens: ficha.itens,
    realizadas: ficha.realizadas,
    concorrentes: ficha.concorrentes,
    midias: ficha.midias,
    avaliacoes: ficha.avaliacoes,
  });
}

// ── E-mail ───────────────────────────────────────────────────────────────────
export interface EnviarContrapartidaArgs {
  apoioId: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  assunto?: string;
  mensagem?: string;
  enviadoPor?: string;
  origem?: 'manual' | 'cron' | 'teste';
}

export interface EnviarContrapartidaResultado {
  email: EnviarEmailResultado;
  destinatarios: string[];
  pendencias: string[];
  arquivo: string;
}

const CHAVE = 'marketing_contrapartida';

export async function enviarContrapartida(
  args: EnviarContrapartidaArgs,
): Promise<EnviarContrapartidaResultado> {
  const origem = args.origem ?? 'manual';
  const rel = await dadosDoRelatorio(args.apoioId);
  if (!rel) throw new Error('Apoio não encontrado.');

  const cfg = await getConfigEnvio(CHAVE);
  const to = args.to ? parseDestinatarios(args.to) : cfg.to;
  const cc = args.cc ? parseDestinatarios(args.cc) : cfg.cc;
  const bcc = args.bcc ? parseDestinatarios(args.bcc) : cfg.bcc;

  const arquivo = `relatorio-contrapartida-${rel.subtitulo.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.pdf`;
  const assunto = args.assunto || `${rel.titulo} — ${rel.subtitulo}`;

  if (to.length === 0) {
    const resultado: EnviarEmailResultado = { ok: false, motivo: 'sem_destinatario' };
    await registrarEnvioLog({
      chave: CHAVE, origem, ok: false, motivo: 'sem_destinatario', assunto,
      destinatarios: [], usuario: args.enviadoPor,
      detalhes: { apoio_id: args.apoioId, pendencias: rel.pendencias.length },
    });
    return { email: resultado, destinatarios: [], pendencias: rel.pendencias, arquivo };
  }

  const pdf = await gerarPDFContrapartida(rel);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>Segue em anexo o <b>${rel.titulo}</b> referente a <b>${rel.subtitulo}</b>.</p>
      ${args.mensagem ? `<p>${String(args.mensagem).replace(/\n/g, '<br>')}</p>` : ''}
      <table style="border-collapse:collapse;font-size:13px;margin:14px 0">
        ${rel.secoes[1].linhas.slice(0, 6).map((l) => `
          <tr>
            <td style="padding:3px 10px 3px 0;color:#555">${l.rotulo}</td>
            <td style="padding:3px 0"><b>${l.valor}</b></td>
          </tr>`).join('')}
      </table>
      ${rel.pendencias.length
        ? `<p style="color:#b91c1c"><b>Atenção:</b> ${rel.pendencias.length} item(ns) ainda sem registro aparecem no relatório como "Não registrado".</p>`
        : ''}
      <p style="color:#888;font-size:12px">Enviado pelo Portal Nova Tratores.</p>
    </div>`;

  const email = await enviarEmail({
    to, cc, bcc, subject: assunto, html,
    attachments: [{ filename: arquivo, content: pdf, contentType: 'application/pdf' }],
  });

  await registrarEnvioLog({
    chave: CHAVE, origem, ok: email.ok, motivo: email.motivo, assunto,
    destinatarios: to, usuario: args.enviadoPor,
    detalhes: { apoio_id: args.apoioId, pendencias: rel.pendencias.length },
  });

  // Só marca como enviado quando o e-mail saiu de verdade. E o teste não conta
  // como entrega à fábrica.
  if (email.ok && origem !== 'teste') {
    await db.from('mkt_apoios').update({
      relatorio_status: 'enviado',
      relatorio_enviado_em: new Date().toISOString(),
      relatorio_enviado_para: to,
      atualizado_em: new Date().toISOString(),
    }).eq('id', args.apoioId);
  }

  return { email, destinatarios: to, pendencias: rel.pendencias, arquivo };
}
