// /api/crm-vendas/quests/contato — app de vendas, tela da quest.
//   GET  ?id=<quest>  → telefones (Ligar/WhatsApp), endereço e locais do cliente/trator da quest
//   POST { id, falta: ['telefone'|'whatsapp'|'endereco'], obs? } → "Pedir ao suporte":
//        notificação no sino do Mariano no portal (o mesmo pedido em 12 h não repete)
// Guarda: o vendedor DONO da quest (token do app) ou supervisor/usuário do portal com o CRM.
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas, type QuemVendas } from '@/lib/vendas-app/quem';
import { carregarQuest, contatoDaQuest, pedirContatoAoSuporte, type QuestAlvo } from '@/lib/vendas-app/quest-contato-server';
import { normalizarFalta } from '@/lib/vendas-app/quest-contato';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'GET, POST, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'GET, POST, OPTIONS') });
}

async function guardarQuest(req: NextRequest, id: number): Promise<{ resposta: NextResponse } | { quem: NonNullable<QuemVendas>; quest: QuestAlvo }> {
  const quem = await quemChamaVendas(req);
  if (!quem) return { resposta: json(req, { error: 'Entre no app para continuar.' }, 401) };
  if (!Number.isFinite(id) || id <= 0) return { resposta: json(req, { error: 'Quest inválida.' }, 400) };
  const quest = await carregarQuest(id);
  if (!quest) return { resposta: json(req, { error: 'Quest não encontrada.' }, 404) };
  if (quem.tipo === 'vendedor' && Number(quest.vendedor_id) !== quem.vendedorId) {
    return { resposta: json(req, { error: 'Esta quest é de outro vendedor.' }, 403) };
  }
  return { quem, quest };
}

export async function GET(req: NextRequest) {
  const g = await guardarQuest(req, Number(req.nextUrl.searchParams.get('id')));
  if ('resposta' in g) return g.resposta;
  try {
    return json(req, { ok: true, ...(await contatoDaQuest(g.quest)) });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { id?: number; falta?: unknown; obs?: string };
  const g = await guardarQuest(req, Number(body.id));
  if ('resposta' in g) return g.resposta;
  const falta = normalizarFalta(body.falta);
  if (!falta.length) return json(req, { error: 'Marque o que falta (telefone, WhatsApp ou endereço).' }, 400);
  try {
    let vendedorNome = 'Supervisor';
    if (g.quem.tipo === 'vendedor') {
      const { data } = await supabaseAdmin.from('vendedores').select('nome').eq('id', g.quem.vendedorId).maybeSingle();
      vendedorNome = String(data?.nome || 'Vendedor').trim();
    } else vendedorNome = g.quem.nome;
    const contato = await contatoDaQuest(g.quest).catch(() => null);
    const r = await pedirContatoAoSuporte({ quest: g.quest, vendedorNome, falta, obs: body.obs ? String(body.obs).slice(0, 300) : null, contato });
    return json(req, r);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
