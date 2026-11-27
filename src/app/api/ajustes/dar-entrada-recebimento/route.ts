import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { darEntradaRecebimento, type DarEntradaArgs, type ProdutoCriadoInfo } from '@/lib/ajustes/recebimentos';
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
      // produto criado "com meu código": espelhos na hora (a faixa "Máquinas a separar" já enxerga)
      const criados = (r as { produtosCriados?: ProdutoCriadoInfo[] }).produtosCriados || [];
      if (criados.length && body.idReceb != null) await espelharCriados(conta, Number(body.idReceb), criados).catch((e) => console.warn('[dar-entrada] espelho dos criados:', e?.message));
      verificarAlocacaoDepoisDaEntrada(conta);
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 });
  }
}

async function espelharCriados(conta: string, idReceb: number, criados: ProdutoCriadoInfo[]) {
  const contaLow = conta.toLowerCase();
  const hoje = new Date().toISOString().slice(0, 10);
  const codFams = [...new Set(criados.map((c) => c.codigoFamilia).filter((x): x is number => !!x))];
  const nomes = new Map<number, string>();
  if (codFams.length) {
    const { data } = await supabase.from('familias').select('codigo_familia, nome').eq('conta_omie', contaLow).in('codigo_familia', codFams);
    for (const f of data || []) nomes.set(Number(f.codigo_familia), String(f.nome || ''));
  }
  for (const c of criados) {
    const linha = {
      codigo_produto: c.idProduto, conta_omie: contaLow, codigo: c.codigo, descricao: c.descricao,
      codigo_familia: c.codigoFamilia, familia_nome: c.codigoFamilia ? nomes.get(c.codigoFamilia) ?? null : null,
      estoque: c.qtde ?? 0, inativo: false,
    };
    const { data: ja } = await supabase.from('produtos').select('codigo_produto').eq('codigo_produto', c.idProduto).eq('conta_omie', contaLow).limit(1);
    if (ja?.length) await supabase.from('produtos').update(linha).eq('codigo_produto', c.idProduto).eq('conta_omie', contaLow);
    else await supabase.from('produtos').insert(linha);
  }
  // a linha da nota no espelho passa a apontar para o produto criado
  const { data: rec } = await supabase.from('recebimentos_nfe').select('produtos, recebido_em')
    .eq('conta_omie', contaLow).eq('id_receb', idReceb).maybeSingle();
  if (!rec) return;
  const porSeq = new Map(criados.map((c) => [String(c.nSequencia), c]));
  const produtos = ((rec.produtos as Array<Record<string, unknown>>) || []).map((p) => {
    const c = porSeq.get(String(p.nSequencia));
    return c ? { ...p, nCodProduto: c.idProduto } : p;
  });
  await supabase.from('recebimentos_nfe').update({ produtos, ...(rec.recebido_em ? {} : { recebido_em: hoje }) })
    .eq('conta_omie', contaLow).eq('id_receb', idReceb);
}
