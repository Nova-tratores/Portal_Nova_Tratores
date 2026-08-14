// POST /api/ppv/custo-cmc  { itens: [{ codigo, conta, qtd }] }
// Custo Total (CMC) do pedido lido DO BANCO (produtos.cmc), pela conta certa de
// cada item — rápido e sem bater no Omie (que bloqueia/atrasa). Cada falha loga.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/estoque/supabase";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ItemEntrada { codigo?: string; conta?: string; qtd?: number }

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const itens: ItemEntrada[] = Array.isArray(body?.itens) ? body.itens : [];
    let total = 0;
    const detalhe: Array<{ codigo: string; conta: string; cmc: number; qtd: number; achou: boolean }> = [];

    for (const it of itens) {
      const codigo = String(it.codigo || "").trim();
      const conta = String(it.conta || "NOVA").toLowerCase();
      const qtd = Number(it.qtd) || 0;
      if (!codigo || qtd <= 0) continue;
      const { data, error } = await supabase
        .from("produtos").select("cmc").eq("conta_omie", conta).eq("codigo", codigo).limit(1);
      if (error) console.error(`[custo-cmc] ler produtos (${codigo}/${conta}): ${error.message}`);
      const achou = !!data && data.length > 0;
      const cmc = achou ? Number(data[0].cmc) || 0 : 0;
      if (!achou) console.error(`[custo-cmc] produto sem CMC no banco: ${codigo} (conta ${conta})`);
      total += cmc * qtd;
      detalhe.push({ codigo, conta, cmc, qtd, achou });
    }

    return NextResponse.json({ total: Math.round(total * 100) / 100, itens: detalhe });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API custo-cmc] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
