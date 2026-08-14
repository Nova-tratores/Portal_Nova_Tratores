// Perfil fiscal por produto (editável no portal, antes de enviar ao Omie).
//   GET   ?conta=NOVA&codigoProduto=123           -> lê do banco (ou defaults)
//   PATCH { conta, codigoProduto, codigo, fiscal, userName, ppvId? }
//         -> salva no banco; se ppvId e o pedido já existe no Omie (não faturado),
//            empurra a alteração pro pedido também (best-effort).
import { NextRequest, NextResponse } from "next/server";
import { obterProdutoFiscal, salvarProdutoFiscal, type FiscalBlocos } from "@/lib/ppv/produto-fiscal";
import { alterarItemFiscalPPV } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const conta = req.nextUrl.searchParams.get("conta") || "NOVA";
  const codigoProduto = Number(req.nextUrl.searchParams.get("codigoProduto"));
  if (!codigoProduto) return NextResponse.json({ error: "codigoProduto obrigatório" }, { status: 400 });

  try {
    const fiscal = await obterProdutoFiscal(conta, codigoProduto);
    return NextResponse.json(fiscal);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API produto-fiscal GET] ${codigoProduto}/${conta}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const conta: string = body?.conta || "NOVA";
    const codigoProduto: number = Number(body?.codigoProduto);
    const codigo: string = body?.codigo || "";
    const fiscal: FiscalBlocos = body?.fiscal;
    const userName: string = body?.userName || auth.email || "Sistema";
    const ppvId: string | undefined = body?.ppvId;
    if (!codigoProduto || !fiscal) {
      return NextResponse.json({ error: "codigoProduto e fiscal são obrigatórios" }, { status: 400 });
    }

    const res = await salvarProdutoFiscal(conta, codigoProduto, codigo, fiscal, userName);
    if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 400 });

    // Se o pedido já existe no Omie e não está faturado, aplica lá também (best-effort).
    let avisoOmie: string | null = null;
    if (ppvId && codigo) {
      const patch = {
        cfop: fiscal.cfop,
        icms: fiscal.icms,
        icmsSt: fiscal.icmsSt,
        ipi: fiscal.ipi,
        pis: fiscal.pis,
        cofins: fiscal.cofins,
      };
      const r = await alterarItemFiscalPPV(ppvId, codigo, patch);
      if (!r.ok) avisoOmie = r.erro || null; // não bloqueia o salvamento no banco
    }

    await registrarAuditLog({
      userName, sistema: "ppv", acao: "editar",
      entidade: "produto-fiscal", entidadeId: String(codigoProduto), entidadeLabel: `Fiscal ${codigo || codigoProduto} (${conta})`,
      detalhes: { fiscal, ppvId, avisoOmie },
    });

    return NextResponse.json({ success: true, avisoOmie });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API produto-fiscal PATCH] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
