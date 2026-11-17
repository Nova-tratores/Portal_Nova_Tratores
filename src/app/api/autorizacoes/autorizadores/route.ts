// Para quem dá para pedir a autorização da requisição (17/11/2026): Diretor(es) e quem tem "Autorizar requisições"
// na Visão da empresa. Quem cria/edita requisição usa isto para escolher. GET → [{ id, nome, papel }]
import { NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { listarAutorizadores } from '@/lib/autorizacoes/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }, { modulo: 'pos' }, { modulo: 'financeiro' }, { modulo: 'frota' }]);
  if (g.resposta) return g.resposta;
  return NextResponse.json(await listarAutorizadores());
}
