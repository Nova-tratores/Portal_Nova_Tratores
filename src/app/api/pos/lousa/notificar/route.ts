import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TBL_LOUSA, TBL_LOUSA_CONFIG, TBL_OS, TBL_PEDIDOS } from "@/lib/pos/constants";
import { podeNotificar } from "@/lib/notif/prefs";

const CRON_SECRET = process.env.CRON_SECRET || "";

// GET — disparado via cron às 16h — notifica se há OS com pedido PPV na lousa do dia
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Buscar quem recebe a notificação
  const { data: config } = await supabase.from(TBL_LOUSA_CONFIG).select("*").eq("id", 1).maybeSingle();
  if (!config?.notificar_user_id) {
    return NextResponse.json({ msg: "Nenhum usuário configurado para receber notificação" });
  }

  const hoje = new Date().toISOString().slice(0, 10);

  // Buscar entradas da lousa de hoje
  const { data: entradas } = await supabase
    .from(TBL_LOUSA)
    .select("id, cliente_cnpj, cliente_nome")
    .eq("data", hoje);

  if (!entradas || entradas.length === 0) {
    return NextResponse.json({ msg: "Nenhuma entrada na lousa hoje", notificados: 0 });
  }

  const cnpjs = [...new Set(entradas.map((e) => e.cliente_cnpj).filter(Boolean))];
  if (cnpjs.length === 0) {
    return NextResponse.json({ msg: "Nenhum CNPJ para verificar", notificados: 0 });
  }

  // Buscar OS abertas desses clientes
  const { data: ordens } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, CNPJ_CPF_Cliente, Os_Cliente")
    .in("CNPJ_CPF_Cliente", cnpjs)
    .not("Status", "in", '("Concluída","Cancelada")');

  if (!ordens || ordens.length === 0) {
    return NextResponse.json({ msg: "Nenhuma OS aberta para clientes da lousa", notificados: 0 });
  }

  // Verificar quais OS têm pedidos PPV
  const osIds = ordens.map((o: any) => String(o.Id_Ordem));
  const { data: pedidos } = await supabase
    .from(TBL_PEDIDOS)
    .select("Id_Os")
    .in("Id_Os", osIds);

  const osComPedido = new Set((pedidos || []).map((p: any) => String(p.Id_Os)));

  // Filtrar ordens que têm pedido
  const ordensComPPV = ordens.filter((o: any) => osComPedido.has(String(o.Id_Ordem)));

  if (ordensComPPV.length === 0) {
    return NextResponse.json({ msg: "Nenhuma OS com pedido PPV", notificados: 0 });
  }

  // Montar descrição
  const linhas = ordensComPPV.map((o: any) => `OS ${o.Id_Ordem} — ${o.Os_Cliente}`);
  const descricao = `${ordensComPPV.length} OS com pedido de peças (PPV) na agenda de hoje:\n${linhas.join("\n")}`;

  // Respeita as preferências de silenciar do destinatário (módulo 'pos')
  const { data: pref } = await supabase
    .from("portal_permissoes")
    .select("categoria, notif_silenciado")
    .eq("user_id", config.notificar_user_id)
    .maybeSingle();
  if (!podeNotificar("pos", pref?.notif_silenciado, pref?.categoria)) {
    return NextResponse.json({ msg: "Destinatário silenciou notificações de Pós-Vendas", notificados: 0 });
  }

  // Enviar notificação
  await supabase.from("portal_notificacoes").insert({
    user_id: config.notificar_user_id,
    tipo: "pos",
    titulo: "Lousa: OS com pedido de peças hoje",
    descricao,
    link: "/lousa",
  });

  return NextResponse.json({ msg: "Notificação enviada", total_os: ordensComPPV.length });
}
