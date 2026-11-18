// Grava na Omie o preço de venda escolhido na janela de "Dar entrada" (máquina ×1,20,
// peça ×2 — regra em preco-venda-entrada.ts). Roda DEPOIS de concluir o recebimento:
// só então o produto novo existe e o item aponta para o produto certo (associado).
// Relê o preço na Omie e só grava se SUBIR. Erro aqui não desfaz a entrada.
import type { Conta } from '@/lib/ajustes/conta';
import { omieRequest, normalizarRecebimento } from '@/lib/ajustes/omie';
import { supabase } from '@/lib/ajustes/supabase';
import { deveGravar } from './preco-venda-entrada';

export interface PrecoPedido { nSequencia: number | string; valor: number }
export interface PrecoResultado {
  nSequencia: number | string; idProduto: number | null; descricao: string | null;
  de: number | null; para: number; status: 'gravado' | 'nao_subiu' | 'sem_produto' | 'erro'; erro?: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function aplicarPrecosVenda(conta: Conta, idReceb: number | string, pedidos: PrecoPedido[]): Promise<PrecoResultado[]> {
  const lista = (pedidos || []).filter((p) => Number(p.valor) > 0);
  if (!lista.length) return [];
  const data = await omieRequest('/produtos/recebimentonfe/', 'ConsultarRecebimento', { nIdReceb: Number(idReceb) || idReceb }, conta);
  const rec = normalizarRecebimento(data?.recebimento || data);
  const porSeq = new Map<string, { id: number | null; desc: string | null }>();
  for (const it of rec?.itens || []) porSeq.set(String(it.nSequencia), { id: it.idProduto ?? null, desc: it.descricaoProduto ?? null });

  const out: PrecoResultado[] = [];
  for (const p of lista) {
    const item = porSeq.get(String(p.nSequencia));
    const para = Math.round(Number(p.valor) * 100) / 100;
    const base = { nSequencia: p.nSequencia, idProduto: item?.id ?? null, descricao: item?.desc ?? null, para };
    if (!item?.id) { out.push({ ...base, de: null, status: 'sem_produto' }); continue; }
    try {
      const prod = await omieRequest('/geral/produtos/', 'ConsultarProduto', { codigo_produto: item.id }, conta);
      if (prod?.faultstring) throw new Error(prod.faultstring);
      const de = Number(prod?.valor_unitario) || 0;
      if (!deveGravar(para, de)) { out.push({ ...base, de, status: 'nao_subiu' }); continue; }
      await espera(400);
      const alt = await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: item.id, valor_unitario: para }, conta);
      if (alt?.faultstring) throw new Error(alt.faultstring);
      // espelhos: PPV/Orçamento leem Produtos_Completos; o sync de 10 min também traria
      await supabase.from('Produtos_Completos').update({ Preco_Venda: para }).eq('id_omie', item.id);
      out.push({ ...base, de, status: 'gravado' });
    } catch (e) {
      out.push({ ...base, de: null, status: 'erro', erro: (e as Error).message });
    }
    await espera(400);
  }
  return out;
}
