import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { sugerirCustoRealProduto } from '@/lib/ajustes/analise';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sugere o CUSTO REAL (para o "CMC a restaurar") de cada item em risco de uma NF
// de garantia. Lê MovimentoEstoque por produto (Omie), então é SOB DEMANDA quando
// o modal de correção abre — não entra no bulk da lista de pendentes.
// Body: { conta, itens: [{ codigoProduto, cmcAtual }] }
// Resp: { sugestoes: { [codigoProduto]: { cmcSugerido, estrategia, baseadoEm, distorcido } } }
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const body = (await req.json().catch(() => ({}))) as {
    conta?: string;
    itens?: Array<{ codigoProduto?: number | string | null; cmcAtual?: number | null }>;
  };
  const contaFinal = parseConta(body.conta) ?? conta;
  const itens = Array.isArray(body.itens) ? body.itens : [];
  const sugestoes: Record<string, any> = {};
  // sequencial de propósito: cada produto faz chamadas ao Omie com sleeps internos;
  // paralelo estouraria o rate limit da API.
  for (const it of itens) {
    const cod = Number(it.codigoProduto);
    if (!Number.isFinite(cod) || cod <= 0) continue;
    try {
      sugestoes[String(cod)] = await sugerirCustoRealProduto(contaFinal, cod, { cmcAtualFallback: it.cmcAtual ?? null });
    } catch (e) {
      sugestoes[String(cod)] = { cmcSugerido: it.cmcAtual ?? null, estrategia: 'erro', baseadoEm: null, distorcido: false, erro: (e as Error).message };
    }
  }
  return NextResponse.json({ sugestoes });
}
