// /api/inteligencia-vendas/noticias — Boletim do agro (notícias diárias).
//   GET  ?dia=YYYY-MM-DD        boletim do dia (padrão: o mais recente) + lista dos últimos 14 dias
//   POST {acao:'atualizar'}     roda o robô agora (admin ou quem tem o módulo inteiro)
import { NextResponse } from 'next/server';
import { erroIV, guardarIV, logIV, migracaoFaltando } from '@/lib/inteligencia-vendas/server';
import { gerarBoletim, lerBoletim } from '@/lib/inteligencia-vendas/noticias-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MIGRACAO = 'Migration sql/inteligencia-vendas-noticias.sql não aplicada';

export async function GET(req: Request) {
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  try {
    const a = g.auth!;
    const b = await lerBoletim(new URL(req.url).searchParams.get('dia'));
    return NextResponse.json({ ...b, podeAtualizar: a.isAdmin || a.modulos.includes('inteligencia-vendas') });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'noticias GET');
  }
}

export async function POST(req: Request) {
  const g = await guardarIV(req);
  if (g.resposta) return g.resposta;
  const a = g.auth!;
  try {
    const b = await req.json().catch(() => ({}));
    if (b?.acao !== 'atualizar') return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
    if (!(a.isAdmin || a.modulos.includes('inteligencia-vendas'))) {
      return NextResponse.json({ error: 'Só o administrador ou quem tem o módulo inteiro atualiza o boletim' }, { status: 403 });
    }
    const r = await gerarBoletim({ forcar: true });
    await logIV(a, {
      acao: 'boletim_atualizar', entidade: 'iv_boletim', entidadeLabel: r.dia,
      detalhes: { noticias: r.noticias.length, candidatos: r.candidatos, usouIA: r.usouIA, erros: r.erros.slice(0, 10) },
    });
    return NextResponse.json({ ok: true, noticias: r.noticias.length });
  } catch (e) {
    if (migracaoFaltando(e)) return NextResponse.json({ error: MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return erroIV(e, 'noticias POST');
  }
}
