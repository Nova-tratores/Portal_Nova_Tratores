// GET ?empresa= -> listas da aba Omie (categorias, contas, cenários) + vendedores ativos
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardar, respostaErro } from '@/lib/pedidos-maquinas/server';
import { obterListasPedido } from '@/lib/ppv/listas-pedido';
import { CATEGORIAS_MAQUINA } from '@/lib/pedidos-maquinas/regras';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const empresa = new URL(req.url).searchParams.get('empresa') || '';
    const [listas, vends, cats] = await Promise.all([
      obterListasPedido(/castro/i.test(empresa) ? 'CASTRO' : 'NOVA'),
      supabaseAdmin.from('vendedores').select('id, nome').eq('ativo', true).order('nome'),
      // as categorias do PPV são de peças; o pedido de máquina usa as de venda de máquina
      supabaseAdmin.from('categoria').select('codigo, descricao').in('codigo', CATEGORIAS_MAQUINA),
    ]);
    const mapa = new Map((cats.data || []).map((c: { codigo: string; descricao: string }) => [String(c.codigo), String(c.descricao || '')]));
    const categorias = CATEGORIAS_MAQUINA.filter((c) => mapa.has(c)).map((c) => ({ codigo: c, descricao: mapa.get(c) || '' }));
    return Response.json({ ...listas, categorias, vendedores: vends.data || [] });
  } catch (e) {
    return respostaErro(e, 'listas');
  }
}
