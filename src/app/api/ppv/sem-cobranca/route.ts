import { NextRequest, NextResponse } from "next/server";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";
import { buscarPPVPorId } from "@/lib/ppv/queries";
import { marcarSemCobranca, desmarcarSemCobranca, separarSemCobrancaEmRemessa } from "@/lib/ppv/sem-cobranca";

// Peça "não gerar cobrança" — usada pelo PPV e pelo drawer da OS (que mexe nos itens do PPV).
//   { acao: "marcar",    id, codigo, motivo }
//   { acao: "desmarcar", id, codigo }
//   { acao: "separar",   id }  → cria a remessa REM-xxxx com as peças marcadas
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "ppv" }, { modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json();
    const id = String(b?.id || "").trim();
    const codigo = String(b?.codigo || "").trim();
    const por = autorDe(g.user);
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    let r: { erro?: string; novoId?: string; aviso?: string };
    if (b.acao === "marcar") {
      if (!codigo) return NextResponse.json({ error: "codigo obrigatório" }, { status: 400 });
      r = await marcarSemCobranca({ id, codigo, motivo: String(b.motivo || ""), por });
    } else if (b.acao === "desmarcar") {
      if (!codigo) return NextResponse.json({ error: "codigo obrigatório" }, { status: 400 });
      r = await desmarcarSemCobranca({ id, codigo, por });
    } else if (b.acao === "separar") {
      r = await separarSemCobrancaEmRemessa({ id, por });
    } else {
      return NextResponse.json({ error: "ação inválida" }, { status: 400 });
    }
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 409 });
    return NextResponse.json({ ok: true, novoId: r.novoId, aviso: r.aviso, detalhes: await buscarPPVPorId(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
