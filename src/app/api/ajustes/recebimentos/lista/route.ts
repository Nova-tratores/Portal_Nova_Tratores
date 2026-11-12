import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { listarRecebimentosEspelho, procurarNoEspelho, atualizarDaOmie, ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET ?conta=NOVA|CASTRO&status=pendentes|concluidos — lista do espelho (rápida, sem Omie).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const status = req.nextUrl.searchParams.get('status') === 'concluidos' ? 'concluidos' : 'pendentes';
  try {
    return NextResponse.json(await listarRecebimentosEspelho(conta, status));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// POST { acao: 'procurar', termo } — procura a nota em qualquer situação no espelho.
// POST { acao: 'atualizar' }       — relê na Omie as notas dos últimos 45 dias (~30 s).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Escolha NOVA ou CASTRO.' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { acao?: string; termo?: string };
  try {
    if (body.acao === 'procurar') return NextResponse.json({ encontrados: await procurarNoEspelho(conta, String(body.termo || '')) });
    if (body.acao === 'atualizar') {
      const r = await atualizarDaOmie(conta);
      if (r.pulado) return NextResponse.json({ ok: true, pulado: true, msg: 'Já há uma atualização rodando; a lista se atualiza em instantes.' });
      if (r.erro) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });
      return NextResponse.json({ ok: true, notas: r.upserts, duracaoMs: r.duracaoMs });
    }
    return NextResponse.json({ erro: 'acao invalida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
