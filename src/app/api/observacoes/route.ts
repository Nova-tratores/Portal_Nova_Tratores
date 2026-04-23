import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIPOS_VALIDOS = ['geral', 'em_banco', 'certificado_pendente', 'pendencia_cliente', 'outro'];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tratorId = searchParams.get('trator_id');
  const chassis = searchParams.get('chassis');
  const tipo = searchParams.get('tipo');
  const status = searchParams.get('status'); // 'ativa' | 'resolvida' | 'todas'

  let query = supabase
    .from('trator_observacoes')
    .select('*')
    .order('created_at', { ascending: false });

  if (tratorId) query = query.eq('trator_id', tratorId);
  if (chassis) query = query.eq('chassis', chassis);
  if (tipo) query = query.eq('tipo', tipo);
  if (status && status !== 'todas') query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar observações:', error.message);
    return NextResponse.json({ error: 'Falha ao buscar observações.' }, { status: 500 });
  }

  return NextResponse.json({ total: data?.length || 0, observacoes: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { trator_id, chassis, tipo, texto, userName, userEmail } = body;

  if (!trator_id || !chassis || !texto) {
    return NextResponse.json(
      { error: 'trator_id, chassis e texto são obrigatórios.' },
      { status: 400 }
    );
  }

  const tipoFinal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'geral';

  const { data, error } = await supabase
    .from('trator_observacoes')
    .insert({
      trator_id,
      chassis,
      tipo: tipoFinal,
      texto,
      criado_por_email: userEmail || null,
      criado_por_nome: userName || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar observação:', error.message);
    return NextResponse.json({ error: 'Falha ao criar observação.' }, { status: 500 });
  }

  return NextResponse.json({ observacao: data });
}
