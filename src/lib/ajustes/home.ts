/* eslint-disable @typescript-eslint/no-explicit-any */
// Resumo da semana anterior para o dashboard CMC garantia (recebimentos pendentes,
// pedidos abertos, estoque negativo). Portado de GET /api/home-resumo (server.js).
// NÃO dispara varredura de negativo — só lê o último resultado do scan.

import type { Conta } from './conta';
import { semanaAnterior, fmtBR, fmtISO } from './dates';
import { obterRecebimentosPendentes } from './recebimentos';
import { obterPedidos } from './pedidos';
import { lerStatusNegativos } from './negativos';

export async function homeResumo(conta: Conta, force = false): Promise<any> {
  const { de, ate } = semanaAnterior();
  const dataDeBR = fmtBR(de);
  const dataAteBR = fmtBR(ate);

  const [receb, peds] = await Promise.all([
    obterRecebimentosPendentes(conta, dataDeBR, dataAteBR, force).catch((e: any) => ({ erro: e.faultstring || e.message })),
    obterPedidos(conta, dataDeBR, dataAteBR, force).catch((e: any) => ({ erro: e.faultstring || e.message })),
  ]);

  let negativos: any;
  try {
    const neg = await lerStatusNegativos(conta);
    if (neg.semDados) negativos = { semDados: true, rodando: !!neg.rodando };
    else if (neg.erro) negativos = { erro: neg.erro };
    else negativos = { totalNegativos: neg.totalNegativos, totalSuspeitas: neg.totalSuspeitas, geradoEm: neg.geradoEm, cachedEm: neg.cachedEm, rodando: !!neg.rodando };
  } catch (e: any) {
    negativos = { erro: e.message };
  }

  return {
    conta,
    contaLabel: conta,
    periodo: { de: dataDeBR, ate: dataAteBR, deISO: fmtISO(de), ateISO: fmtISO(ate) },
    recebimentos: (receb as any).erro
      ? { erro: (receb as any).erro }
      : {
          totalRecebimentos: (receb as any).totalRecebimentos,
          totalNaoProcessados: (receb as any).totalNaoProcessados,
          totalComSinalGarantia: (receb as any).totalComSinalGarantia,
          totalItensRisco: (receb as any).totalItensRisco,
        },
    pedidos: (peds as any).erro ? { erro: (peds as any).erro } : { total: (peds as any).total },
    negativos,
  };
}
