/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Jobs agendados do módulo Ajustes. ARQUITETURA: dirigidos por um scheduler
// EXTERNO (Railway cron / GitHub Action / cron-job.org) batendo nas rotas
// /api/ajustes/cron/<job> protegidas por Bearer CRON_SECRET — NÃO via
// instrumentation.ts (evita duplicar ao escalar / resetar em deploy).
// DORMENTES no cutover: as rotas existem mas o scheduler só é ligado após validar.
//
// Cada função roda síncrona (a rota faz await) e retorna um resumo.
// ============================================================================

import { getContasOmie } from './conta';
import { semanaAnterior, fmtBR } from './dates';
import { resolveJanelaBR } from './cmc';
import { verificacaoDiaria } from './analise';
import { verificacaoDiariaCallbacks } from './verificacao';
import { obterRecebimentosPendentes } from './recebimentos';
import { obterPedidos, listarPedidosEnriquecidos, listarPedidosAntigosTodasContas } from './pedidos';
import { gerarPDFPedidos } from './pdf-pedidos';
import { gerarCicloEFreeze } from './inventario';
import { enviarEmail, parseDestinatarios } from './email';
import { syncNotasTodasContas } from './notas-sync';

/** Sync incremental das notas de saida (NF-e + NFS-e) -> Supabase, todas as contas. */
export async function cronSyncNotasSaida(): Promise<any> {
  return syncNotasTodasContas({
    modo: 'incremental',
    onProgress: (m: string) => console.log('[cron sync-notas]', m),
  });
}

/** Verificação diária: varre as contas e gera alertas (cmc_alertas). */
export async function cronVerificacaoDiaria(): Promise<any> {
  const { dataDeBR, dataAteBR } = resolveJanelaBR(null, null);
  return verificacaoDiaria({
    onProgress: (m: string) => console.log('[cron verificacao]', m),
    ...verificacaoDiariaCallbacks,
    listarPedidos: async (conta: any) => {
      try {
        return await listarPedidosEnriquecidos(conta, dataDeBR, dataAteBR);
      } catch {
        return [];
      }
    },
  });
}

/** Pré-aquece o cache do resumo da home (recebimentos + pedidos) p/ todas as contas. */
export async function cronHomePrewarm(): Promise<any> {
  const { de, ate } = semanaAnterior();
  const dataDeBR = fmtBR(de);
  const dataAteBR = fmtBR(ate);
  const ttl = (parseInt(process.env.HOME_PREWARM_TTL_HORAS || '', 10) || 20) * 3600;
  const resultado: Record<string, string> = {};
  for (const c of getContasOmie()) {
    try {
      await obterRecebimentosPendentes(c.id, dataDeBR, dataAteBR, true, ttl);
      await obterPedidos(c.id, dataDeBR, dataAteBR, true, ttl);
      resultado[c.id] = 'ok';
    } catch (e: any) {
      resultado[c.id] = 'erro: ' + (e.faultstring || e.message);
    }
  }
  return { janela: { de: dataDeBR, ate: dataAteBR }, resultado };
}

/** Gera o ciclo diário de inventário (+ freeze em background). */
export async function cronInventarioDiario(): Promise<any> {
  return gerarCicloEFreeze({ tipo: 'diario' });
}

/** Relatório semanal de pedidos abertos há > N dias (PDF por e-mail). */
export async function cronRelatorioPedidos(): Promise<any> {
  const diasMin = parseInt(process.env.RELATORIO_PEDIDOS_DIAS_MIN || '', 10) || 15;
  const contas = getContasOmie().map((c) => c.id);
  const { dataDeBR, dataAteBR } = resolveJanelaBR(null, null);
  const pedidos = await listarPedidosAntigosTodasContas(contas, dataDeBR, dataAteBR, diasMin);
  if (!pedidos.length) return { pedidos: 0, motivo: 'nenhum pedido aberto acima do limite' };

  const pdf = await gerarPDFPedidos({
    titulo: 'Pedidos abertos antigos',
    subtitulo: `Abertos há mais de ${diasMin} dias (NOVA + CASTRO)`,
    pedidos,
    agrupado: true,
    diasMin,
  });

  const to = parseDestinatarios(process.env.RELATORIO_PEDIDOS_EMAIL_TO);
  if (!to.length) return { pedidos: pedidos.length, motivo: 'RELATORIO_PEDIDOS_EMAIL_TO nao configurado' };

  const email = await enviarEmail({
    to,
    cc: parseDestinatarios(process.env.RELATORIO_PEDIDOS_EMAIL_CC),
    bcc: parseDestinatarios(process.env.RELATORIO_PEDIDOS_EMAIL_BCC),
    subject: `Pedidos abertos há +${diasMin} dias (${pedidos.length})`,
    html: `<p>Segue em anexo o relatório com <b>${pedidos.length}</b> pedidos abertos há mais de ${diasMin} dias (NOVA + CASTRO), agrupados por responsável.</p>`,
    attachments: [{ filename: `pedidos-antigos-${diasMin}d.pdf`, content: pdf }],
  });
  return { pedidos: pedidos.length, email };
}
