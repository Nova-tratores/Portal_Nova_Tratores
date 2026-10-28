// Quem chama as rotas /api/crm-vendas/* a partir do app de vendas: o token do
// Supabase do app (Bearer) vira supervisor ativo, vendedor ativo ou usuário do
// portal com o módulo do CRM. Mesma regra da rota do Território.
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';

export type QuemVendas = { tipo: 'vendedor'; vendedorId: number } | { tipo: 'supervisor'; nome: string } | null;

export async function quemChamaVendas(req: NextRequest): Promise<QuemVendas> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const [{ data: sup }, { data: vend }] = await Promise.all([
    supabaseAdmin.from('supervisores').select('nome, ativo').eq('auth_uid', uid).maybeSingle(),
    supabaseAdmin.from('vendedores').select('id, ativo').eq('auth_uid', uid).maybeSingle(),
  ]);
  if (sup && sup.ativo !== false) return { tipo: 'supervisor', nome: String(sup.nome || 'Supervisor') };
  if (vend && vend.ativo !== false) return { tipo: 'vendedor', vendedorId: Number(vend.id) };
  const auth = await autenticar(req);
  if (auth && (auth.isAdmin || auth.modulos.some((m) => m === 'crm-vendas' || m.startsWith('supervisor-vendas')))) {
    return { tipo: 'supervisor', nome: auth.email || 'Portal' };
  }
  return null;
}
