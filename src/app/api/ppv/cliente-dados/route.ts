import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { buscarDadosCliente, buscarDadosClientePorDocumento } from "@/lib/ppv/queries";

// Só as telas do PPV (novo lançamento, detalhe e janela do pedido) usam.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "ppv" }]);
  if (g.resposta) return g.resposta;
  // ?documento= é o caminho CERTO (o nome é ambíguo: há homônimos com CNPJs diferentes).
  const documento = req.nextUrl.searchParams.get("documento") || "";
  if (documento.trim()) {
    return NextResponse.json(await buscarDadosClientePorDocumento(documento.trim()));
  }
  const nome = req.nextUrl.searchParams.get("nome") || "";
  if (!nome.trim()) {
    return NextResponse.json({ documento: "", endereco: "", cidade: "", telefone: "", email: "" });
  }
  const dados = await buscarDadosCliente(nome.trim());
  return NextResponse.json(dados);
}
