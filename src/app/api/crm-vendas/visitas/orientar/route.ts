// /api/crm-vendas/visitas/orientar — app de vendas: "Como deixar esta visita melhor?"
//   POST VisitaParaOrientar (resumo, próximos passos e o que já foi preenchido)
//     → { orientacao: { comentario, dicas: [{ campo, dica, pergunta }] } }
// Só orienta: nada é gravado. Guarda: vendedor ativo ou supervisor (token do app).
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas } from '@/lib/vendas-app/quem';
import { validarVisita, type VisitaParaOrientar } from '@/lib/vendas-app/orientar-visita';
import { dentroDoLimite, iaConfigurada, IaRecusou, orientarVisita } from '@/lib/vendas-app/orientar-visita-server';

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
  if (!iaConfigurada()) return json(req, { error: 'As dicas da IA ainda não foram ligadas no portal.', semChave: true }, 503);

  const v = (await req.json().catch(() => null)) as VisitaParaOrientar | null;
  const erro = validarVisita(v);
  if (erro) return json(req, { error: erro }, 400);

  const chave = quem.tipo === 'vendedor' ? `v${quem.vendedorId}` : `s${quem.nome}`;
  if (!dentroDoLimite(chave)) return json(req, { error: 'Muitos pedidos na última hora. Tente mais tarde.' }, 429);

  try {
    const r = await orientarVisita(v!);
    console.log('[vendas-ia] orientar', chave, r.modelo, r.tokens, r.orientacao.dicas.length);
    return json(req, { orientacao: r.orientacao });
  } catch (e) {
    if (e instanceof IaRecusou) return json(req, { error: e.message }, 422);
    console.error('[vendas-ia] erro', (e as Error).message);
    return json(req, { error: 'Não consegui ler agora. Tente de novo em instantes.' }, 502);
  }
}
