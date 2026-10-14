// Conferência portal × Omie antes de faturar (José, 14/10/2026).
// GET  → confere a OS e os PPVs dela (só leitura). ?ppvs=PPV-1,PPV-2 limita os pedidos; ?os=0 pula a OS.
// POST → { os: boolean, ppvs: string[] } deixa o Omie igual ao portal e confere de novo.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { conferirOSPublico, alinharOS } from "@/lib/pos/conferencia-omie";
import { conferirPPVPublico, alinharPPV } from "@/lib/ppv/conferencia-omie";
import { podeFaturarOS, podeFaturarPPV } from "@/lib/pos/faturamento";
import { temModuloPPV } from "@/lib/ppv/server";
import { registrarLog } from "@/lib/ppv/queries";
import { temModuloPOS } from "../faturar/comum";
import { nomearDivergencias } from "@/lib/omie/conferencia-nomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function ppvsDaOS(idOs: string): Promise<string[]> {
  const { data: os } = await supabase.from(TBL_OS).select("ID_PPV").eq("Id_Ordem", idOs).limit(1);
  const lista = String(os?.[0]?.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data: porOs } = await supabase.from("pedidos").select("id_pedido, status").eq("Id_Os", idOs);
  const ativos = ((porOs || []) as { id_pedido: string; status?: string }[]).filter((p) => !/cancel/i.test(String(p.status || ""))).map((p) => p.id_pedido);
  return Array.from(new Set([...lista, ...ativos]));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth) && !temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  try {
    const so = req.nextUrl.searchParams.get("ppvs");
    const ids = so !== null ? so.split(",").map((s) => s.trim()).filter(Boolean) : await ppvsDaOS(id);
    const os = req.nextUrl.searchParams.get("os") === "0" ? null : await conferirOSPublico(id);
    const ppvs = [];
    for (const p of ids) ppvs.push(await conferirPPVPublico(p));
    await nomearDivergencias([os, ...ppvs]).catch(() => {});
    return NextResponse.json({ os, ppvs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao conferir com o Omie." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const querOS = !!body?.os;
  const ppvIds: string[] = Array.isArray(body?.ppvs) ? body.ppvs.map(String) : [];
  if (querOS && !(temModuloPOS(auth) && podeFaturarOS(auth))) return NextResponse.json({ error: "Você não tem a permissão \"Faturar OS\" para atualizar a OS no Omie." }, { status: 403 });
  if (ppvIds.length && !(temModuloPPV(auth) || podeFaturarPPV(auth))) return NextResponse.json({ error: "Sem permissão para atualizar os pedidos no Omie." }, { status: 403 });
  const quem = auth.email || "Portal";
  try {
    const os = querOS ? await alinharOS(id) : null;
    if (os && !os.erro) {
      const agora = new Date();
      await supabase.from(TBL_LOGS_PPO).insert({ Id_ppo: id, Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR"), UsuEmail: quem, acao: "OS do Omie atualizada igual ao portal (conferência antes de faturar)", Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0 }).then(() => {}, () => {});
    }
    const ppvs = [];
    for (const p of ppvIds) {
      const r = await alinharPPV(p);
      if (!r.erro) await registrarLog(p, "Pedido do Omie atualizado igual ao portal (conferência antes de faturar)", quem).catch(() => {});
      ppvs.push(r);
    }
    await nomearDivergencias([os, ...ppvs]).catch(() => {});
    return NextResponse.json({ os, ppvs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao atualizar o Omie." }, { status: 500 });
  }
}
