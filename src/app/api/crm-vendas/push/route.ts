// /api/crm-vendas/push — app de vendas: este celular recebe avisos com o app fechado.
//   GET    → { chave: VAPID pública, ligado }
//   POST   { inscricao } → grava o aparelho do vendedor e manda um aviso de teste
//   DELETE { endpoint }  → para de receber neste aparelho
// Guarda: vendedor ativo (token do app).
import { NextRequest, NextResponse } from 'next/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { quemChamaVendas } from '@/lib/vendas-app/quem';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { enviarPushVendedor, tabelaFaltando, VAPID_PUBLICA } from '@/lib/vendas-app/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METODOS = 'GET, POST, DELETE, OPTIONS';
function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, METODOS) });
}
export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, METODOS) });
}

interface Insc { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
const valida = (i: Insc | undefined): i is Required<Insc> =>
  !!i && typeof i.endpoint === 'string' && i.endpoint.startsWith('https://') && !!i.keys?.p256dh && !!i.keys?.auth;

export async function GET(req: NextRequest) {
  const quem = await quemChamaVendas(req);
  if (!quem) return json(req, { error: 'Entre no app para continuar.' }, 401);
  return json(req, { chave: VAPID_PUBLICA, ligado: !!VAPID_PUBLICA });
}

export async function POST(req: NextRequest) {
  const quem = await quemChamaVendas(req);
  if (!quem) return json(req, { error: 'Entre no app para continuar.' }, 401);
  if (quem.tipo !== 'vendedor') return json(req, { error: 'Os avisos são para o celular do vendedor.' }, 400);
  const { inscricao } = (await req.json().catch(() => ({}))) as { inscricao?: Insc };
  if (!valida(inscricao)) return json(req, { error: 'Inscrição inválida.' }, 400);
  const { error } = await supabaseAdmin.from('vendas_push_inscricoes').upsert({
    endpoint: inscricao.endpoint,
    vendedor_id: quem.vendedorId,
    inscricao: { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.keys.p256dh, auth: inscricao.keys.auth } },
    user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    falhas: 0,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) {
    if (tabelaFaltando(error.message)) return json(req, { error: 'Os avisos no celular ainda não foram ligados no banco.', migracaoFaltando: true }, 503);
    return json(req, { error: error.message }, 500);
  }
  const r = await enviarPushVendedor(quem.vendedorId, { titulo: 'Avisos ligados ✅', corpo: 'Você vai receber os retornos do dia e o lembrete das visitas sem próximo contato.', link: '/notificacoes', tag: 'teste' });
  return json(req, { ok: true, teste: r });
}

export async function DELETE(req: NextRequest) {
  const quem = await quemChamaVendas(req);
  if (!quem) return json(req, { error: 'Entre no app para continuar.' }, 401);
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return json(req, { error: 'Aparelho não informado.' }, 400);
  let q = supabaseAdmin.from('vendas_push_inscricoes').delete().eq('endpoint', endpoint);
  if (quem.tipo === 'vendedor') q = q.eq('vendedor_id', quem.vendedorId);
  await q;
  return json(req, { ok: true });
}
