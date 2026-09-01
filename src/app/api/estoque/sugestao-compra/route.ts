import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { mapaFornecedoresConta } from '@/lib/estoque/sugestao-compra/fornecedores';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Leitura do último snapshot da Sugestão de Compra para a tela. Devolve os itens
// (projeção enxuta) + a lista de fornecedores para o eixo. Paginada (teto 1000).
const CAMPOS = [
  'sku', 'descricao', 'marca', 'familia', 'tipo', 'curva', 'regime', 'frequencia', 'codigo_fornecedor',
  'codigo_produto_nova', 'codigo_produto_castro',
  'estoque_nova', 'estoque_castro', 'estoque_atual', 'em_transito', 'minimo_efetivo', 'estoque_seguranca',
  'demanda_45d', 'prev_30', 'prev_60', 'prev_90', 'qtd_sugerida', 'qtd_sugerida_bruta', 'valor_estimado',
  'alerta', 'dias_ruptura_nova', 'dias_ruptura_castro', 'dias_ruptura_12m', 'indice_sazonal_45d',
  'meses_com_saida_12m', 'lead_time_usado', 'lead_time_origem', 'nivel_servico',
].join(',');

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  try {
    const ultimo = await supabase.from('sugestao_compra_snapshot')
      .select('snapshot_id, gerado_em').order('gerado_em', { ascending: false }).limit(1).maybeSingle();
    if (!ultimo.data) return NextResponse.json({ snapshot: null, itens: [], fornecedores: [] });
    const snapshotId = ultimo.data.snapshot_id;

    const itens: Record<string, unknown>[] = [];
    let off = 0;
    for (;;) {
      const { data, error } = await supabase.from('sugestao_compra_snapshot')
        .select(CAMPOS).eq('snapshot_id', snapshotId).order('valor_estimado', { ascending: false }).range(off, off + 999);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      itens.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < 1000) break;
      off += 1000;
    }

    // resolve o NOME do fornecedor (id_fornecedor Omie → nome, via recebimentos_nfe).
    // codigo_fornecedor no snapshot é o id da conta líder; mescla os mapas das duas.
    const [mNova, mCastro] = await Promise.all([mapaFornecedoresConta('nova'), mapaFornecedoresConta('castro')]);
    const nomeDe = (id: unknown): string => {
      if (id == null) return 'Não definido';
      const n = Number(id);
      return mNova.get(n) ?? mCastro.get(n) ?? `#${n}`;
    };
    for (const i of itens) i.fornecedor = nomeDe(i.codigo_fornecedor);

    // eixo agrupado por NOME (unifica o mesmo fornecedor entre contas)
    const contagem = new Map<string, number>();
    for (const i of itens) contagem.set(String(i.fornecedor), (contagem.get(String(i.fornecedor)) ?? 0) + 1);
    const fornecedores = [...contagem.entries()].map(([nome, n]) => ({ nome, n_itens: n }))
      .sort((a, b) => (a.nome === 'Não definido' ? 1 : b.nome === 'Não definido' ? -1 : b.n_itens - a.n_itens));

    return NextResponse.json({ snapshot: { id: snapshotId, gerado_em: ultimo.data.gerado_em }, itens, fornecedores });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
