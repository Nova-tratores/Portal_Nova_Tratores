import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { previaDrvg, aplicarDrvg } from '@/lib/garantias/drvg-server';

// POST /api/garantias/reembolso/drvg (FormData: file, montadora, acao=previa|aplicar, criarOs, pedidoCompra)
// previa  = lê a DRVG e mostra o que vai acontecer (não grava nada)
// aplicar = aprova/recusa as garantias pela DRVG e cria a OS de reembolso no POS
export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const montadora = String(form.get('montadora') || '');
  const acao = String(form.get('acao') || 'previa');
  if (!file) return NextResponse.json({ error: 'Escolha a planilha da DRVG (.xlsx).' }, { status: 400 });
  if (!montadora) return NextResponse.json({ error: 'Escolha a montadora.' }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: 'A DRVG precisa ser a planilha (.xlsx) que a fábrica mandou.' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (acao === 'aplicar') {
      const r = await aplicarDrvg(buffer, file.name, montadora, {
        criarOs: form.get('criarOs') !== 'nao',
        pedidoCompra: String(form.get('pedidoCompra') || ''),
      }, autorDe(guarda.user));
      return NextResponse.json(r);
    }
    return NextResponse.json({ previa: await previaDrvg(buffer, montadora) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não consegui ler a DRVG.' }, { status: 400 });
  }
}
