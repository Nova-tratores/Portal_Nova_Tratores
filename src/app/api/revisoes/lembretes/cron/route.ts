import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET || "";

// GET — verificar lembretes que já passaram da data_hora e notificar
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agora = new Date().toISOString();

  // Buscar lembretes pendentes cuja data_hora já passou
  const { data: pendentes, error } = await supabase
    .from("revisao_lembretes")
    .select("*")
    .eq("notificado", false)
    .lte("data_hora", agora);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pendentes || pendentes.length === 0) {
    return NextResponse.json({ msg: "Nenhum lembrete pendente", total: 0 });
  }

  // Buscar info dos tratores para a mensagem
  const tratorIds = [...new Set(pendentes.map(l => l.trator_id))];
  const { data: tratores } = await supabase
    .from("Tratores_Revisao")
    .select("id, Modelo, Chassis, Cliente")
    .in("id", tratorIds);

  const tratorMap: Record<string, { modelo: string; chassis: string; cliente: string }> = {};
  (tratores || []).forEach((t: any) => {
    tratorMap[String(t.id)] = { modelo: t.Modelo || "", chassis: t.Chassis || "", cliente: t.Cliente || "" };
  });

  let notificados = 0;

  for (const lembrete of pendentes) {
    const trator = tratorMap[lembrete.trator_id] || { modelo: "?", chassis: "?", cliente: "?" };
    const titulo = `Lembrete: Enviar cheque de revisão`;
    const descricao = `${trator.modelo} - ${trator.cliente} (${trator.chassis})${lembrete.mensagem ? ` — ${lembrete.mensagem}` : ""}`;

    // Criar notificação para o usuário alvo
    const { error: notifErr } = await supabase.from("portal_notificacoes").insert({
      user_id: lembrete.user_id,
      tipo: "revisao",
      titulo,
      descricao,
      link: "/revisoes",
    });

    if (!notifErr) {
      await supabase.from("revisao_lembretes").update({ notificado: true }).eq("id", lembrete.id);
      notificados++;
    }
  }

  return NextResponse.json({ total: pendentes.length, notificados });
}
