// POST /api/abastecimento/substituir — troca um abastecimento JÁ importado
// pelos valores da linha do arquivo (o caso do reexport corrigido da
// operadora: mesma transação, litros/valor/hora ajustados).
//
// Só atualiza registros que a importação apontou como duplicados: cada item
// vem com o motivo, e a rota CONFERE a identidade antes de escrever —
//   motivo 'autorizacao': a autorização do registro tem que bater com a da linha;
//   motivo 'chave': placa+data+litros do registro têm que bater com a linha.
// Sem isso, o endpoint viraria um "UPDATE em qualquer id" disfarçado.
//
// O lote_id ORIGINAL é mantido de propósito: mudar a linha de lote faria os
// contadores dos lotes antigos mentirem, e a exclusão de lote apagaria um
// registro que veio de outro arquivo.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import type { LinhaAbastecimento } from '@/lib/abastecimento/tipos';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// tudo que a correção da operadora pode ter mudado; placa/id_placa/lote ficam
const CAMPOS_SUBSTITUIVEIS: (keyof LinhaAbastecimento)[] = [
  'data_transacao', 'data_postagem', 'litros', 'valor_unitario', 'valor_original',
  'valor_total', 'valor_economizado', 'combustivel', 'posto_cnpj', 'posto_nome',
  'posto_bandeira', 'posto_uf', 'posto_cidade', 'motorista_cpf', 'motorista_nome',
  'hodometro_anterior', 'hodometro', 'horimetro_anterior', 'horimetro',
  'desvio_descricao', 'nota_fiscal', 'autorizacao',
];

interface Item { existenteId: number; motivo: 'autorizacao' | 'chave'; linha: LinhaAbastecimento }

export async function POST(request: Request) {
  const auth = await autenticar(request);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento:upload')) {
    return NextResponse.json({ error: 'Sem permissão para importar abastecimentos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const itens = (Array.isArray(body?.itens) ? body.itens : []) as Item[];
  if (!itens.length) return NextResponse.json({ error: 'Nada para substituir.' }, { status: 400 });
  if (itens.length > 300) return NextResponse.json({ error: 'Máximo de 300 substituições por vez.' }, { status: 400 });

  const resultados: { existenteId: number; ok: boolean; erro?: string }[] = [];
  for (const item of itens) {
    const id = Number(item?.existenteId);
    const linha = item?.linha;
    if (!id || !linha) { resultados.push({ existenteId: id || 0, ok: false, erro: 'Item incompleto.' }); continue; }
    try {
      const { data: atual } = await supabase
        .from('abastecimentos')
        .select('id, placa, data_transacao, litros, autorizacao')
        .eq('id', id)
        .maybeSingle();
      if (!atual) { resultados.push({ existenteId: id, ok: false, erro: 'Registro não existe mais.' }); continue; }

      const identidadeOk = item.motivo === 'autorizacao'
        ? String(atual.autorizacao || '').trim() !== '' &&
          String(atual.autorizacao || '').trim() === String(linha.autorizacao || '').trim()
        : String(atual.placa) === String(linha.placa) &&
          String(atual.data_transacao) === String(linha.data_transacao) &&
          Number(atual.litros) === Number(linha.litros);
      if (!identidadeOk) {
        resultados.push({ existenteId: id, ok: false, erro: 'O registro não corresponde mais à linha do arquivo (mudou desde a importação?).' });
        continue;
      }

      const patch: Record<string, unknown> = {};
      for (const c of CAMPOS_SUBSTITUIVEIS) patch[c] = linha[c] ?? null;
      const { error: errUpd } = await supabase.from('abastecimentos').update(patch).eq('id', id);
      if (errUpd) {
        // a nova data/litros pode colidir com OUTRO registro (índice único):
        // erro por item, sem derrubar o restante do lote de substituições
        resultados.push({ existenteId: id, ok: false, erro: errUpd.message });
        continue;
      }
      resultados.push({ existenteId: id, ok: true });
    } catch (e) {
      resultados.push({ existenteId: id, ok: false, erro: e instanceof Error ? e.message : 'erro' });
    }
  }

  const okCount = resultados.filter((r) => r.ok).length;
  await logFrota(auth, {
    acao: 'substituir_duplicadas',
    entidade: 'abastecimento',
    entidadeId: String(itens[0]?.existenteId ?? ''),
    entidadeLabel: `${okCount} de ${itens.length} substituição(ões)`,
    detalhes: { total: itens.length, ok: okCount, erros: resultados.filter((r) => !r.ok).length },
  });

  return NextResponse.json({ resultados, ok: okCount });
}
