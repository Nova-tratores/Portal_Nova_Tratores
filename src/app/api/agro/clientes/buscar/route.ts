/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/agro/clientes/buscar?q= — busca de cliente para VINCULAR a um imóvel (CAR).
// Lê portal_nt_clientes_PRINCIPAL (o mesmo cadastro das visitas do CRM): devolve id_omie, que é o
// que fica gravado em agro_car_cliente_vinculo.cliente_omie_id e o que o cockpit usa pra achar o imóvel.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardarAgro, erroAgro } from '@/lib/agro/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const bruto = (new URL(req.url).searchParams.get('q') || '').trim();
    const q = bruto.replace(/[^\p{L}\p{N}\-./ ]/gu, '').slice(0, 60);      // vai dentro de um or=() do PostgREST
    if (q.length < 3) return NextResponse.json({ clientes: [] });
    const digitos = q.replace(/\D/g, '');
    const filtros = [`nome_fantasia.ilike.%${q}%`, `razao_social.ilike.%${q}%`];
    if (digitos.length >= 5) filtros.push(`cnpj_cpf.ilike.%${digitos}%`);
    const { data, error } = await supabaseAdmin
      .from('portal_nt_clientes_PRINCIPAL')
      .select('id,id_omie,nome_fantasia,razao_social,cnpj_cpf,cidade,estado')
      .or(filtros.join(','))
      .limit(20);
    if (error) throw error;
    const clientes = (data || []).map((c: any) => ({
      id: c.id,
      cliente_omie_id: c.id_omie != null ? String(c.id_omie) : `principal:${c.id}`,
      nome: String(c.nome_fantasia || c.razao_social || `cliente ${c.id}`).trim(),
      razao_social: c.razao_social || null,
      documento: c.cnpj_cpf || null,
      cidade: [c.cidade, c.estado].filter(Boolean).join(' / ') || null,
    }));
    return NextResponse.json({ clientes });
  } catch (e: any) {
    return erroAgro(e, 'clientes/buscar');
  }
}
