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
      .select("num_os, empresa, cliente_nome, data_faturamento, num_pedido_cli")
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

    // Não cobra OS cujo PV de peça vinculado ainda NÃO foi faturado — nesse caso o
    // serviço está esperando a PEÇA ser faturada, não a NFS-e. Só cobra quando as duas
    // notas estão prontas (PV faturado) ou quando é serviço sem vínculo de peça.
    // O num_pedido_cli pode vir "4056 CASTRO", "REM 3477", "Interno"... então extrai os
    // dígitos (igual o parsePedidoCliente do sync-os). Se há PV referenciado, só cobra
    // quando ele estiver CONFIRMADAMENTE faturado na pasta (qualquer empresa).
    const pvNumDe = (pc: any): string => (String(pc || "").match(/\d+/g) || []).join("");
    const pvsVinc = [...new Set(lista.map((o: any) => pvNumDe(o.num_pedido_cli)).filter(Boolean))] as string[];
    const pvFaturado = new Map<string, boolean>();
    if (pvsVinc.length) {
      const { data: pvs } = await supabase.from("portal_nt_clientes_pv").select("num_pedido, faturado").in("num_pedido", pvsVinc);
      for (const pv of pvs || []) pvFaturado.set(String(pv.num_pedido), !!pv.faturado);
    }
    lista = lista.filter((o: any) => {
      const num = pvNumDe(o.num_pedido_cli);
      // tem PV referenciado → só cobra se ele estiver faturado; senão (não faturado ou
      // não localizado) espera. Sem PV referenciado → serviço puro, cobra a NFS-e.
      if (num) return pvFaturado.get(num) === true;
      return true;
    });

    if (lista.length === 0) return NextResponse.json({ pendentes: 0 });

    const nomes = lista.slice(0, 5).map((o: any) => `${o.cliente_nome || "?"} (OS ${o.num_os || "?"})`).join(", ");
    const descricao = `${lista.length} OS faturada(s) aguardando a NF de serviço na pasta do cliente${lista.length > 5 ? " (mostrando 5)" : ""}: ${nomes}${lista.length > 5 ? "..." : ""}. Anexe a nota de serviço na pasta pra liberar o card no financeiro.`;

    // Título: com 1 OS, mostra cliente + nº da OS (aparece no sininho, sem precisar
    // abrir a descrição). Com várias, mantém a contagem e a lista fica na descrição.
    const p0 = lista[0] as any;
    const titulo = lista.length === 1
      ? `NF de serviço pendente — ${p0.cliente_nome || "cliente"} (OS ${p0.num_os || "?"})`
      : `NF de serviço pendente na pasta (${lista.length})`;

    await fetch(`${req.nextUrl.origin}/api/financeiro/notificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo,
        descricao,
        link: "/clientes",
        alvo: "posvendas",
        modulo: "lembrete_nf",
      }),
    }).catch(() => {});

    return NextResponse.json({ pendentes: lista.length, notificado: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handler(req); }
export async function GET(req: NextRequest) { return handler(req); }
