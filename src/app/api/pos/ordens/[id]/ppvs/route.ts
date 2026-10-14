// PPVs vinculados à OS (José, 14/10/2026): vincular, desvincular e, ao
// desvincular, opcionalmente CANCELAR o PPV com motivo (cancela no Omie também,
// se já foi enviado — mesmo fluxo do botão Cancelar do PPV).
//   POST { vincular: string[], desvincular: { id, cancelar, motivo }[], userName? }
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV, temModuloPPVouPOS } from "@/lib/ppv/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { vincularPPVnaOS, registrarLog } from "@/lib/ppv/queries";
import { cancelarPedidoVendaOmie } from "@/lib/ppv/omie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Desv { id: string; cancelar?: boolean; motivo?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPVouPOS(auth)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id: idOs } = await params;
  const body = await req.json().catch(() => ({}));
  const usuario = String(body.userName || auth.email || "Portal");
  const vincular: string[] = (Array.isArray(body.vincular) ? body.vincular : []).map((x: unknown) => String(x).trim()).filter(Boolean);
  const desvincular: Desv[] = (Array.isArray(body.desvincular) ? body.desvincular : []).filter((x: Desv) => x && x.id);

  const { data: os } = await supabase.from(TBL_OS).select("Id_Ordem, ID_PPV, faturado_omie_em").eq("Id_Ordem", idOs).maybeSingle();
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });

  // confere antes de mexer: cancelar exige o módulo PPV e motivo; faturado não cancela aqui
  const cancelar = desvincular.filter((d) => d.cancelar);
  if (cancelar.length && !temModuloPPV(auth)) return NextResponse.json({ error: "Para cancelar PPV você precisa do módulo PPV." }, { status: 403 });
  for (const d of cancelar) if (!String(d.motivo || "").trim()) return NextResponse.json({ error: `Informe o motivo do cancelamento do ${d.id}.` }, { status: 400 });
  if (cancelar.length) {
    const { data: peds } = await supabase.from("pedidos").select("id_pedido, faturado_omie_em").in("id_pedido", cancelar.map((d) => d.id));
    const fat = (peds || []).filter((p) => p.faturado_omie_em).map((p) => p.id_pedido);
    if (fat.length) return NextResponse.json({ error: `${fat.join(", ")} já foi faturado — cancele a NF-e antes (não dá para cancelar por aqui).` }, { status: 409 });
  }

  const avisos: string[] = [];
  let lista = String(os.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);

  // 1) desvincular (e cancelar quando pedido)
  for (const d of desvincular) {
    if (d.cancelar) {
      const r = await cancelarPedidoVendaOmie(d.id, String(d.motivo), usuario);
      if (!r.sucesso) { avisos.push(`${d.id}: não cancelou (${r.erro}) — continua vinculado.`); continue; }
    }
    lista = lista.filter((x) => x !== d.id);
    await supabase.from("pedidos").update({ Id_Os: "" }).eq("id_pedido", d.id);
    await registrarLog(d.id, `Desvinculado da ${idOs}${d.cancelar ? ` e cancelado — motivo: ${d.motivo}` : " (continua ativo)"}`, usuario).catch(() => {});
  }
  // 2) vincular (tira de outra OS, se estava)
  for (const v of vincular) {
    if (lista.includes(v)) continue;
    await vincularPPVnaOS(idOs, v);
    await supabase.from("pedidos").update({ Id_Os: idOs }).eq("id_pedido", v);
    lista.push(v);
    await registrarLog(v, `Vinculado à ${idOs}`, usuario).catch(() => {});
  }

  const novo = lista.join(", ");
  await supabase.from(TBL_OS).update({ ID_PPV: novo || null }).eq("Id_Ordem", idOs);
  // PPV que entrou na OS: categoria, previsão e parcelas passam a seguir a OS
  if (vincular.length) {
    const { sincronizarPPVsComOS } = await import("@/lib/ppv/sync-os");
    for (const v of vincular) await sincronizarPPVsComOS(idOs, { soPPV: v, usuario }).catch(() => {});
  }
  const agora = new Date();
  const mudou = [...vincular.map((v) => `+${v}`), ...desvincular.map((d) => `-${d.id}${d.cancelar ? " (cancelado)" : ""}`)].join(" ");
  if (mudou) await supabase.from(TBL_LOGS_PPO).insert({ Id_ppo: idOs, Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR"), UsuEmail: usuario, acao: `PPVs vinculados alterados: ${mudou}` }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, ppv: novo, avisos });
}
