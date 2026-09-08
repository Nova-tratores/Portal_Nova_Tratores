/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Aviso semanal: apoios de fábrica com contrapartida vencendo (ou já vencida).
//
// Este é o mecanismo que impede o caso IRRIGASHOW de se repetir: a verba não
// fica presa porque ninguém lembrou do relatório, e um responsável que saiu da
// empresa aparece marcado como "reatribuir" na própria mensagem.
//
// Config (ligado/desligado, destinatários, janela em dias) vive no banco, na
// tela Dev → Envios de e-mail, chave 'marketing_apoios_vencendo'.
// =============================================================================
import { enviarEmail, type EnviarEmailResultado } from '@/lib/dre-financeiro/email';
import { getConfigEnvio, registrarEnvioLog } from '@/lib/email/envios-config';
import { db, idsInativos } from './db';
import { brl } from './custos';
import { RELATORIO_EM_ABERTO } from './tipos';

const CHAVE = 'marketing_apoios_vencendo';

export interface ApoioVencendo {
  id: string;
  apoiador: string;
  acaoNome: string;
  acaoId: string;
  valorAprovado: number;
  valorRecebido: number;
  prazo: string | null;
  dias: number | null;      // negativo = venceu
  status: string;
  responsavel: string;
  responsavelInativo: boolean;
}

function diasEntre(deISO: string, ateISO: string): number {
  const de = Date.parse(deISO + 'T00:00:00Z');
  const ate = Date.parse(ateISO + 'T00:00:00Z');
  return Math.round((ate - de) / 86_400_000);
}

/** Apoios com relatório ainda devido e prazo dentro da janela (ou vencido). */
export async function listarApoiosVencendo(dias: number): Promise<ApoioVencendo[]> {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: apoios, error } = await db
    .from('mkt_apoios')
    .select('*')
    .in('relatorio_status', RELATORIO_EM_ABERTO as unknown as string[])
    .not('status', 'in', '("recusado","cancelado")');
  if (error) throw Object.assign(new Error(error.message), { code: error.code });

  const lista = apoios ?? [];
  if (lista.length === 0) return [];

  const acaoIds = [...new Set(lista.map((a: any) => a.acao_id))];
  const { data: acoes } = await db
    .from('mkt_acoes')
    .select('id, nome, deleted_at, responsavel_id, responsavel_nome')
    .in('id', acaoIds);
  const porAcao: Record<string, any> = {};
  for (const a of acoes ?? []) porAcao[a.id] = a;

  const inativos = await idsInativos([
    ...lista.map((a: any) => a.responsavel_id),
    ...(acoes ?? []).map((a: any) => a.responsavel_id),
  ]);

  const out: ApoioVencendo[] = [];
  for (const a of lista) {
    const acao = porAcao[a.acao_id];
    if (!acao || acao.deleted_at) continue; // ação na lixeira não é cobrança viva

    const d = a.contrapartida_prazo ? diasEntre(hoje, a.contrapartida_prazo) : null;
    // Sem prazo registrado ele entra do mesmo jeito: "sem prazo" é justamente o
    // tipo de buraco que faz a verba ficar parada.
    if (d !== null && d > dias) continue;

    const respId = a.responsavel_id || acao.responsavel_id;
    out.push({
      id: a.id,
      apoiador: a.apoiador,
      acaoNome: acao.nome,
      acaoId: acao.id,
      valorAprovado: Number(a.valor_aprovado ?? 0),
      valorRecebido: Number(a.valor_recebido ?? 0),
      prazo: a.contrapartida_prazo,
      dias: d,
      status: a.status,
      responsavel: a.responsavel_nome || acao.responsavel_nome || 'sem responsável',
      responsavelInativo: !!respId && inativos.has(respId),
    });
  }

  // Vencido primeiro, depois o que vence antes, sem prazo por último.
  return out.sort((x, y) => {
    if (x.dias === null && y.dias === null) return 0;
    if (x.dias === null) return 1;
    if (y.dias === null) return -1;
    return x.dias - y.dias;
  });
}

