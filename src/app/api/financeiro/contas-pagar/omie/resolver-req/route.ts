import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccount,
  resolverVendedorProjetoDeReq,
  type ContextoRequisicao,
} from "@/lib/financeiro/omie-contapagar";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// =====================================================================
// POST — resolve vendedor/projeto Omie a partir de dados de uma Requisição
//   body: {
//     empresa?: string,
//     solicitante?: string,
//     ordemServicoId?: string,
//     veiculoId?: number,
//     chassisModelo?: string
//   }
// =====================================================================
export async function POST(req: NextRequest) {
  let body: ContextoRequisicao & { empresa?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  try {
    const acc = getAccount(body.empresa);
    const resolucao = await resolverVendedorProjetoDeReq(
      {
        solicitante: body.solicitante,
        ordemServicoId: body.ordemServicoId,
        veiculoId: body.veiculoId,
        chassisModelo: body.chassisModelo,
      },
      acc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
    );

    return NextResponse.json({ ok: true, empresa: acc.name, ...resolucao });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[resolver-req]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
