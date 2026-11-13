// Trava "Concluída só faturada" (José, 13/11/2026).
//
// A OS-0770 ficou dois meses como Concluída com a OS aberta no Omie, e a OS-0650
// foi movida na mão de "Cobrando Cliente" para "Concluída" sem faturar. Daqui
// em diante, a OS só vai para Concluída quando:
//   1. o portal já sabe que está faturada (faturado_omie_em), ou
//   2. é serviço interno (recibo/remessa para o pós-vendas — nada a cobrar), ou
//   3. o Omie mostra a OS faturada AGORA (faturada direto lá: a conferência
//      carimba no portal na hora), ou
//   4. a pessoa escreve o MOTIVO de concluir sem faturar (fica na história da OS).
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";

export const MOTIVO_MINIMO = 10;

export type TravaConcluida =
  | { ok: true; motivoLog?: string; jaConcluida?: boolean }
  | { ok: false; erro: string; precisaMotivo: boolean };

interface OSTrava {
  Status?: string | null;
  Ordem_Omie?: string | null;
  faturado_omie_em?: string | null;
  Servico_Interno?: boolean | null;
}

async function lerOS(idOs: string): Promise<OSTrava | null> {
  const { data } = await supabase.from(TBL_OS)
    .select("Status, Ordem_Omie, faturado_omie_em, Servico_Interno")
    .eq("Id_Ordem", idOs).limit(1);
  return (data?.[0] as OSTrava | undefined) ?? null;
}

/** Regra pura (testável): decide com o que já se sabe da OS. */
export function decidirTrava(os: OSTrava | null, motivo: string | null | undefined): TravaConcluida {
  if (!os?.Ordem_Omie) {
    return { ok: false, precisaMotivo: false, erro: "A OS precisa ser enviada para o Omie antes de ser concluída." };
  }
  if (os.faturado_omie_em || os.Servico_Interno) return { ok: true };
  const m = String(motivo || "").trim();
  if (m.length >= MOTIVO_MINIMO) return { ok: true, motivoLog: m };
  const num = String(os.Ordem_Omie).replace(/^0+/, "") || os.Ordem_Omie;
  return {
    ok: false,
    precisaMotivo: true,
    erro: m
      ? `Motivo muito curto: escreva pelo menos ${MOTIVO_MINIMO} letras.`
      : `Esta OS ainda NÃO foi faturada no Omie (OS nº ${num} continua aberta lá). ` +
        `Fature pelo botão Faturar da OS — ela vai para Concluída sozinha. ` +
        `Se for um caso à parte, escreva o motivo para concluir sem faturar.`,
  };
}

/**
 * Pode mover a OS para Concluída? Se o portal ainda não sabe do faturamento,
 * confere no Omie (a conferência carimba a OS faturada direto lá).
 * OS que já está Concluída passa (editar uma OS concluída não trava).
 */
export async function travaConcluida(idOs: string, motivo?: string | null): Promise<TravaConcluida> {
  let os = await lerOS(idOs);
  if (os?.Status === "Concluída") return { ok: true, jaConcluida: true };
  if (os?.Ordem_Omie && !os.faturado_omie_em && !os.Servico_Interno) {
    try {
      const { reconciliarFaturamentoOS } = await import("@/lib/pos/faturamento");
      await reconciliarFaturamentoOS(idOs);
      os = await lerOS(idOs);
      // faturada direto no Omie e sem peças pendentes: a própria conferência já concluiu
      if (os?.Status === "Concluída") return { ok: true, jaConcluida: true };
    } catch (e) {
      console.error(`[trava-concluida] ${idOs}: conferência no Omie falhou`, e instanceof Error ? e.message : e);
    }
  }
  return decidirTrava(os, motivo);
}
