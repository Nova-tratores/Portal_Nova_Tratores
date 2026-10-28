// Lê a nota anexada numa requisição (chave da DANFE → IA → conferência com o Omie).
// POST { reqId, campo } → { dados, fonte, notaOmieId, avisos }. Só lê: quem grava é a tela,
// depois que a pessoa clica em "Usar estes dados" (José, 23/10/2026).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { lerNotaDaRequisicao } from '@/lib/requisicoes/ler-nota-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }]);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const reqId = Number(body?.reqId);
  const campo = String(body?.campo || 'foto_nf');
  if (!reqId) return NextResponse.json({ error: 'reqId obrigatório' }, { status: 400 });
  try {
    // texto = o PDF lido pelo navegador; imagem = 1ª página do PDF sem texto, desenhada pelo navegador
    return NextResponse.json(await lerNotaDaRequisicao(reqId, campo, {
      texto: typeof body?.texto === 'string' ? body.texto : null,
      imagem: typeof body?.imagem === 'string' ? body.imagem : null,
    }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não consegui ler a nota' }, { status: 422 });
  }
}
