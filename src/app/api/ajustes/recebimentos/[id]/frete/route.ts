import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { notasDoFrete, fretesDaNotaServer, lerVinculos, salvarVinculos } from '@/lib/ajustes/frete-vinculo-server';
import { chaveEhCte } from '@/lib/ajustes/frete-vinculo';
import { supabase } from '@/lib/ajustes/supabase';

export const dynamic = 'force-dynamic';

// Frete (CT-e) ↔ nota de produto, lido do espelho (nada vai à Omie aqui).
// GET ?conta=  — [id] é CT-e: notas candidatas + ligadas; [id] é NF-e: fretes que podem ser dela.
// POST — CT-e: { conta, nfes: number[], semNota?: string }  (troca os vínculos)
//        NF-e: { conta, cte: number, ligar: boolean }       (liga/desliga este CT-e desta nota)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const id = Number((await params).id);
  if (!conta || !(id > 0)) return NextResponse.json({ erro: 'conta e id' }, { status: 400 });
  try {
    const ehCte = await ehCteNoEspelho(conta, id);
    if (ehCte) return NextResponse.json({ tipo: 'cte', ...(await notasDoFrete(conta, id)) });
    return NextResponse.json({ tipo: 'nfe', ...(await fretesDaNotaServer(conta, id)) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const conta = parseConta(body.conta);
  const id = Number((await params).id);
  if (!conta || !(id > 0)) return NextResponse.json({ erro: 'conta e id' }, { status: 400 });
  const autor = { nome: autorDe(g.user), id: g.user.id };
  try {
    let r;
    if (await ehCteNoEspelho(conta, id)) {
      const nfes = (Array.isArray(body.nfes) ? body.nfes : []).map(Number).filter((n: number) => n > 0);
      const semNota = String(body.semNota || '').trim() || null;
      if (!nfes.length && semNota && semNota.length < 5) return NextResponse.json({ erro: 'Explique por que o frete não tem nota (mín. 5 letras).' }, { status: 400 });
      r = await salvarVinculos(conta, id, nfes, nfes.length ? null : semNota, autor);
    } else {
      const cte = Number(body.cte);
      if (!(cte > 0)) return NextResponse.json({ erro: 'cte' }, { status: 400 });
      const atual = (await lerVinculos(conta, [cte])).mapa.get(cte)?.nfes || [];
      const nfes = body.ligar ? [...new Set([...atual, id])] : atual.filter((n) => n !== id);
      r = await salvarVinculos(conta, cte, nfes, null, autor);
    }
    if (!r.ok) return NextResponse.json({ erro: r.faltaTabela ? 'Falta aplicar sql/recebimento-frete-vinculos.sql' : 'não gravou', faltaTabela: !!r.faltaTabela }, { status: r.faltaTabela ? 503 : 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

async function ehCteNoEspelho(conta: string, id: number): Promise<boolean> {
  const { data } = await supabase.from('recebimentos_nfe').select('chave_nfe').eq('conta_omie', conta.toLowerCase()).eq('id_receb', id).maybeSingle();
  return chaveEhCte((data as { chave_nfe?: string } | null)?.chave_nfe);
}
