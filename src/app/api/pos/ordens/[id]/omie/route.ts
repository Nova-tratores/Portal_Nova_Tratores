import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { criarOSNoOmie } from "@/lib/pos/omie";
import { faltaParaEnviarOmie } from "@/lib/pos/envio-omie-regras";
import { registrarAlimentacaoOS } from "@/lib/pos/alimentacao-os";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";
import { logAndNotify } from "@/lib/server/audit-notify";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Mesmo critério do botão "Enviar ao Omie" da OS (pode('pos','enviar_omie') em /pos)
  const g = await protegerRota(req, [{ modulo: "pos", acao: "enviar_omie" }]);
  if (g.resposta) return g.resposta;
  const { id: idOs } = await params;
  const userName = autorDe(g.user);

  // Qualquer fase serve, desde que a descrição SALVA tenha solicitação + serviço realizado
  const { data: osTexto } = await supabase.from(TBL_OS).select("Serv_Solicitado").eq("Id_Ordem", idOs).maybeSingle();
  const falta = faltaParaEnviarOmie(osTexto?.Serv_Solicitado as string | null);
  if (falta.length) {
    return NextResponse.json({ sucesso: false, erro: `Falta preencher ${falta.join(" e ")} na descrição da OS. Se você já escreveu, clique em Salvar antes de enviar.` });
  }

  const result = await criarOSNoOmie(idOs);

  // Pós-processamento é best-effort: a OS JÁ está no Omie — um erro aqui não
  // pode virar 500 pro navegador (o usuário veria "erro" num envio que deu
  // certo e poderia tentar reenviar).
  if (result.sucesso) {
    try {
    const agora = new Date();
    const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
    const horaFmt = agora.toLocaleTimeString("pt-BR");
    const acaoParts = [
      result.interna
        ? `Ordem interna concluída${result.cNumOS ? ` (remessa de peças nº ${result.cNumOS})` : " (sem peças)"}`
        : `OS enviada para Omie (nº ${result.cNumOS})`,
    ];
    if (result.pedidoVenda) acaoParts.push(`PV nº ${result.pedidoVenda}`);
    if (result.pedidoVendaErro) acaoParts.push(`Erro remessa: ${result.pedidoVendaErro}`);

    // Interna conclui direto (remessa, nada a cobrar); externa vai pra
    // COBRANDO CLIENTE — o Tratorilson manda o orçamento + PDFs pelo card.
    const novoStatus = result.interna ? "Concluída" : "Cobrando Cliente";
    await supabase.from(TBL_OS).update({ Status: novoStatus }).eq("Id_Ordem", idOs);
    await sincronizarStatusPPV(idOs, novoStatus).catch(() => {});

    // Registra despesa de alimentação automaticamente como Requisicao (fluxo padrão)
    try {
      const alim = await registrarAlimentacaoOS(idOs);
      if (alim.criada) {
        console.log(`[alimentacao-os] OS ${idOs} → Requisicao #${alim.requisicaoId} criada (financeiro)`);
      } else if (alim.motivoPulado) {
        console.log(`[alimentacao-os] OS ${idOs} pulado: ${alim.motivoPulado}`);
      }
    } catch (e) {
      console.error(`[alimentacao-os] OS ${idOs} falhou (ignorado):`, e instanceof Error ? e.message : e);
    }

    await supabase.from(TBL_LOGS_PPO).insert({
      Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt,
      UsuEmail: userName,
      acao: acaoParts.join(" | "),
      Status_Anterior: "Enviado", Status_Atual: novoStatus,
      Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
    });

    await logAndNotify({
      userName, sistema: "pos", acao: result.interna ? "concluir_interna" : "enviar_omie",
      entidade: "ordem_servico", entidadeId: idOs, entidadeLabel: `OS ${idOs}`,
      detalhes: { cNumOS: result.cNumOS, pedidoVenda: result.pedidoVenda, interna: result.interna },
      notifTitulo: result.interna ? `Ordem interna ${idOs} concluída` : `OS ${idOs} enviada para Omie`,
      notifDescricao: result.interna
        ? `${userName} concluiu a ordem interna ${idOs}${result.cNumOS ? ` (remessa de peças nº ${result.cNumOS})` : ""}`
        : `${userName} enviou OS ${idOs} para Omie (nº ${result.cNumOS})`,
      notifLink: `/pos?id=${idOs}`,
    });
    } catch (e) {
      console.error(`[pos/omie] OS ${idOs}: pós-processamento falhou (envio ao Omie OK):`, e);
    }
  }

  return NextResponse.json(result);
}
