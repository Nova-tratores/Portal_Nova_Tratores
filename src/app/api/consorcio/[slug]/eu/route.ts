// Quem é o vendedor logado (26/11/2026, José: "melhor o vendedor entrar com o perfil do portal, pra gente pegar
// certinho por vendedor"). A ficha do vendedor chama isto ao abrir: com login, devolve o nome do perfil.
// GET /api/consorcio/<slug>/eu  ->  { id, nome }  |  401
import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Entre com o seu usuário do portal.' }, { status: 401 });
  const { data } = await db.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  return NextResponse.json({ id: auth.userId, nome: (data?.nome || auth.email || 'Vendedor').trim() });
}
