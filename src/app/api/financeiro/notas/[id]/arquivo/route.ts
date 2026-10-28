// Entrega o PDF ou o XML de uma nota do cache (bucket privado, só logado).
// Sem arquivo guardado → tenta na Omie AGORA (e guarda); Omie fora → 503 {omieFora}.
// PDF: financeiro:notas · XML: financeiro:notas-xml (admin/módulo inteiro passam).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { COLS, guardarNota, lerArquivo, migracaoFaltando } from '@/lib/notas/cache-docs';
import { podeVerEntrada } from '@/lib/notas/cache-regras';
import { nomeArquivo, type LinhaDoc } from '@/lib/notas/cache-regras';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tipo = req.nextUrl.searchParams.get('tipo') === 'xml' ? 'xml' : 'pdf';
  const guarda = await protegerRota(req, [{ modulo: 'financeiro', acao: tipo === 'xml' ? 'notas-xml' : 'notas' }]);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const idNum = parseInt(id, 10);
  if (!idNum) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  try {
    const { data, error } = await supabaseAdmin.from('notas_fiscais_docs').select(COLS).eq('id', idNum).maybeSingle();
    if (error) throw new Error(error.message);
    let l = data as unknown as LinhaDoc | null;
    if (!l) return NextResponse.json({ erro: 'nota não encontrada' }, { status: 404 });
    if (l.tipo === 'entrada' && !podeVerEntrada(guarda.user.isAdmin, guarda.user.modulos)) {
      return NextResponse.json({ erro: 'Nota de entrada: precisa da permissão de Recebimentos.' }, { status: 403 });
    }

    let path = tipo === 'pdf' ? l.pdf_path : l.xml_path;
    if (!path) {
      // fallback ao vivo: busca na Omie e guarda
      const r = await guardarNota(l);
      if (r.bloqueio) return NextResponse.json({ erro: 'Omie bloqueou temporariamente as consultas. Tente em alguns minutos.', bloqueio: true }, { status: 503 });
      if (r.omieFora) return NextResponse.json({ erro: 'Omie indisponível e esta nota ainda não estava guardada.', omieFora: true }, { status: 503 });
      if (r.pendente) return NextResponse.json({ erro: 'A Omie ainda não concluiu esta nota (recebimento pendente).', pendente: true }, { status: 404 });
      const { data: d2 } = await supabaseAdmin.from('notas_fiscais_docs').select(COLS).eq('id', idNum).maybeSingle();
      l = (d2 as unknown as LinhaDoc) || l;
      path = tipo === 'pdf' ? l.pdf_path : l.xml_path;
      if (!path) return NextResponse.json({ erro: r.erro || `A Omie não devolveu o ${tipo.toUpperCase()} desta nota.`, semDocumento: true }, { status: 404 });
    }
    const buf = await lerArquivo(path);
    if (!buf) return NextResponse.json({ erro: 'arquivo não encontrado no storage' }, { status: 404 });
    const nome = nomeArquivo(l, tipo);
    const download = req.nextUrl.searchParams.get('download') === '1' || tipo === 'xml';
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': tipo === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${nome}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Nota-Id': String(l.id),
      },
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (migracaoFaltando(msg)) return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco.', migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
