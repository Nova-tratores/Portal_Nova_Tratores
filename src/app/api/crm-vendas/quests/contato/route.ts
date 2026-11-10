// /api/crm-vendas/quests/contato — app de vendas: contato do alvo de uma QUEST ou de um NEGÓCIO.
//   GET  ?id=<quest> | ?negocio=<id>  → telefones (Ligar/WhatsApp), endereço e locais
//   POST { id | negocio, falta: ['telefone'|'whatsapp'|'endereco'], obs? } → "Pedir ao suporte":
//        notificação no sino do Mariano no portal (o mesmo pedido em 12 h não repete)
// Guarda: o vendedor DONO da quest/do negócio (token do app) ou supervisor/usuário do portal com o CRM.
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas, type QuemVendas } from '@/lib/vendas-app/quem';
import {
  alvoDaQuest, alvoDoNegocio, carregarNegocio, carregarQuest, contatoDaQuest, contatoDoNegocio, pedirContatoAoSuporte,
  type AlvoPedido, type ContatoQuest,
} from '@/lib/vendas-app/quest-contato-server';
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

interface Achado { quem: NonNullable<QuemVendas>; contato: () => Promise<ContatoQuest>; alvo: (c: ContatoQuest | null) => AlvoPedido }

async function guardarAlvo(req: NextRequest, questId: number, negocioId: number): Promise<{ resposta: NextResponse } | Achado> {
  const quem = await quemChamaVendas(req);
  if (!quem) return { resposta: json(req, { error: 'Entre no app para continuar.' }, 401) };
  const ehDono = (vendedorId: number | null) => quem.tipo !== 'vendedor' || Number(vendedorId) === quem.vendedorId;
  if (Number.isFinite(negocioId) && negocioId > 0) {
    const n = await carregarNegocio(negocioId);
    if (!n) return { resposta: json(req, { error: 'Negócio não encontrado (talvez ainda não sincronizado).' }, 404) };
    if (!ehDono(n.vendedor_id)) return { resposta: json(req, { error: 'Este negócio é de outro vendedor.' }, 403) };
    return { quem, contato: () => contatoDoNegocio(n), alvo: (c) => alvoDoNegocio(n, c) };
  }
  if (!Number.isFinite(questId) || questId <= 0) return { resposta: json(req, { error: 'Quest inválida.' }, 400) };
  const q = await carregarQuest(questId);
  if (!q) return { resposta: json(req, { error: 'Quest não encontrada.' }, 404) };
  if (!ehDono(q.vendedor_id)) return { resposta: json(req, { error: 'Esta quest é de outro vendedor.' }, 403) };
  return { quem, contato: () => contatoDaQuest(q), alvo: (c) => alvoDaQuest(q, c) };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const g = await guardarAlvo(req, Number(sp.get('id')), Number(sp.get('negocio')));
  if ('resposta' in g) return g.resposta;
  try {
    return json(req, { ok: true, ...(await g.contato()) });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { id?: number; negocio?: number; falta?: unknown; obs?: string };
  const g = await guardarAlvo(req, Number(body.id), Number(body.negocio));
  if ('resposta' in g) return g.resposta;
  const falta = normalizarFalta(body.falta);
  if (!falta.length) return json(req, { error: 'Marque o que falta (telefone, WhatsApp ou endereço).' }, 400);
  try {
    let vendedorNome = 'Supervisor';
    if (g.quem.tipo === 'vendedor') {
      const { data } = await supabaseAdmin.from('vendedores').select('nome').eq('id', g.quem.vendedorId).maybeSingle();
      vendedorNome = String(data?.nome || 'Vendedor').trim();
    } else vendedorNome = g.quem.nome;
    const contato = await g.contato().catch(() => null);
    const r = await pedirContatoAoSuporte({ alvo: g.alvo(contato), vendedorNome, falta, obs: body.obs ? String(body.obs).slice(0, 300) : null, contato });
    return json(req, r);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
