/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// LEADS DO EVENTO para o painel da ficha do vendedor (26/11/2026, José: "um modal onde vemos o total de leads,
// separado por vendedor, e a gente vê tudo"). A ficha é página aberta; ESTA rota não: só com login do portal
// (qualquer usuário ativo), porque devolve nome, telefone e endereço dos clientes.
// GET /api/consorcio/<slug>/leads
// =============================================================================
import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = 'id, numero, nome, telefone, cidade, endereco, interesse, credito, parcela, prazo_meses, embutido_pct, lance_proprio, '
  + 'prazo_contemplacao, proposta_obs, tem_trator, usado_para_lance, usado_descricao, temperatura, vinda_de, vendedor, origem, '
  + 'proximo_passo, proximo_passo_data, fechamento_data, observacao, criado_em';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Entre no portal para ver os leads.' }, { status: 401 });
  try {
    const { slug } = await params;
    const { data: ev, error: e1 } = await db.from('consorcio_eventos').select('id, nome').eq('slug', slug).maybeSingle();
    if (e1) throw e1;
    if (!ev) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    const { data, error } = await db.from('consorcio_inscricoes').select(CAMPOS).eq('evento_id', ev.id).order('criado_em', { ascending: false }).limit(5000);
    if (error) throw error;
    return NextResponse.json({ evento: ev.nome, leads: data || [] });
  } catch (e: any) {
    console.error('[consorcio] leads', e);
    return NextResponse.json({ error: 'Não deu para carregar os leads.' }, { status: 500 });
  }
}
