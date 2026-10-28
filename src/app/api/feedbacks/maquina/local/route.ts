import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { locaisDoTrator } from '@/lib/clientes/locais-server';

export const dynamic = 'force-dynamic';

// GET /api/feedbacks/maquina/local?chassi=&cod=
// Onde fica o trator do cliente (fila Hoje: clicar no trator abre o mapa). Só leitura;
// mesmo acesso da janela da máquina (módulo Feedbacks) ou do controle de revisões.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'feedbacks' }, { modulo: 'revisoes' }]);
  if (g.resposta) return g.resposta;
  const p = req.nextUrl.searchParams;
  const chassi = (p.get('chassi') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30) || null;
  const cod = (p.get('cod') || '').replace(/\D/g, '').slice(0, 15) || null;
  if (!chassi && !cod) return NextResponse.json({ ok: false, erro: 'Falta o chassi ou o cliente.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await locaisDoTrator({ chassi, codOmie: cod })) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
