// Backfill do fornecedor preferencial por item (item_param.codigo_fornecedor_preferencial).
//
// Chain (cobertura ~87% dos produtos ativos):
//   compras_itens (codigo_produto = ID INTERNO Omie, numero_nf) × recebimentos_nfe
//   (numero_nfe → id_fornecedor). Join numero_nf==numero_nfe validado ~100%.
// codigo_produto de compras_itens já é o id interno (SKU cru fica em codigo_produto_nf),
// então casa direto produtos/item_param — sem resolver SKU e sem a tabela Fornecedores.
//
// Guarda o id_fornecedor (código Omie) como codigo_fornecedor_preferencial; o NOME é
// resolvido na exibição via fornecedores.ts. Respeita override MANUAL (não sobrescreve
// item_param que já tem preferencial). conta: compras_itens=MAIÚSCULO; resto=minúsculo.

import { supabase } from '@/lib/estoque/supabase';

const CONTAS: Array<{ low: 'nova' | 'castro'; up: 'NOVA' | 'CASTRO' }> = [
  { low: 'nova', up: 'NOVA' }, { low: 'castro', up: 'CASTRO' },
];

async function paginar<T>(monta: (off: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []; let off = 0;
  for (;;) { const b = await monta(off); out.push(...b); if (b.length < 1000) break; off += 1000; }
  return out;
}
function ordData(dmy: string): number { const m = String(dmy || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? +`${m[3]}${m[2]}${m[1]}` : 0; }

/** Preenche item_param.codigo_fornecedor_preferencial por conta. Retorna contadores. */
export async function backfillFornecedorPreferencial(): Promise<Record<string, number>> {
  const contadores: Record<string, number> = {};

  for (const { low, up } of CONTAS) {
    // produtos válidos da conta (codigo_produto é o id interno) — só backfillar estes
    const validos = new Set<number>();
    for (const p of await paginar(async (o) => (await supabase.from('produtos')
      .select('codigo_produto').eq('conta_omie', low)
      .order('codigo_produto', { ascending: true }).range(o, o + 999)).data ?? []))
      validos.add(Number(p.codigo_produto));

    // recebimentos: numero_nfe → id_fornecedor (Omie)
    const nfForn = new Map<string, number>();
    for (const r of await paginar(async (o) => (await supabase.from('recebimentos_nfe')
      .select('numero_nfe, id_fornecedor').eq('conta_omie', low).not('id_fornecedor', 'is', null)
      .order('id_receb', { ascending: true }).range(o, o + 999)).data ?? []))
      if (r.numero_nfe != null) nfForn.set(String(r.numero_nfe), Number(r.id_fornecedor));

    // compras_itens: NF mais recente por codigo_produto (id interno)
    const ultimaNF = new Map<number, { nf: string; ord: number }>();
    for (const ci of await paginar(async (o) => (await supabase.from('compras_itens')
      .select('codigo_produto, numero_nf, data_nota').eq('conta_omie', up)
      .order('id', { ascending: true }).range(o, o + 999)).data ?? [])) {
      const cp = Number(ci.codigo_produto); const nf = String(ci.numero_nf || '');
      if (!Number.isInteger(cp) || !validos.has(cp) || !nf) continue; // ignora códigos crus de fornecedor
      const ord = ordData(ci.data_nota);
      const cur = ultimaNF.get(cp);
      if (!cur || ord >= cur.ord) ultimaNF.set(cp, { nf, ord });
    }

    // item_param já com preferencial (override manual vence → não tocar)
    const jaTem = new Set<number>();
    for (const ip of await paginar(async (o) => (await supabase.from('item_param')
      .select('codigo_produto, codigo_fornecedor_preferencial').eq('conta_omie', low)
      .order('codigo_produto', { ascending: true }).range(o, o + 999)).data ?? []))
      if (ip.codigo_fornecedor_preferencial != null) jaTem.add(Number(ip.codigo_produto));

    const agora = new Date().toISOString();
    const upserts: Array<{ conta_omie: string; codigo_produto: number; codigo_fornecedor_preferencial: number; atualizado_em: string }> = [];
    for (const [cp, { nf }] of ultimaNF) {
      if (jaTem.has(cp)) continue;
      const fid = nfForn.get(nf); if (fid == null || !Number.isInteger(fid)) continue;
      upserts.push({ conta_omie: low, codigo_produto: cp, codigo_fornecedor_preferencial: fid, atualizado_em: agora });
    }
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabase.from('item_param').upsert(upserts.slice(i, i + 500), { onConflict: 'conta_omie,codigo_produto' });
      if (error) throw new Error(`backfill item_param ${low}: ${error.message}`);
    }
    contadores[low] = upserts.length;
  }
  return contadores;
}
