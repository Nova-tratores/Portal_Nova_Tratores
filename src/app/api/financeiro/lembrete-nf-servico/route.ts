import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lembra o Pós-Vendas (a cada 5 min, via scheduler) das OS FATURADAS que estão na
// PASTA DO CLIENTE sem a NF de serviço (NFS-e) anexada — e por isso ainda NÃO viraram
// card no financeiro. Ao anexar a NF na pasta, o serviço completa e o card nasce.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

async function handler(req: NextRequest) {
  try {
    const corte = process.env.SYNC_FINANCEIRO_DESDE || "2026-06-18";

    // OS faturadas na pasta, a partir do corte, SEM a NF de serviço (link_nf vazio)
    const { data: osPend } = await supabase.from("portal_nt_clientes_os")
      .select("num_os, empresa, cliente_nome, data_faturamento")
      .eq("faturada", true).eq("cancelada", false)
      .or("link_nf.is.null,link_nf.eq.")
      .gte("data_faturamento", corte)
      .order("data_faturamento", { ascending: false })
      .limit(200);

    let lista = osPend || [];
    // Tira as que já viraram card (no novo fluxo isso é raro, mas garante idempotência)
    const nums = lista.map((o: any) => String(o.num_os));
    if (nums.length) {
      const { data: cards } = await supabase.from("Chamado_NF").select("omie_num_os").in("omie_num_os", nums);
      const carded = new Set((cards || []).map((c: any) => String(c.omie_num_os)));
      lista = lista.filter((o: any) => !carded.has(String(o.num_os)));
    }

    if (lista.length === 0) return NextResponse.json({ pendentes: 0 });

    const nomes = lista.slice(0, 5).map((o: any) => `${o.cliente_nome || "?"} (OS ${o.num_os || "?"})`).join(", ");
    const descricao = `${lista.length} OS faturada(s) aguardando a NF de serviço na pasta do cliente${lista.length > 5 ? " (mostrando 5)" : ""}: ${nomes}${lista.length > 5 ? "..." : ""}. Anexe a nota de serviço na pasta pra liberar o card no financeiro.`;

    await fetch(`${req.nextUrl.origin}/api/financeiro/notificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `NF de serviço pendente na pasta (${lista.length})`,
        descricao,
        link: "/clientes",
        alvo: "posvendas",
      }),
    }).catch(() => {});

    return NextResponse.json({ pendentes: lista.length, notificado: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handler(req); }
export async function GET(req: NextRequest) { return handler(req); }
