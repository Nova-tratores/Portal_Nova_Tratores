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
  // Não filtramos status no SQL: `.not('status','in',(...))` no Postgres também
  // EXCLUI linhas com status NULL (semântica do NOT IN), fazendo requisições
  // sem status sumirem — que é justo o caso do serviço de terceiro. Buscamos
  // todas e descartamos só lixeira/cancelada no JS (igual a OS mostra).
  const { data: reqs } = await supabase
    .from('Requisicao')
    .select('id, titulo, status, valor_cobrado_cliente, valor_despeza, quantidade')
    .eq('ordem_servico', id);
  for (const r of (reqs || []) as { id: number; titulo?: string; status?: string; valor_cobrado_cliente?: string; valor_despeza?: string; quantidade?: string }[]) {
    const st = String(r.status || '').toLowerCase();
    if (st === 'lixeira' || st === 'cancelada') continue;
    const titulo = String(r.titulo || '').trim();
    if (!titulo) continue;
    // A garantia reembolsa o CUSTO. Em garantia o cliente normalmente NÃO é
    // cobrado (valor_cobrado_cliente = 0/vazio), então cai pra valor_despeza,
    // o custo real do serviço de terceiro / material da requisição.
    const valor = parseFloat(r.valor_cobrado_cliente || '0') || parseFloat(r.valor_despeza || '0');
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
