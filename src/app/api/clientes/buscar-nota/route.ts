import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { buscarNfeDoPedido, buscarNfseDaOS } from "@/lib/clientes/buscar-nota";
import { falha } from "@/lib/clientes/buscar-nota-erros";

// POST /api/clientes/buscar-nota — botão "Buscar no Omie" do cartão do serviço.
// Body: { tipo: "nfse", empresa, cod_os } | { tipo: "nfe", empresa, num_pedido }
// Resposta: { ok: true, numero, link } | { ok: false, erro, dica, tecnico? }
// (sempre 200 com ok:false nas falhas "de negócio", pra tela mostrar a frase).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return acesso.resposta;
  const body = await req.json().catch(() => ({})) as { tipo?: string; empresa?: string; cod_os?: number; num_pedido?: string };
  const empresa = String(body.empresa || "").trim();
  if (!empresa) return NextResponse.json(falha("Faltou a empresa.", "Recarregue a página e tente de novo."), { status: 400 });

  if (body.tipo === "nfse") {
    const cod = Number(body.cod_os || 0);
    if (!cod) return NextResponse.json(falha("Faltou o código da OS.", "Recarregue a página e tente de novo."), { status: 400 });
    return NextResponse.json(await buscarNfseDaOS(supabaseAdmin, empresa, cod));
  }
  if (body.tipo === "nfe") {
    const num = String(body.num_pedido || "").trim();
    if (!num) return NextResponse.json(falha("Faltou o número do pedido.", "Recarregue a página e tente de novo."), { status: 400 });
    return NextResponse.json(await buscarNfeDoPedido(supabaseAdmin, empresa, num));
  }
  return NextResponse.json(falha("Tipo de nota inválido.", "Recarregue a página e tente de novo."), { status: 400 });
}
