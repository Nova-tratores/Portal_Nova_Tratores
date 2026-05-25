import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS } from '@/lib/garantias/constants';

// GET /api/garantias/busca?q=&montadora=
// Busca garantias por chassi, número da garantia, OS ou cliente.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const montadora = req.nextUrl.searchParams.get('montadora');

  let query = supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(id,nome,cor), pecas:garantia_pecas(id), pendencias:garantia_pendencias(id,tipo,status,descricao,exige_visita), anexos:garantia_anexos(id,categoria,url,nome_arquivo,created_at)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (q) {
    const termo = q.replace(/[%,]/g, '');
    query = query.or(
      `chassis.ilike.%${termo}%,numero.ilike.%${termo}%,id_ordem.ilike.%${termo}%,cliente.ilike.%${termo}%`
    );
  }
  if (montadora) query = query.eq('montadora_id', montadora);

  const { data, error } = await query;
  if (error) {
    console.error('Erro na busca de garantias:', error.message);
    return NextResponse.json({ error: 'Falha na busca.' }, { status: 500 });
  }
  return NextResponse.json({ garantias: data || [] });
}
