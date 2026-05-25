import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS, TBL_ITENS } from '@/lib/pos/constants';
import type { PecaOS } from '@/lib/garantias/types';

// GET /api/garantias/os-pecas?os=<id>
// Lista as peças da OS (PPV + peças manuais do relatório técnico) para o técnico selecionar.
export async function GET(req: NextRequest) {
  const osId = (req.nextUrl.searchParams.get('os') || '').trim();
  if (!osId) return NextResponse.json({ pecas: [] });

  const pecas: PecaOS[] = [];

  // 1) Peças do PPV (tabela movimentacoes)
  const { data: osRow } = await supabase
    .from(TBL_OS)
    .select('ID_PPV')
    .eq('Id_Ordem', osId)
    .maybeSingle();

  const ppvIds = String(osRow?.ID_PPV || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (ppvIds.length > 0) {
    const { data: itens } = await supabase.from(TBL_ITENS).select('*').in('Id_PPV', ppvIds);
    const resumo: Record<string, { descricao: string; qtde: number; totalFin: number; ppv: string }> = {};
    (itens || []).forEach((item) => {
      const cod = String(item.CodProduto || '');
      const tipo = String(item.TipoMovimento || '').toLowerCase();
      const preco = parseFloat(item.Preco || 0);
      let qtd = Math.abs(parseFloat(item.Qtde || 0));
      if (tipo.includes('devolu')) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { descricao: item.Descricao || cod, qtde: 0, totalFin: 0, ppv: String(item.Id_PPV || '') };
      resumo[cod].qtde += qtd;
      resumo[cod].totalFin += preco * qtd;
    });
    Object.entries(resumo).forEach(([cod, p]) => {
      if (p.qtde !== 0) {
        pecas.push({
          cod_produto: cod || null,
          descricao: p.descricao,
          quantidade: p.qtde,
          preco_unitario: p.qtde !== 0 ? p.totalFin / p.qtde : 0,
          origem: 'ppv',
          fonte_ppv_id: p.ppv || null,
        });
      }
    });
  }

  // 2) Peças manuais do relatório técnico (PecasInfo)
  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('PecasInfo')
    .eq('Ordem_Servico', osId)
    .maybeSingle();
  if (tec?.PecasInfo) {
    try {
      const arr = JSON.parse(tec.PecasInfo);
      if (Array.isArray(arr)) {
        arr
          .filter((p) => p && p.origem === 'manual')
          .forEach((p) => {
            pecas.push({
              cod_produto: p.codigo || null,
              descricao: p.descricao || 'Peça',
              quantidade: Number(p.quantidade) || 1,
              preco_unitario: Number(p.preco) || 0,
              origem: 'pecasinfo_manual',
              fonte_ppv_id: null,
            });
          });
      }
    } catch {
      /* PecasInfo inválido — ignora */
    }
  }

  return NextResponse.json({ pecas });
}
