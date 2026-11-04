// Mudança de fase do card (Chamado_NF) feita NO SERVIDOR depois do envio do boleto por e-mail.
//
// Antes (até 29/10/2026) o e-mail saía pela rota /api/financeiro/enviar-boleto e a fase mudava pelo
// navegador (envioBoleto.js autoEnviarENotificar e PreferenciaEnvioBoleto moverAposEnvio), com o erro
// ignorado: se a aba fechasse — ou o update falhasse, como falhava sempre por mandar a coluna
// status_changed_at que não existia — o card ficava em "Enviar ao cliente" e o próximo clique mandava
// de novo (#1456 levou 2 e-mails). Agora a rota muda a fase quando o envio dá certo.
// status_changed_at NÃO vai no update: o trigger de sql/financeiro-status-changed-at.sql grava.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fases em que o boleto ainda não foi enviado: nelas, envio por e-mail com sucesso → Aguardando Cliente. */
export const FASES_PRE_ENVIO = ["gerar_boleto", "validar_pix", "enviar_cliente", "sem_boleto"];

export const FASE_APOS_ENVIO = { status: "aguardando_vencimento", tarefa: "Aguardando Cliente" } as const;

/** Puro: o card nesta fase deve mudar depois do envio por e-mail? */
export const deveMoverAposEnvio = (status: string | null | undefined) => FASES_PRE_ENVIO.includes(String(status || ""));

export type CardMovido = { id: number; de: string };

/**
 * Move o card e os filhos do grupo (grupo_pai_id) que estão numa fase pré-envio para Aguardando
 * Cliente e registra no histórico (audit_log). Nunca lança: devolve o que moveu e o erro, se houver.
 */
export async function moverAposEnvio(
  sb: SupabaseClient,
  chamadoId: number,
  quem: { userId: string; nome: string },
  detalhes: { destinatarios: string[] },
): Promise<{ moveu: boolean; movidos: CardMovido[]; erro?: string }> {
  const movidos: CardMovido[] = [];
  try {
    const { data: card, error: eLer } = await sb.from("Chamado_NF").select("id, status, nom_cliente").eq("id", chamadoId).maybeSingle();
    if (eLer) return { moveu: false, movidos, erro: eLer.message };
    if (!card) return { moveu: false, movidos };
    const { data: filhos } = await sb.from("Chamado_NF").select("id, status, nom_cliente").eq("grupo_pai_id", chamadoId);
    const alvos = [card, ...(filhos || [])].filter((c) => deveMoverAposEnvio(c.status));
    for (const c of alvos) {
      // .eq('status', de): se alguém moveu nesse meio-tempo, não sobrescreve
      const { error, count } = await sb.from("Chamado_NF")
        .update({ status: FASE_APOS_ENVIO.status, tarefa: FASE_APOS_ENVIO.tarefa }, { count: "exact" })
        .eq("id", c.id).eq("status", c.status);
      if (error) return { moveu: movidos.some((m) => m.id === chamadoId), movidos, erro: error.message };
      if (!count) continue;
      movidos.push({ id: c.id, de: c.status });
      await sb.from("audit_log").insert({
        user_id: quem.userId, user_nome: quem.nome,
        sistema: "financeiro", acao: "mover_status", entidade: "Chamado_NF", entidade_id: String(c.id),
        entidade_label: `NF #${c.id} - ${c.nom_cliente || ""}`,
        detalhes: {
          de: c.status, para: FASE_APOS_ENVIO.status,
          acao_desc: c.id === chamadoId ? "Boleto enviado por email ao cliente" : `Boleto enviado por email ao cliente (agrupado no #${chamadoId})`,
          destinatarios: detalhes.destinatarios, servidor: true,
        },
      }).then(() => undefined, () => undefined);
    }
    return { moveu: movidos.some((m) => m.id === chamadoId), movidos };
  } catch (e) {
    return { moveu: movidos.some((m) => m.id === chamadoId), movidos, erro: e instanceof Error ? e.message : String(e) };
  }
}
