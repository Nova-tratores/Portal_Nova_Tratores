import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GAR_EMAILS } from '@/lib/garantias/constants';
import { protegerRota } from '@/lib/ajustes/permissao-server';

// Conversa com a fábrica (e-mails enviados/recebidos da garantia).

// GET /api/garantias/[id]/emails — lista cronológica
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const { data, error } = await supabase
    .from(TBL_GAR_EMAILS)
    .select('*')
    .eq('garantia_id', id)
    .order('data', { ascending: true });
  if (error) {
    console.error('Erro ao listar emails da garantia:', error.message);
    return NextResponse.json({ error: 'Falha ao listar a conversa.' }, { status: 500 });
  }
  return NextResponse.json({ emails: data || [] });
}

// POST /api/garantias/[id]/emails — marca os recebidos como lidos (padrão chat:
// abrir a seção limpa o "NOVO")
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const { error } = await supabase
    .from(TBL_GAR_EMAILS)
    .update({ lida: true })
    .eq('garantia_id', id)
    .eq('direcao', 'recebido')
    .eq('lida', false);
  if (error) {
    return NextResponse.json({ error: 'Falha ao marcar como lidas.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
