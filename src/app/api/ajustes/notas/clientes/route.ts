/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT, type Conta } from '@/lib/ajustes/conta';
import { supabase } from '@/lib/ajustes/supabase';

export const dynamic = 'force-dynamic';

// Conta (NOVA/CASTRO) -> valor da coluna `empresa` em portal_nt_clientes_cadastro_omie.
const EMPRESA: Record<Conta, string> = {
  NOVA: 'Nova Tratores',
  CASTRO: 'Castro Pecas',
};

// Autocomplete de clientes (le do cadastro sincronizado no Supabase). Retorna
// { codigo, nome, doc } pros matches do termo. Rapido (sem Omie).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const q = (sp.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ clientes: [] });
  try {
    const termo = q.replace(/[%,]/g, ' ');
    const { data, error } = await supabase
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli, razao_social, nome_fantasia, cnpj_cpf')
      .eq('empresa', EMPRESA[conta])
      .or(`razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`)
      .limit(15);
    if (error) throw new Error(error.message);
    const clientes = (data || []).map((c: any) => ({
      codigo: c.cod_cli,
      nome: c.razao_social || c.nome_fantasia || String(c.cod_cli),
      doc: c.cnpj_cpf || null,
    }));
    return NextResponse.json({ clientes });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
