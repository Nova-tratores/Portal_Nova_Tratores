import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { chatwootConfigurado } from "@/lib/chatwoot/config";
import { buscarContatosPorTexto } from "@/lib/chatwoot/cliente";
import { contatosPorCargo, CARGOS_CLIENTE, type ContatoPorCargo } from "@/lib/chatwoot/parsers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Contatos do WhatsApp (NovaZap) por CARGO dentro do cliente. Só leitura.
//   GET ?cargo=Proprietário  (ou sem cargo = todos os 5)
// A busca do fork é ILIKE em custom_attributes::text, então "Tratorista"
// devolve quem tem esse texto em qualquer atributo — o filtro exato por
// cliente_cargo é feito aqui. Até 6 páginas (90 contatos) por cargo.
const PAGINAS = 6;

export interface ContatosResposta { estado: "nao_configurado" | "ok"; contatos: ContatoPorCargo[]; cargos: string[]; truncados: string[] }

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, "feedbacks", "atendimento");
  } catch (e) {
    const err = e as { message?: string; http?: number };
    return NextResponse.json({ erro: err.message || "não autorizado" }, { status: err.http ?? 401 });
  }
  if (!chatwootConfigurado()) {
    const out: ContatosResposta = { estado: "nao_configurado", contatos: [], cargos: CARGOS_CLIENTE, truncados: [] };
    return NextResponse.json(out);
  }
  const pedido = (req.nextUrl.searchParams.get("cargo") || "").trim();
  const cargos = pedido ? [pedido] : CARGOS_CLIENTE;
  const truncados: string[] = [];
  const brutos = [];
  try {
    for (const cargo of cargos) {
      for (let page = 1; page <= PAGINAS; page++) {
        const lote = await buscarContatosPorTexto(cargo, page);
        brutos.push(...lote);
        if (lote.length < 15) break;
        if (page === PAGINAS) truncados.push(cargo);
      }
    }
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message || "NovaZap indisponível" }, { status: 502 });
  }
  const out: ContatosResposta = { estado: "ok", contatos: contatosPorCargo(brutos, cargos), cargos: CARGOS_CLIENTE, truncados };
  return NextResponse.json(out);
}
