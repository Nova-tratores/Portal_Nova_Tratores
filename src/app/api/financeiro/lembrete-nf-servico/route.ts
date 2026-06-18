import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lembra o Pós-Vendas (a cada 5 min, via scheduler) dos cards de OS que ainda estão
// SEM a NF de serviço anexada — até alguém anexar.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

async function handler(req: NextRequest) {
  try {
    // Cards gerados de OS, ainda ativos, sem o anexo da NF de serviço
    const { data: pend } = await supabase.from("Chamado_NF")
      .select("id, nom_cliente, omie_num_os")
      .eq("origem", "omie_os")
      .not("status", "in", '("concluido","pago")')
      .or("anexo_nf_servico.is.null,anexo_nf_servico.eq.")
      .order("id", { ascending: false })
      .limit(100);

    const lista = pend || [];
    if (lista.length === 0) return NextResponse.json({ pendentes: 0 });

    const nomes = lista.slice(0, 5).map((c: any) => `${c.nom_cliente || "?"} (OS ${c.omie_num_os || "?"})`).join(", ");
    const descricao = `${lista.length} OS sem a NF de serviço anexada${lista.length > 5 ? " (mostrando 5)" : ""}: ${nomes}${lista.length > 5 ? "..." : ""}. Anexe a nota de serviço no card.`;

    await fetch(`${req.nextUrl.origin}/api/financeiro/notificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `NF de serviço pendente de anexo (${lista.length})`,
        descricao,
        link: "/financeiro/home-posvendas",
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
