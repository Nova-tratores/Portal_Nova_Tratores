import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { anexarNotaManual, removerNotaManual } from '@/lib/garantias/notas-server';

const GUARDA = [{ modulo: 'garantias', acao: 'analisar' }, { modulo: 'garantias', acao: 'finalizar' }];
const TIPOS = /^(application\/pdf|application\/xml|text\/xml|image\/)/;
const MAX_MB = 15;

// POST /api/garantias/[id]/notas/manual — FormData { papel, numero, data?, valor?, file }
// Nota que não está no sistema, anexada à mão (conta como vinculada).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, GUARDA);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const papel = String(form.get('papel') || '');
  const numero = String(form.get('numero') || '').trim();
  const data = String(form.get('data') || '').trim();
  const valorTxt = String(form.get('valor') || '').trim();
  const file = form.get('file') as File | null;

  if (papel !== 'reembolso' && papel !== 'pecas') return NextResponse.json({ error: 'Tipo de nota inválido.' }, { status: 400 });
  if (!numero) return NextResponse.json({ error: 'Informe o número da nota.' }, { status: 400 });
  if (!file || !file.size) return NextResponse.json({ error: 'Anexe o arquivo da nota (PDF, XML ou foto).' }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Arquivo maior que ${MAX_MB} MB.` }, { status: 400 });
  const tipo = file.type || (/\.xml$/i.test(file.name) ? 'application/xml' : '');
  if (!TIPOS.test(tipo)) return NextResponse.json({ error: 'Envie a nota em PDF, XML ou foto.' }, { status: 400 });
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
  // aceita "1.234,56" ou "1234.56"
  const valor = valorTxt ? Number(valorTxt.includes(',') ? valorTxt.replace(/\./g, '').replace(',', '.') : valorTxt) : null;
  if (valor != null && !Number.isFinite(valor)) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });

  const r = await anexarNotaManual(id, {
    papel, numero, data: data || null, valor,
    arquivo: { nome: file.name, tipo, bytes: Buffer.from(await file.arrayBuffer()) },
    ator: autorDe(guarda.user),
  });
  if (!r.ok) return NextResponse.json({ error: r.erro, migracaoFaltando: r.status === 503 }, { status: r.status });
  return NextResponse.json({ ok: true });
}

// DELETE /api/garantias/[id]/notas/manual?nota=<id>
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, GUARDA);
  if (guarda.resposta) return guarda.resposta;
  const { id } = await params;
  const nota = req.nextUrl.searchParams.get('nota');
  if (!nota) return NextResponse.json({ error: 'Nota não informada.' }, { status: 400 });
  const r = await removerNotaManual(id, nota, autorDe(guarda.user));
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}
