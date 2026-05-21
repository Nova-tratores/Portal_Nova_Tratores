import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAccount, anexarDocumentosContaPagarOmie } from "@/lib/financeiro/omie-contapagar";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// =====================================================================
// POST — (re)envia os anexos (NF, boletos, requisições, XML) de um
// lançamento de conta a pagar JÁ criado no Omie. Não recria a conta.
//   body: { finanPagarId, empresa? }
// =====================================================================
export async function POST(req: NextRequest) {
  let body: { finanPagarId?: number | string; empresa?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  if (!body.finanPagarId) {
    return NextResponse.json({ ok: false, erro: "finanPagarId obrigatório." }, { status: 400 });
  }

  try {
    const { data: row, error } = await supabase
      .from("finan_pagar")
      .select("*")
      .eq("id", body.finanPagarId)
      .single();
    if (error || !row) {
      return NextResponse.json({ ok: false, erro: `Registro finan_pagar #${body.finanPagarId} não encontrado.` }, { status: 404 });
    }

    if (!row.omie_cod_lancamento) {
      return NextResponse.json({ ok: false, erro: "Esta conta ainda não foi enviada ao Omie." }, { status: 200 });
    }

    const acc = getAccount(body.empresa || row.omie_empresa);
    const codigoLancamento = Number(String(row.omie_cod_lancamento).split(",")[0].trim());
    if (!codigoLancamento) {
      return NextResponse.json({ ok: false, erro: "Código de lançamento Omie inválido." }, { status: 200 });
    }

    const anexos = await anexarDocumentosContaPagarOmie(row as Record<string, unknown>, codigoLancamento, acc);
    return NextResponse.json({ ok: true, anexos });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[contas-pagar/omie/anexos]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 200 });
  }
}
