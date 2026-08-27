import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_PEDIDOS, POS_TO_PPV_STATUS } from "@/lib/pos/constants";

// POST /api/pos/ordens/[id]/criar-ppv
// Cria um PPV de peças JÁ VINCULADO a uma OS existente — em QUALQUER etapa.
// Caso real (garantias, 04/08/2026): as peças só chegam DEPOIS do serviço;
// a OS já está em Executada/Preenchimento Garantia/Concluída sem PPV e não
// havia como criar um pelo drawer (o toggle "gerar PPV" é só da criação).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const body = await req.json().catch(() => ({}));
  const userName = String(body.userName || "Sistema");

  const { data: osRes } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Os_Cliente, Os_Tecnico, Status, ID_PPV, Servico_Interno")
    .eq("Id_Ordem", idOs)
    .limit(1);
  if (!osRes?.length) return NextResponse.json({ error: `OS ${idOs} não encontrada.` }, { status: 404 });
  const os = osRes[0];

  // próximo id PPV (mesma lógica da criação de OS). O filtro "PPV-%" é no
  // BANCO: "REM-..." ordena acima de "PPV-..." como texto, então os 50 últimos
  // viram só remessas quando elas passarem de 50 — e a numeração recomeçaria
  // do 0001, colidindo com pedido existente.
  const { data: ultimos } = await supabase
    .from(TBL_PEDIDOS)
    .select("id_pedido")
    .like("id_pedido", "PPV-%")
    .order("id_pedido", { ascending: false })
    .limit(50);
  let maxNum = 0;
  for (const row of ultimos || []) {
    const m = String(row.id_pedido || "").match(/^PPV-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const novoPPV = `PPV-${String(maxNum + 1).padStart(4, "0")}`;

  const agora = new Date();
  const dataFormatada = `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;

  // Fase do PPV acompanha a da OS; em fase final (concluída/fechada) o PPV
  // nasce "Aguardando Para Faturar" — as peças adicionadas agora AINDA vão
  // ser faturadas/remessadas
  let statusPPV = POS_TO_PPV_STATUS[String(os.Status || "").trim()] || "Em Andamento";
  if (/conclu|fechad|cancel/i.test(statusPPV)) statusPPV = "Aguardando Para Faturar";

  const { error: ppvErr } = await supabase.from(TBL_PEDIDOS).insert({
    id_pedido: novoPPV,
    // OS interna: peças saem por remessa (mesma regra do fluxo de criação)
    Tipo_Pedido: os.Servico_Interno ? "Remessa" : "Pedido",
    cliente: os.Os_Cliente || "",
    tecnico: os.Os_Tecnico || "",
    status: statusPPV,
    valor_total: 0,
    observacao: `Criado pela OS ${idOs} (peças pós-serviço)`,
    Motivo_Saida_Pedido: "Saida Tecnico (Com OS)",
    email_usuario: userName,
    Id_Os: idOs,
    data: dataFormatada,
  });
  if (ppvErr) return NextResponse.json({ error: `Falha ao criar o PPV: ${ppvErr.message}` }, { status: 500 });

  const idPpvNovo = os.ID_PPV ? `${os.ID_PPV},${novoPPV}` : novoPPV;
  const { error: osErr } = await supabase.from(TBL_OS).update({ ID_PPV: idPpvNovo }).eq("Id_Ordem", idOs);
  if (osErr) return NextResponse.json({ error: `PPV ${novoPPV} criado, mas falhou vincular na OS: ${osErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, ppv: novoPPV, idPpv: idPpvNovo, status: statusPPV });
}
