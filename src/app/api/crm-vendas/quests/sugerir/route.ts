// POST /api/crm-vendas/quests/sugerir — "Gerar sugestões agora" do supervisor
// no app de vendas: roda as regras das quests automáticas e grava as sugestões
// novas (status `sugerida`). Body opcional { limite?: number, simular?: boolean }.
// O mesmo motor roda todo dia às 06:30 pelo agendador (vendas-quests-sugerir).
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas } from '@/lib/vendas-app/quem';
import { sugerirQuests } from '@/lib/vendas-app/quests-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'POST, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'POST, OPTIONS') });
}

export async function POST(req: NextRequest) {
  const quem = await quemChamaVendas(req);
  if (!quem) return json(req, { error: 'Entre no app para continuar.' }, 401);
  if (quem.tipo !== 'supervisor') return json(req, { error: 'Só o supervisor gera sugestões.' }, 403);
  const body = await req.json().catch(() => ({})) as { limite?: number; simular?: boolean };
  try {
    const r = await sugerirQuests({ limite: Number(body.limite) || 10, gravar: !body.simular });
    if (r.pulado) return json(req, { ...r, migracaoFaltando: true, error: 'Falta aplicar supabase-quests.sql no banco.' }, 503);
    return json(req, r);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
