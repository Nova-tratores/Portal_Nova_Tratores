// GET ?empresa= -> listas da aba Omie (categorias, contas, cenários) + vendedores ativos
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardar, respostaErro } from '@/lib/pedidos-maquinas/server';
import { obterListasPedido } from '@/lib/ppv/listas-pedido';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const empresa = new URL(req.url).searchParams.get('empresa') || '';
    const [listas, vends] = await Promise.all([
      obterListasPedido(/castro/i.test(empresa) ? 'CASTRO' : 'NOVA'),
      supabaseAdmin.from('vendedores').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    return Response.json({ ...listas, vendedores: vends.data || [] });
  } catch (e) {
    return respostaErro(e, 'listas');
  }
}
