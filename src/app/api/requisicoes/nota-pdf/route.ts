// PDF de uma nota de entrada (guardado pelo portal no bucket privado notas-fiscais) para ver
// dentro das Requisições ("Ver nota" na confirmação), sem precisar do acesso ao Financeiro.
// GET ?notaId=<notas_entrada.id> → application/pdf
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabase } from '@/lib/pos/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }]);
  if (g.resposta) return g.resposta;
  const notaId = Number(req.nextUrl.searchParams.get('notaId'));
  if (!notaId) return NextResponse.json({ error: 'notaId obrigatório' }, { status: 400 });
  const { data } = await supabase.from('notas_fiscais_docs').select('pdf_path,numero')
    .eq('origem_tabela', 'notas_entrada').eq('origem_id', String(notaId)).not('pdf_path', 'is', null).limit(1).maybeSingle();
  if (!data?.pdf_path) return NextResponse.json({ error: 'O PDF desta nota ainda não foi guardado pelo portal.' }, { status: 404 });
  const { data: arq, error } = await supabase.storage.from('notas-fiscais').download(data.pdf_path);
  if (error || !arq) return NextResponse.json({ error: 'Não consegui abrir o PDF da nota.' }, { status: 502 });
  return new NextResponse(await arq.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="NF-${data.numero || notaId}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
