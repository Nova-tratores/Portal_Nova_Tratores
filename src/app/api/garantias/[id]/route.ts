import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import {
  TBL_GARANTIAS,
  TBL_GAR_PECAS,
  TBL_GAR_PEND,
  TBL_GAR_ANEXOS,
  TBL_GAR_EVENTOS,
} from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';

// GET /api/garantias/[id] — detalhe completo
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: garantia, error } = await supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar garantia:', error.message);
    return NextResponse.json({ error: 'Falha ao buscar garantia.' }, { status: 500 });
  }
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  const [pecas, pendencias, anexos, eventos] = await Promise.all([
    supabase.from(TBL_GAR_PECAS).select('*').eq('garantia_id', id).order('created_at'),
    supabase.from(TBL_GAR_PEND).select('*').eq('garantia_id', id).order('created_at'),
    supabase.from(TBL_GAR_ANEXOS).select('*').eq('garantia_id', id).order('created_at'),
    supabase.from(TBL_GAR_EVENTOS).select('*').eq('garantia_id', id).order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    garantia: {
      ...garantia,
      pecas: pecas.data || [],
      pendencias: pendencias.data || [],
      anexos: anexos.data || [],
      eventos: eventos.data || [],
    },
  });
}

// PATCH /api/garantias/[id] — assumir a garantia (aberta -> em_analise)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  if (body.acao === 'assumir') {
    if (garantia.status !== 'aberta' && garantia.status !== 'em_analise') {
      return NextResponse.json({ error: 'Esta garantia não pode mais ser assumida.' }, { status: 400 });
    }
    const update: Record<string, unknown> = {
      garantista_nome: body.garantista_nome || null,
      garantista_user_id: body.garantista_user_id || null,
      updated_at: new Date().toISOString(),
    };
    if (garantia.status === 'aberta') update.status = 'em_analise';

    const { data, error } = await supabase
      .from(TBL_GARANTIAS)
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Erro ao assumir garantia:', error.message);
      return NextResponse.json({ error: 'Falha ao assumir garantia.' }, { status: 500 });
    }
    if (garantia.status === 'aberta') {
      await registrarEvento(id, {
        tipo: 'em_analise',
        statusAnterior: 'aberta',
        statusNovo: 'em_analise',
        ator: body.garantista_nome || 'Garantista',
        detalhe: 'Garantia em análise',
      });
    }
    return NextResponse.json({ garantia: data });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}

// DELETE /api/garantias/[id] — só permitido enquanto aberta
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (garantia.status !== 'aberta') {
    return NextResponse.json(
      { error: 'Só é possível excluir garantias ainda não analisadas.' },
      { status: 400 }
    );
  }
  const { error } = await supabase.from(TBL_GARANTIAS).delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'Falha ao excluir garantia.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
