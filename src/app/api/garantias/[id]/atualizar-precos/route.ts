import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { TBL_OS, TBL_ITENS } from '@/lib/pos/constants';
import { registrarEvento } from '@/lib/garantias/server';

// POST /api/garantias/[id]/atualizar-precos
// Recalcula preco_unitario das peças da garantia consultando o PPV/movimentações
// e o PecasInfo do relatório técnico. Útil para garantias antigas que foram
// criadas com preço zerado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, ppv_ids')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Carrega peças atuais da garantia
  const { data: pecas } = await supabase
    .from(TBL_GAR_PECAS)
    .select('id, cod_produto, descricao, quantidade, preco_unitario')
    .eq('garantia_id', id);
  if (!pecas || pecas.length === 0) {
    return NextResponse.json({ ok: true, atualizadas: 0, total: 0 });
  }

  // Monta tabela de preços: cruza PPV (movimentacoes) + PecasInfo (manual)
  const ppvIds = String(g.ppv_ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Se ppv_ids vazio, busca da OS
  let idsPPV = ppvIds;
  if (idsPPV.length === 0) {
    const { data: osRow } = await supabase
      .from(TBL_OS)
      .select('ID_PPV')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle();
    idsPPV = String((osRow as { ID_PPV?: string } | null)?.ID_PPV || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 1) Preços do PPV via movimentacoes
  const precosPorCod: Record<string, { preco: number; descricao: string }> = {};
  if (idsPPV.length > 0) {
    const { data: itens } = await supabase.from(TBL_ITENS).select('*').in('Id_PPV', idsPPV);
    const resumo: Record<string, { descricao: string; qtde: number; totalFin: number }> = {};
    (itens || []).forEach((item: { CodProduto?: string; Descricao?: string; Qtde?: string; Preco?: string; TipoMovimento?: string }) => {
      const cod = String(item.CodProduto || '');
      const tipo = String(item.TipoMovimento || '').toLowerCase();
      const preco = parseFloat(item.Preco || '0');
      let qtd = Math.abs(parseFloat(item.Qtde || '0'));
      if (tipo.includes('devolu')) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { descricao: item.Descricao || cod, qtde: 0, totalFin: 0 };
      resumo[cod].qtde += qtd;
      resumo[cod].totalFin += preco * qtd;
    });
    Object.entries(resumo).forEach(([cod, p]) => {
      if (p.qtde !== 0) {
        precosPorCod[cod] = {
          preco: p.totalFin / p.qtde,
          descricao: p.descricao,
        };
      }
    });
  }

  // 2) Preços das peças manuais (PecasInfo no relatório técnico)
  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('PecasInfo')
    .eq('Ordem_Servico', g.id_ordem)
    .maybeSingle();
  if ((tec as { PecasInfo?: string } | null)?.PecasInfo) {
    try {
      const arr = JSON.parse((tec as { PecasInfo: string }).PecasInfo);
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (!p || p.origem !== 'manual') continue;
          const cod = String(p.codigo || '').trim();
          const desc = String(p.descricao || '').trim();
          if (!cod && !desc) continue;
          const preco = Number(p.preco) || 0;
          if (preco <= 0) continue;
          if (cod && !precosPorCod[cod]) {
            precosPorCod[cod] = { preco, descricao: desc };
          }
          // também indexa por descricao pra fallback
          if (desc && !precosPorCod[`__desc:${desc.toLowerCase()}`]) {
            precosPorCod[`__desc:${desc.toLowerCase()}`] = { preco, descricao: desc };
          }
        }
      }
    } catch {
      /* PecasInfo inválido — ignora */
    }
  }

  // 3) Atualiza preço de cada peça da garantia
  let atualizadas = 0;
  for (const p of pecas) {
    const cod = String(p.cod_produto || '').trim();
    const desc = String(p.descricao || '').trim();
    let novo: number | null = null;
    if (cod && precosPorCod[cod]) novo = precosPorCod[cod].preco;
    else if (desc && precosPorCod[`__desc:${desc.toLowerCase()}`]) novo = precosPorCod[`__desc:${desc.toLowerCase()}`].preco;

    if (novo != null && novo !== Number(p.preco_unitario)) {
      const { error: upErr } = await supabase
        .from(TBL_GAR_PECAS)
        .update({ preco_unitario: novo })
        .eq('id', p.id);
      if (!upErr) atualizadas++;
    }
  }

  await registrarEvento(id, {
    tipo: 'precos_atualizados',
    ator,
    detalhe: `${atualizadas} peça(s) tiveram preço atualizado a partir do PPV/relatório técnico.`,
  });

  return NextResponse.json({ ok: true, atualizadas, total: pecas.length });
}
