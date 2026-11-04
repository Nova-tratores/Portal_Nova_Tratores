import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { pendentesDeReembolso } from '@/lib/garantias/notas-server';

// GET /api/garantias/reembolso?montadora=<id> — garantias aprovadas ainda sem
// NFS-e de reembolso + as NFS-e já emitidas contra a montadora (só leitura).
export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias' }]);
  if (guarda.resposta) return guarda.resposta;
  const montadora = req.nextUrl.searchParams.get('montadora');
  if (!montadora) return NextResponse.json({ error: 'Informe a montadora.' }, { status: 400 });
  try {
    return NextResponse.json(await pendentesDeReembolso(montadora));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao montar o reembolso.' }, { status: 500 });
  }
}
