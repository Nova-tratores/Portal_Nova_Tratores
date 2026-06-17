import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { invalidarIgnorarCache } from '@/lib/estoque/ignorar-clientes';
import { parseConta } from '@/lib/estoque/conta';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// CRUD de CNPJs ignorados (vendas entre lojas etc.). Portado de
// GET/POST /api/ignorar-clientes (server.js:7012/7024).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    let q = supabase.from('ignorar_clientes').select('*').order('created_at', { ascending: false });
    if (conta) q = q.eq('conta_omie', conta);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message });
    return NextResponse.json({ lista: data || [] });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { cnpj?: string; nome?: string; nota?: string; conta_omie?: string };
    const cnpjLimpo = (body.cnpj || '').replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return NextResponse.json({ erro: 'CNPJ invalido (precisa ter 14 digitos)' });
    const conta = parseConta(body.conta_omie);
    if (!conta) return NextResponse.json({ erro: 'conta_omie obrigatorio (NOVA|CASTRO)' });
    const { data, error } = await supabase
      .from('ignorar_clientes')
      .upsert({ cnpj: cnpjLimpo, nome: body.nome || null, nota: body.nota || null, conta_omie: conta }, { onConflict: 'cnpj,conta_omie' })
      .select();
    if (error) return NextResponse.json({ erro: error.message });
    invalidarIgnorarCache(conta);
    return NextResponse.json({ ok: true, registro: data && data[0] });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
