/* eslint-disable @typescript-eslint/no-explicit-any */
// Importação das respostas para a ficha da ação.
//
// GET  ?link_id=  -> PRÉVIA: o que seria gravado, e onde há conflito.
// POST            -> grava. Campo já preenchido só é trocado com
//                    `sobrescrever: true`, que a tela pede em confirmação.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { previaImportacao, importar } from '@/lib/marketing/questionario-db';
import { logMarketing } from '@/lib/marketing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const linkId = new URL(req.url).searchParams.get('link_id');
    if (!linkId) return NextResponse.json({ error: 'Informe o link' }, { status: 400 });
    return NextResponse.json(await previaImportacao(linkId));
  } catch (e) {
    return erroResposta(e, 'GET /questionario/importar');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'marketing', 'acoes:editar');
  if (g.resposta) return g.resposta;

  try {
    const body = await req.json();
    if (!body?.link_id) return NextResponse.json({ error: 'Informe o link' }, { status: 400 });

    const r = await importar(body.link_id, body.sobrescrever === true);
    await logMarketing(g.auth, {
      acao: 'importar',
      entidade: 'questionario_link',
      entidadeId: String(body.link_id),
      detalhes: r,
    });
    return NextResponse.json(r);
  } catch (e) {
    return erroResposta(e, 'POST /questionario/importar');
  }
}
