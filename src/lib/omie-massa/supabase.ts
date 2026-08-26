// Dados de apoio (Supabase, service role) para o ranking de produtos do
// módulo Omie em Massa: família por produto e agregado de vendas.
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Famílias por produto (produto_tipo, conta NOVA — casing varia, filtra com norm)
export async function familiasPorProduto(): Promise<Map<string, string>> {
  const fam = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('produto_tipo')
      .select('codigo_produto, familia, conta_omie').range(from, from + 999);
    if (error) throw new Error(`produto_tipo: ${error.message}`);
    for (const p of data || []) {
      if (norm(String(p.conta_omie || '')) === 'nova' && p.familia) fam.set(String(p.codigo_produto), String(p.familia));
    }
    if (!data || data.length < 1000) break;
  }
  return fam;
}
