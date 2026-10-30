// /api/agro/painel/rest/v1/... — dados do Dashboard Agro com o login de quem abriu.
// A lista do que pode passar está em lib/agro/painel/proxy.ts.
import { NextResponse } from 'next/server';
import { guardarAgro, erroAgro } from '@/lib/agro/server';
import { avaliarPedido } from '@/lib/agro/painel/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ caminho: string[] }> };

async function repassar(req: Request, ctx: Ctx, metodo: 'GET' | 'POST') {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const { caminho } = await ctx.params;
    const url = new URL(req.url);
    const a = avaliarPedido(metodo, caminho, url.searchParams);
    if (!a.ok) return NextResponse.json({ error: a.erro }, { status: a.status });
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${a.caminho}${url.search}`, {
      method: metodo,
      headers: {
        apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json',
        ...(a.prefer ? { Prefer: a.prefer } : {}),
      },
      ...(metodo === 'POST' ? { body: await req.text() } : {}),
      cache: 'no-store',
    });
    return new Response(r.status === 204 ? null : await r.text(), {
      status: r.status,
      headers: { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return erroAgro(e, 'painel rest');
  }
}

export const GET = (req: Request, ctx: Ctx) => repassar(req, ctx, 'GET');
export const POST = (req: Request, ctx: Ctx) => repassar(req, ctx, 'POST');
