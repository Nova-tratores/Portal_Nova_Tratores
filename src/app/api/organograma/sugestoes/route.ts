// GET /api/organograma/sugestoes — rastros do portal por pessoa (últimos 180 dias), para a aba
// Funções sugerir quem ocupa cada função. Só admin (quem pode aceitar). Nada é gravado aqui.
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { contarHistorico } from '@/lib/organograma/historico';
import { DIAS_HISTORICO } from '@/lib/organograma/sugestoes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só administrador' }, { status: 403 });
  try {
    return NextResponse.json({ dias: DIAS_HISTORICO, contagem: await contarHistorico() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
