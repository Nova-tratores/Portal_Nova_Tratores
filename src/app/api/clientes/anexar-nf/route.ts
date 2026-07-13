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
    const { tipo, num, empresa, pdf_url, num_nf, gerarCard } = await req.json();
    if (!tipo || !num || !empresa || !pdf_url) {
      return NextResponse.json({ error: "tipo, num, empresa e pdf_url são obrigatórios" }, { status: 400 });
    }
    // Checkbox da pasta: por padrão gera o card; se vier gerarCard:false, só anexa/substitui o arquivo.
    const criarCard = gerarCard !== false;
    const origin = req.nextUrl.origin;
    const numStr = String(num);

    if (tipo === "os") {
      const upd: Record<string, string> = { link_nf: pdf_url };
      if (num_nf) upd.num_nf = String(num_nf);
      const { error } = await supabase.from("portal_nt_clientes_os")
        .update(upd).eq("num_os", numStr).eq("empresa", empresa);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Marca que a nota foi anexada DE PROPÓSITO (é isso que autoriza o card quando a
      // NFS-e não existe no Omie). Update separado pra não estragar o de cima se a
      // coluna ainda não existir.
      await supabase.from("portal_nt_clientes_os").update({ nf_manual: true })
        .eq("num_os", numStr).eq("empresa", empresa);

      // Com a NF de serviço na pasta, o serviço pode estar completo → cria o card (se pedido)
      let card: any = null;
      if (criarCard) {
        const { data: os } = await supabase.from("portal_nt_clientes_os")
          .select("cod_os").eq("num_os", numStr).eq("empresa", empresa).maybeSingle();
        if (os?.cod_os) {
          card = await fetch(`${origin}/api/financeiro/sync-os?codOS=${os.cod_os}`, { method: "POST" })
            .then(r => r.json()).catch(() => null);
        }
      }
      return NextResponse.json({ ok: true, tipo, num: numStr, gerouCard: criarCard, card });
    }

    if (tipo === "pv") {
      const upd: Record<string, string> = { link_nf: pdf_url };
      if (num_nf) upd.numero_nf = String(num_nf);
      const { error } = await supabase.from("portal_nt_clientes_pv")
        .update(upd).eq("num_pedido", numStr).eq("empresa", empresa);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Idem: marca o anexo manual (é o que autoriza o card quando a NF-e não saiu no Omie)
      await supabase.from("portal_nt_clientes_pv").update({ nf_manual: true })
        .eq("num_pedido", numStr).eq("empresa", empresa);

      let card: any = null;
      let via: string | null = null;
      if (criarCard) {
        // A peça tem OS vinculada? Então o card é o COMBINADO (serviço + peça) e sai pelo
        // sync-os — o sync-pecas PULA de propósito os PV que têm OS ("card sai pelo sync de OS").
        // Chamar sync-pecas aqui não geraria card nenhum.
        const { data: osLig } = await supabase.from("portal_nt_clientes_os")
          .select("cod_os, num_pedido_cli").eq("empresa", empresa)
          .ilike("num_pedido_cli", `%${numStr}%`).limit(30);
        const osDaPeca = (osLig || []).find((o: any) =>
          ((String(o.num_pedido_cli).match(/\d+/g) || []) as string[]).includes(numStr)
        );

        if (osDaPeca?.cod_os) {
          via = "sync-os (card combinado serviço + peça)";
          card = await fetch(`${origin}/api/financeiro/sync-os?codOS=${osDaPeca.cod_os}`, { method: "POST" })
            .then(r => r.json()).catch(() => null);
        } else {
          via = "sync-pecas (peça avulsa)";
          card = await fetch(`${origin}/api/financeiro/sync-pecas?dias=30`, { method: "POST" })
            .then(r => r.json()).catch(() => null);
        }
      }
      return NextResponse.json({ ok: true, tipo, num: numStr, gerouCard: criarCard, via, card });
    }

    return NextResponse.json({ error: "tipo inválido (use 'os' ou 'pv')" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
