import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO, TBL_METRICAS, FASES_CONTADOR_PARADO } from "@/lib/pos/constants";
import { safeGet } from "@/lib/pos/utils";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";
import { logAndNotify } from "@/lib/server/audit-notify";

export interface MudarFaseOpts {
  notificar?: boolean;   // notifica admins + audit (default true). Auto-transições usam false p/ não spammar.
  acaoLog?: string;      // texto do log na timeline da OS
}

export interface MudarFaseResult {
  success: boolean;
  changed: boolean;
  erro?: string;
}

// Aplica a mudança de fase de uma OS com todos os efeitos colaterais (log, métricas de atraso,
// sync do PPV, limpeza de Dias_Execucao). Usado pela mudança manual e pelas transições automáticas.
export async function aplicarMudancaFase(
  idOs: string,
  newStatus: string,
  userName: string,
  opts: MudarFaseOpts = {}
): Promise<MudarFaseResult> {
  const { notificar = true, acaoLog } = opts;

  const { data: resAtual } = await supabase.from(TBL_OS).select("Status").eq("Id_Ordem", idOs).limit(1);
  const statusAnterior = resAtual && resAtual.length > 0 ? (safeGet(resAtual[0], "Status") as string) : "";

  if (statusAnterior === newStatus) return { success: true, changed: false };

  // Bloqueia mudança para Concluída se não foi enviada para Omie
  if (newStatus === "Concluída") {
    const { data: osData } = await supabase.from(TBL_OS).select("Ordem_Omie").eq("Id_Ordem", idOs).limit(1);
    if (!osData?.[0]?.Ordem_Omie) {
      return { success: false, changed: false, erro: "A OS precisa ser enviada para o Omie antes de ser concluída." };
    }
  }

  await supabase.from(TBL_OS).update({ Status: newStatus }).eq("Id_Ordem", idOs);

  // Registrar log
  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: idOs,
    Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora),
    Hora_Acao: agora.toLocaleTimeString("pt-BR"),
    UsuEmail: userName || "Sistema",
    acao: acaoLog || `Mudança rápida para ${newStatus}`,
    Status_Anterior: statusAnterior, Status_Atual: newStatus,
    Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  });

  // ── Métricas de atraso ──
  if (["Orçamento", "Aguardando Cliente"].includes(newStatus)) {
    const { data: abertas } = await supabase.from(TBL_METRICAS).select("id, data_inicio").eq("id_ordem", idOs).is("data_fim", null);
    if (abertas && abertas.length > 0) {
      const agr = new Date();
      for (const m of abertas) {
        await supabase.from(TBL_METRICAS).update({ data_fim: agr.toISOString(), dias: 0 }).eq("id", m.id);
      }
    }
  }
  if (newStatus === "Execução") {
    const { data: abertas } = await supabase.from(TBL_METRICAS).select("id, data_inicio").eq("id_ordem", idOs).is("data_fim", null);
    if (abertas && abertas.length > 0) {
      const agr = new Date();
      for (const m of abertas) {
        const dias = Math.floor((agr.getTime() - new Date(m.data_inicio).getTime()) / 86400000);
        await supabase.from(TBL_METRICAS).update({ data_fim: agr.toISOString(), dias }).eq("id", m.id);
      }
    }
  }
  if (newStatus === "Aguardando ordem Técnico") {
    const { data: abertas } = await supabase.from(TBL_METRICAS).select("id, data_inicio").eq("id_ordem", idOs).is("data_fim", null);
    if (abertas && abertas.length > 0) {
      const agr = new Date();
      for (const m of abertas) {
        const dias = Math.floor((agr.getTime() - new Date(m.data_inicio).getTime()) / 86400000);
        await supabase.from(TBL_METRICAS).update({ data_fim: agr.toISOString(), dias }).eq("id", m.id);
      }
    }
    const { data: osData } = await supabase.from(TBL_OS).select("Os_Tecnico").eq("Id_Ordem", idOs).limit(1);
    await supabase.from(TBL_METRICAS).insert({
      id_ordem: idOs,
      tecnico: osData?.[0]?.Os_Tecnico || "N/A",
      tipo: "atraso_execucao",
      data_inicio: new Date().toISOString(),
    });
  }
  if (FASES_CONTADOR_PARADO.has(newStatus)) {
    const { data: abertas } = await supabase.from(TBL_METRICAS).select("id, data_inicio").eq("id_ordem", idOs).is("data_fim", null);
    if (abertas && abertas.length > 0) {
      const agr = new Date();
      for (const m of abertas) {
        const dias = Math.floor((agr.getTime() - new Date(m.data_inicio).getTime()) / 86400000);
        await supabase.from(TBL_METRICAS).update({ data_fim: agr.toISOString(), dias }).eq("id", m.id);
      }
    }
  }

  // Remover dia atual dos Dias_Execucao quando sai de execução ativa
  const statusParaExecucao = ["Execução (Realizando Diagnóstico)", "Execução aguardando peças (em transporte)"];
  if (statusParaExecucao.includes(newStatus)) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: osRow } = await supabase.from(TBL_OS).select("Dias_Execucao").eq("Id_Ordem", idOs).limit(1);
    const diasAtual = (osRow?.[0]?.Dias_Execucao as string) || "";
    if (diasAtual.includes(hoje)) {
      const novosDias = diasAtual.split(',').filter(d => !d.startsWith(hoje)).join(',');
      await supabase.from(TBL_OS).update({ Dias_Execucao: novosDias }).eq("Id_Ordem", idOs);
      await supabase.from('agenda_tecnico').delete().eq('id_ordem', idOs).eq('data_agendada', hoje);
    }
  }

  // Sincroniza status do PPV vinculado
  await sincronizarStatusPPV(idOs, newStatus);

  if (notificar) {
    await logAndNotify({
      userName: userName || "Sistema", sistema: "pos", acao: "mover_status",
      entidade: "ordem_servico", entidadeId: idOs, entidadeLabel: `OS ${idOs}`,
      detalhes: { de: statusAnterior, para: newStatus },
      notifTitulo: `OS ${idOs}: ${statusAnterior} → ${newStatus}`,
      notifDescricao: `${userName || "Sistema"} moveu OS ${idOs} para ${newStatus}`,
      notifLink: `/pos?id=${idOs}`,
    });

    // Sininho + push para técnico(s) da OS
    try {
      const { data: osRow } = await supabase.from(TBL_OS).select("Os_Tecnico, Os_Tecnico2, Os_Cliente, Cidade_Cliente").eq("Id_Ordem", idOs).limit(1);
      const tecnicos = [osRow?.[0]?.Os_Tecnico, osRow?.[0]?.Os_Tecnico2].filter(Boolean) as string[];
      if (tecnicos.length > 0) {
        const cliente = osRow?.[0]?.Os_Cliente || '';
        const cidade = osRow?.[0]?.Cidade_Cliente ? ` (${osRow[0].Cidade_Cliente})` : '';
        const titulo = `📋 OS ${idOs} movida para ${newStatus}`;
        const descricao = `Cliente: ${cliente}${cidade}. Status anterior: ${statusAnterior}`;
        await supabase.from('mecanico_notificacoes').insert(
          tecnicos.map(nome => ({
            tecnico_nome: nome,
            tipo: 'ordem',
            titulo,
            descricao,
            link: '/agenda',
            lida: false,
          }))
        );
        const { pushParaTecnico } = await import('@/lib/push-mecanicos');
        for (const nome of tecnicos) {
          await pushParaTecnico(nome, { titulo, descricao, link: '/agenda' });
        }
      }
    } catch { /* best-effort */ }
  }

  return { success: true, changed: true };
}
