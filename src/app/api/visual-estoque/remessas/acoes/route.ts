import { NextRequest, NextResponse } from "next/server";
import { getContasOmie, type Conta } from "@/lib/estoque/conta";
import {
  sincronizarRemessas,
  sincronizarMovimentacao,
  sincronizarOutrasEntradas,
  cruzarDevolucoes,
  verificarSuspeitas,
} from "@/lib/visual-estoque/remessas-sync";

export const runtime = "nodejs";
export const maxDuration = 300; // operações Omie podem ser longas

// Ações manuais da tela Remessas, acionadas pelos botões da UI:
//   acao = 'sync'        -> remessas + movimentação + outras entradas
//   acao = 'devolucoes'  -> cruza notas de entrada x remessas (Retorno/Devolvida)
//   acao = 'suspeitas'   -> MovimentoEstoque por produto (PESADO) -> Suspeita
// `conta` aceita 'todas' | 'nova' | 'castro'.
export async function POST(req: NextRequest) {
  try {
    const { acao, conta } = await req.json();
    const contas = getContasOmie()
      .map((c) => c.id)
      .filter((id: Conta) => !conta || conta === "todas" || String(id).toLowerCase() === String(conta).toLowerCase());

    if (contas.length === 0) return NextResponse.json({ erro: "Conta inválida" }, { status: 400 });

    const resultados: Record<string, unknown> = {};
    for (const c of contas) {
      if (acao === "sync") {
        const remessas = await sincronizarRemessas(c);
        const movimentacao = await sincronizarMovimentacao(c);
        const outrasEntradas = await sincronizarOutrasEntradas(c);
        resultados[c] = { remessas, movimentacao, outrasEntradas };
      } else if (acao === "devolucoes") {
        resultados[c] = await cruzarDevolucoes(c);
      } else if (acao === "suspeitas") {
        resultados[c] = await verificarSuspeitas(c);
      } else {
        return NextResponse.json({ erro: "Ação inválida" }, { status: 400 });
      }
    }
    return NextResponse.json({ sucesso: true, resultados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
