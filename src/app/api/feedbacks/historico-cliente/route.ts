import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { montarHistoricoCompleto } from "@/lib/feedbacks/atendimento/historico-db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/feedbacks/historico-cliente?key=omie_<cod>|nome_<NOME>[&nome=]
// Janela "Histórico do cliente" do CRM/RFM e das Oportunidades: OS com o PV
// de peças dentro, compras de balcão, máquinas do CPF/CNPJ com as revisões
// Mahindra e requisições. Só leitura (service role).
// Quem abre a janela tem o módulo Feedbacks (qualquer aba), não
// necessariamente `feedbacks:atendimento` — por isso a guarda é o módulo.
export type { HistoricoClienteCompleto } from "@/lib/feedbacks/atendimento/historico-db";

const ACESSO = [{ modulo: "feedbacks" }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const key = (req.nextUrl.searchParams.get("key") || "").trim();
  const nome = (req.nextUrl.searchParams.get("nome") || "").trim() || null;
  try {
    const h = await montarHistoricoCompleto(key, nome);
    if ("erro" in h) return NextResponse.json(h, { status: 400 });
    return NextResponse.json(h);
  } catch (e) {
    console.error("[feedbacks/historico-cliente]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar o histórico" }, { status: 500 });
  }
}
