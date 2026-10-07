// Beacon de página vista (PortalLayout → 1 chamada por troca de rota).
// Só incrementa o buffer em memória; o flush ao banco é a cada 60 s
// (instrumentation.ts → descarregarUso). Responde 204 sempre que autenticado.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { registrarUsoPagina } from '@/lib/uso/buffer-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  let rota = '';
  try {
    const b = await req.json();
    rota = String(b?.rota || '');
  } catch { /* corpo vazio */ }
  if (rota) registrarUsoPagina(auth.userId, rota);
  return new NextResponse(null, { status: 204 });
}