function montarHtml(itens: ApoioVencendo[], dias: number, portal: string): string {
  const linha = (i: ApoioVencendo) => {
    const quando = i.dias === null
      ? '<span style="color:#b45309">sem prazo registrado</span>'
      : i.dias < 0
        ? `<span style="color:#b91c1c"><b>venceu há ${Math.abs(i.dias)} dia(s)</b></span>`
        : `vence em ${i.dias} dia(s)`;
    return `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:6px 10px 6px 0">
          <a href="${portal}/marketing/${i.acaoId}" style="color:#2563eb;text-decoration:none">${i.acaoNome}</a>
        </td>
        <td style="padding:6px 10px 6px 0">${i.apoiador}</td>
        <td style="padding:6px 10px 6px 0">${brl(i.valorAprovado)}</td>
        <td style="padding:6px 10px 6px 0">${quando}</td>
        <td style="padding:6px 0">
          ${i.responsavel}${i.responsavelInativo ? ' <b style="color:#b91c1c">(inativo — reatribuir)</b>' : ''}
        </td>
      </tr>`;
  };

  const vencidos = itens.filter((i) => i.dias !== null && i.dias < 0).length;
  const aReceber = itens.reduce((s, i) => s + Math.max(i.valorAprovado - i.valorRecebido, 0), 0);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>
        <b>${itens.length}</b> apoio(s) de fábrica com relatório de contrapartida em aberto
        nos próximos ${dias} dias${vencidos ? ` — <b style="color:#b91c1c">${vencidos} já vencido(s)</b>` : ''}.
      </p>
      <p>Valor aprovado ainda não recebido: <b>${brl(aReceber)}</b>.</p>
      <table style="border-collapse:collapse;font-size:13px;margin:14px 0;width:100%">
        <tr style="text-align:left;background:#f3f4f6">
          <th style="padding:6px 10px 6px 0">Ação</th>
          <th style="padding:6px 10px 6px 0">Apoiador</th>
          <th style="padding:6px 10px 6px 0">Aprovado</th>
          <th style="padding:6px 10px 6px 0">Contrapartida</th>
          <th style="padding:6px 0">Responsável</th>
        </tr>
        ${itens.map(linha).join('')}
      </table>
      <p style="color:#888;font-size:12px">
        Enviado pelo Portal Nova Tratores · Marketing &amp; Eventos.
      </p>
    </div>`;
}

export interface CronApoiosArgs { origem?: 'cron' | 'manual' | 'teste'; usuario?: string; dias?: number }
export interface CronApoiosResultado {
  email: EnviarEmailResultado;
  total: number;
  vencidos: number;
  destinatarios: string[];
}

export async function cronApoiosVencendo(args: CronApoiosArgs = {}): Promise<CronApoiosResultado> {
  const origem = args.origem ?? 'cron';
  const cfg = await getConfigEnvio(CHAVE);
  const dias = Number(args.dias ?? cfg.parametros?.dias ?? 30) || 30;

  // Desligado na tela Dev = não manda nada, e o histórico registra o porquê.
  if (!cfg.ativo && origem === 'cron') {
    await registrarEnvioLog({ chave: CHAVE, origem, ok: false, motivo: 'desativado', destinatarios: [] });
    return { email: { ok: false, motivo: 'desativado' }, total: 0, vencidos: 0, destinatarios: [] };
  }

  const itens = await listarApoiosVencendo(dias);
  const vencidos = itens.filter((i) => i.dias !== null && i.dias < 0).length;

  if (itens.length === 0) {
    await registrarEnvioLog({ chave: CHAVE, origem, ok: true, motivo: 'nada_a_enviar', total: 0, destinatarios: cfg.to, usuario: args.usuario });
    return { email: { ok: true, motivo: 'nada_a_enviar' }, total: 0, vencidos: 0, destinatarios: cfg.to };
  }

  const portal = (process.env.PORTAL_URL || 'https://portal.novatratores.com').replace(/\/$/, '');
  const assunto = `Marketing — ${itens.length} contrapartida(s) de fábrica em aberto${vencidos ? ` · ${vencidos} vencida(s)` : ''}`;

  const email = await enviarEmail({
    to: cfg.to, cc: cfg.cc, bcc: cfg.bcc,
    subject: assunto,
    html: montarHtml(itens, dias, portal),
  });

  await registrarEnvioLog({
    chave: CHAVE, origem, ok: email.ok, motivo: email.motivo, assunto,
    destinatarios: cfg.to, total: itens.length, usuario: args.usuario,
    detalhes: { vencidos, dias },
  });

  return { email, total: itens.length, vencidos, destinatarios: cfg.to };
}
