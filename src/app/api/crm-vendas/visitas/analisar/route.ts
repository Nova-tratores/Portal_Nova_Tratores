// /api/crm-vendas/visitas/analisar — app de vendas: o Claude lê o resumo da visita.
//   POST ContextoAnalise (resumo, próximos passos, pessoas/culturas/negócios da propriedade
//   e as listas permitidas) → { resultado: pessoas, culturas, interesses, retorno, passos }
// Só sugere: nada é gravado. Guarda: vendedor ativo ou supervisor (token do app).
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas } from '@/lib/vendas-app/quem';
import { validarContexto, type ContextoAnalise } from '@/lib/vendas-app/analise-ia';
import { analisarComIA, dentroDoLimite, iaConfigurada, IaRecusou } from '@/lib/vendas-app/analise-ia-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'POST, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'POST, OPTIONS') });
}

export async function POST(req: NextRequest) {
  const quem = await quemChamaVendas(req);
  if (!quem) return json(req, { error: 'Entre no app para continuar.' }, 401);
  if (!iaConfigurada()) return json(req, { error: 'A leitura com IA ainda não foi ligada no portal.', semChave: true }, 503);

  const ctx = (await req.json().catch(() => null)) as ContextoAnalise | null;
  const erro = validarContexto(ctx);
  if (erro) return json(req, { error: erro }, 400);

  const chave = quem.tipo === 'vendedor' ? `v${quem.vendedorId}` : `s${quem.nome}`;
  if (!dentroDoLimite(chave)) return json(req, { error: 'Muitas leituras na última hora. Tente mais tarde.' }, 429);

  try {
    const r = await analisarComIA(ctx!);
    console.log('[vendas-ia] analisar', chave, r.modelo, r.tokens);
    return json(req, { resultado: r.resultado });
  } catch (e) {
    if (e instanceof IaRecusou) return json(req, { error: e.message }, 422);
    console.error('[vendas-ia] erro', (e as Error).message);
    return json(req, { error: 'Não consegui ler agora. Tente de novo em instantes.' }, 502);
  }
}
