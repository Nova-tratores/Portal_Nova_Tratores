// PDF do cheque online de uma OS: GET ?os=OS-0494 [&h=300 → cheque atrasado daquelas horas] (quem tem acesso a Revisões).
// Usado pela tela de Revisões pra anexar o cheque no e-mail à Mahindra.
import { NextRequest, NextResponse } from 'next/server';
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server';
import { ErroCheque, buscarPorOS, garantirCheque } from '@/lib/revisoes/cheque-db';
import { pdfCheque } from '@/lib/revisoes/cheque-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'revisoes');
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não autenticado' }, { status: st });
  }
  const os = String(req.nextUrl.searchParams.get('os') || '').trim();
  if (!os) return NextResponse.json({ error: 'informe ?os=' }, { status: 400 });
  try {
    const h = Number(req.nextUrl.searchParams.get('h') || 0);
    const c = h ? await buscarPorOS(os, h) : await garantirCheque(os);
    if (!c) return NextResponse.json({ error: `A OS ${os} não tem cheque das ${h} horas.` }, { status: 404 });
    const pdf = await pdfCheque(c.dados, { horas: c.horas, assinaturaClienteUrl: c.assinatura_cliente_url, assinaturaTecnicoUrl: c.assinatura_tecnico_url, carimbo: true });
    const nome = `cheque-revisao-${c.horas}h-${c.chassis.slice(-6)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${nome}"`, 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ErroCheque) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.codigo === 'tabela_ausente' ? 503 : 422 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
