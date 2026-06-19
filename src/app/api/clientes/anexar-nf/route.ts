import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/clientes/anexar-nf
// Anexa MANUALMENTE uma nota fiscal na pasta do cliente (a NFS-e de serviço que o Omie
// não fornece em PDF). Salva o link na OS/PV da pasta e, ao completar o serviço, dispara
// a criação do card no financeiro (sync-os / sync-pecas, que respeitam corte + idempotência).
// Body: { tipo: "os" | "pv", num, empresa, pdf_url, num_nf? }
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function POST(req: NextRequest) {
  try {
    const { tipo, num, empresa, pdf_url, num_nf } = await req.json();
    if (!tipo || !num || !empresa || !pdf_url) {
      return NextResponse.json({ error: "tipo, num, empresa e pdf_url são obrigatórios" }, { status: 400 });
    }
    const origin = req.nextUrl.origin;
    const numStr = String(num);

    if (tipo === "os") {
      const upd: Record<string, string> = { link_nf: pdf_url };
      if (num_nf) upd.num_nf = String(num_nf);
      const { error } = await supabase.from("portal_nt_clientes_os")
        .update(upd).eq("num_os", numStr).eq("empresa", empresa);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Com a NF de serviço na pasta, o serviço pode estar completo → cria o card
      const { data: os } = await supabase.from("portal_nt_clientes_os")
        .select("cod_os").eq("num_os", numStr).eq("empresa", empresa).maybeSingle();
      let card: any = null;
      if (os?.cod_os) {
        card = await fetch(`${origin}/api/financeiro/sync-os?codOS=${os.cod_os}`, { method: "POST" })
          .then(r => r.json()).catch(() => null);
      }
      return NextResponse.json({ ok: true, tipo, num: numStr, card });
    }

    if (tipo === "pv") {
      const upd: Record<string, string> = { link_nf: pdf_url };
      if (num_nf) upd.numero_nf = String(num_nf);
      const { error } = await supabase.from("portal_nt_clientes_pv")
        .update(upd).eq("num_pedido", numStr).eq("empresa", empresa);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Peça avulsa: dispara o sync de peças (idempotente, respeita corte)
      const card = await fetch(`${origin}/api/financeiro/sync-pecas?dias=30`, { method: "POST" })
        .then(r => r.json()).catch(() => null);
      return NextResponse.json({ ok: true, tipo, num: numStr, card });
    }

    return NextResponse.json({ error: "tipo inválido (use 'os' ou 'pv')" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
