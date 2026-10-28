// "Guardar agora": busca PDF + XML de UMA nota na Omie e grava no cache.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { podeVerEntrada } from '@/lib/notas/cache-regras';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { COLS, guardarNota, migracaoFaltando } from '@/lib/notas/cache-docs';
import { selo, type LinhaDoc } from '@/lib/notas/cache-regras';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'financeiro', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const idNum = parseInt(id, 10);
  if (!idNum) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin.from('notas_fiscais_docs').select(COLS).eq('id', idNum).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ erro: 'nota não encontrada' }, { status: 404 });
    if ((data as unknown as LinhaDoc).tipo === 'entrada' && !podeVerEntrada(guarda.user.isAdmin, guarda.user.modulos)) {
      return NextResponse.json({ erro: 'Nota de entrada: precisa da permissão de Recebimentos.' }, { status: 403 });
    }
    const r = await guardarNota(data as unknown as LinhaDoc);
    const { data: depois } = await supabaseAdmin.from('notas_fiscais_docs').select(COLS).eq('id', idNum).maybeSingle();
    const l = (depois || data) as unknown as LinhaDoc;
    const status = r.bloqueio || r.omieFora ? 503 : 200;
    return NextResponse.json({ ...r, nota: l, selo: selo(l) }, { status });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (migracaoFaltando(msg)) return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco.', migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
