import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_ITENS } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";
import { gerarProximoId, vincularPPVnaOS, atualizarValorTotal } from "@/lib/ppv/queries";
import { supabaseFetch, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS } from "@/lib/ppv/constants";

interface ItemOrc {
  codigo?: string;
  descricao?: string;
  quantidade?: number;
  preco?: number;
}

// POST /api/orcamentos/[id]/importar  body: { ordem_servico, userName }
// Importa os dados do orçamento para a OS e o PPV:
//  - Horas e KM SUBSTITUEM os valores da OS (Qtd_HR / Qtd_KM).
//  - Observação é anexada à descrição do serviço (sem duplicar).
//  - Peças (itens) viram movimentações de Saída no PPV vinculado à OS
//    (cria um PPV novo se a OS ainda não tiver).
//  - Recalcula o Valor_Total da OS (mesma fórmula do PATCH da OS).
//  - Marca o orçamento como concluído e vinculado à OS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const osId = String(body.ordem_servico || "").trim();
  const userName = String(body.userName || "Sistema");
  if (!osId) return NextResponse.json({ error: "OS não informada." }, { status: 400 });

  // 1) Carrega orçamento + OS
  const { data: orc } = await supabase.from("orcamentos").select("*").eq("id", id).maybeSingle();
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  const { data: os } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", osId).maybeSingle();
  if (!os) return NextResponse.json({ error: `OS ${osId} não encontrada.` }, { status: 404 });

  const itens: ItemOrc[] = Array.isArray(orc.itens) ? orc.itens : [];
  const horas = Number(orc.mao_obra?.horas) || 0;
  const km = Number(orc.deslocamento?.km) || 0;
  const obs = String(orc.observacao || "").trim();
  const tecnico = String(os.Os_Tecnico || "").trim();

  // 2) PPV alvo: usa o primeiro já vinculado; cria um novo se não houver e houver itens
  const ppvAtuais = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  let ppvId = ppvAtuais[0] || "";
  let ppvCriado = false;
  if (!ppvId && itens.length > 0) {
    ppvId = await gerarProximoId("PPV");
    const dataFmt = formatarDataBR(new Date().toISOString(), true);
    await supabaseFetch(TBL_PEDIDOS, "POST", [{
      id_pedido: ppvId,
      Tipo_Pedido: "Pedido",
      cliente: os.Os_Cliente || orc.cliente_nome || "NOVA TRATORES",
      tecnico,
      status: "Aguardando",
      valor_total: 0,
      observacao: `Ref. Orçamento ${orc.numero}`,
      Motivo_Saida_Pedido: "Venda Balcão",
      email_usuario: userName,
      Id_Os: osId,
      Projeto: os.Projeto || "",
      data: dataFmt,
    }]);
    await vincularPPVnaOS(osId, ppvId); // atualiza Ordem_Servico.ID_PPV
    ppvCriado = true;
  }

  // 3) Itens -> movimentações (Saída) no PPV
  if (ppvId && itens.length > 0) {
    const dataFmt = formatarDataBR(new Date().toISOString(), true);
    const movs = itens
      .filter((i) => i && i.descricao)
      .map((i) => ({
        Id: Math.floor(Math.random() * 9000000000) + 1000000000,
        Id_PPV: ppvId,
        Data_Hora: dataFmt,
        Tecnico: tecnico,
        TipoMovimento: "Saída",
        CodProduto: i.codigo || "",
        Descricao: i.descricao,
        Qtde: String(i.quantidade || 1),
        Preco: i.preco || 0,
      }));
    if (movs.length > 0) {
      await supabaseFetch(TBL_ITENS, "POST", movs);
      await atualizarValorTotal(ppvId);
    }
  }

  // 4) Recalcula o Valor_Total da OS (mesma fórmula do PATCH da OS)
  const ppvParaTotal = ppvCriado ? [...ppvAtuais, ppvId] : ppvAtuais;
  let vPecas = 0;
  if (ppvParaTotal.length > 0) {
    const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", ppvParaTotal);
    const resumo: Record<string, { qtde: number; totalFin: number }> = {};
    (items || []).forEach((item) => {
      const cod = String(item.CodProduto || "");
      const preco = parseFloat(item.Preco || 0);
      let qtd = Math.abs(parseFloat(item.Qtde || 0));
      if (String(item.TipoMovimento || "").toLowerCase().includes("devolu")) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { qtde: 0, totalFin: 0 };
      resumo[cod].qtde += qtd;
      resumo[cod].totalFin += preco * qtd;
    });
    Object.values(resumo).forEach((p) => { if (p.qtde !== 0) vPecas += p.totalFin; });
  }
  let vReq = 0;
  const { data: reqsOS } = await supabase
    .from("Requisicao")
    .select("valor_cobrado_cliente")
    .eq("ordem_servico", osId)
    .not("status", "in", '("lixeira","cancelada")');
  (reqsOS || []).forEach((r) => { if (r.valor_cobrado_cliente) vReq += parseFloat(r.valor_cobrado_cliente); });

  const config = await getConfigPOS();
  const vHoras = horas * config.valor_hora;
  const vKm = km * config.valor_km;
  const desc = parseFloat(String(os.Desconto || 0));
  const descHora = parseFloat(String(os.Desconto_Hora || 0));
  const descKm = parseFloat(String(os.Desconto_KM || 0));
  const total = vHoras + vKm + vPecas + vReq - desc - descHora - descKm;

  // 5) Anexa a observação do orçamento à descrição do serviço (sem duplicar)
  let servSolic = String(os.Serv_Solicitado || "");
  const marcador = `Orçamento ${orc.numero}`;
  if (!servSolic.includes(marcador)) {
    const linhaObs = obs ? `\nObs.: ${obs}` : "";
    servSolic = `${servSolic}${servSolic.trim() ? "\n\n" : ""}— Importado do ${marcador}${linhaObs}`.trim();
  }

  // 6) Atualiza a OS (substitui horas/km, anexa obs, recalcula total)
  await supabase
    .from(TBL_OS)
    .update({ Qtd_HR: horas, Qtd_KM: km, Serv_Solicitado: servSolic, Valor_Total: total })
    .eq("Id_Ordem", osId);

  // 7) Marca o orçamento como concluído e vinculado
  await supabase
    .from("orcamentos")
    .update({ status: "concluido", ordem_servico: osId, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    ppv: ppvId || null,
    ppvCriado,
    horas,
    km,
    itens: itens.length,
    total,
  });
}
