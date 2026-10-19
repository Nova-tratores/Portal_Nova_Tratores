// Beacon de página vista (PortalLayout → 1 chamada por troca de rota).
// Só incrementa o buffer em memória; o flush ao banco é a cada 60 s
// (instrumentation.ts → descarregarUso). Responde 204 sempre que autenticado.
// Opcional: {de, gapS, mesmoAlvo, volta} = a transição da tela anterior para
// esta (lib/uso/jornada.ts no navegador). Nunca vem identificador do caso.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { registrarTransicao, registrarUsoPagina } from '@/lib/uso/buffer-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  let rota = '';
  let b: Record<string, unknown> = {};
  try {
    b = (await req.json()) || {};
    rota = String(b?.rota || '');
  } catch { /* corpo vazio */ }
  if (rota) {
    registrarUsoPagina(auth.userId, rota);
    if (typeof b.de === 'string' && b.de) {
      registrarTransicao(auth.userId, {
        de: b.de, para: rota, gapS: Number(b.gapS) || 0,
        mesmoAlvo: b.mesmoAlvo === true, volta: b.volta === true,
      });
    }
  }
  return new NextResponse(null, { status: 204 });
}
