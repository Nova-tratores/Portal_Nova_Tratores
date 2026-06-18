// Fonte única das peças de uma OS para o módulo de Garantias.
// Une 3 fontes: PPV (movimentacoes), Requisições vinculadas e PecasInfo manual
// do relatório técnico. Usado pelo endpoint os-pecas (seleção do técnico),
// pela criação manual e pela sincronização da garantia com a OS.
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS, TBL_ITENS } from '@/lib/pos/constants';
import type { PecaOS } from './types';

export async function listarPecasDaOS(osId: string): Promise<PecaOS[]> {
  const id = String(osId || '').trim();
  if (!id) return [];

  const pecas: PecaOS[] = [];

  // 1) Peças do PPV (tabela movimentacoes)
  const { data: osRow } = await supabase
    .from(TBL_OS)
    .select('ID_PPV')
    .eq('Id_Ordem', id)
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

  // 2) Requisições vinculadas à OS (tabela Requisicao com ordem_servico = osId)
  const { data: reqs } = await supabase
    .from('Requisicao')
    .select('id, titulo, valor_cobrado_cliente, quantidade')
    .eq('ordem_servico', id)
    .not('status', 'in', '("lixeira","cancelada")');
  for (const r of (reqs || []) as { id: number; titulo?: string; valor_cobrado_cliente?: string; quantidade?: string }[]) {
    const titulo = String(r.titulo || '').trim();
    if (!titulo) continue;
    const valor = parseFloat(r.valor_cobrado_cliente || '0');
    const qtd = parseFloat(r.quantidade || '1') || 1;
    pecas.push({
      cod_produto: `REQ-${r.id}`,
      descricao: titulo,
      quantidade: qtd,
      preco_unitario: qtd > 0 ? valor / qtd : valor,
      origem: 'pecasinfo_manual',
      fonte_ppv_id: null,
    });
  }

  // 3) Peças manuais do relatório técnico (PecasInfo)
  const { data: tec } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('PecasInfo')
    .eq('Ordem_Servico', id)
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

  return pecas;
}
