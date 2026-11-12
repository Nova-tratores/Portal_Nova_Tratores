import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { darEntradaRecebimento, type DarEntradaArgs } from '@/lib/ajustes/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { verificarAlocacaoDepoisDaEntrada } from '@/lib/pecas/alocacao-rapido';
import { supabase } from '@/lib/ajustes/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: conclui (dá entrada em) um recebimento de NF-e (AlterarRecebimento + ConcluirRecebimento).
export async function POST(req: NextRequest) {
  // Onda 0: exige login e permissao; o autor sai do login, nao do corpo.
  const acesso = await protegerRota(req, [{ modulo: 'estoque', acao: 'recebimentos' }, { modulo: 'ajustes', acao: 'recebimentos' }]);
  if (acesso.resposta) return acesso.resposta;
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<DarEntradaArgs>;
    const conta = parseConta((body.conta as string) ?? req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
    const r = await darEntradaRecebimento({ ...body, conta } as DarEntradaArgs);
    // Entrada concluída → em segundo plano, relê as notas recentes desta conta e abre a
    // demanda de ALOCAÇÃO das peças sem Prateleira/Andar/Caixa (não segura a resposta).
    if ((r as { ok?: boolean })?.ok) {
      // a nota sai da lista de pendentes na hora (sem esperar o sync do espelho)
      if (body.idReceb != null) {
        await supabase.from('recebimentos_nfe').update({ status: 'Recebida', etapa: '60' })
          .eq('conta_omie', conta.toLowerCase()).eq('id_receb', Number(body.idReceb));
      }
      verificarAlocacaoDepoisDaEntrada(conta);
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 });
  }
}
