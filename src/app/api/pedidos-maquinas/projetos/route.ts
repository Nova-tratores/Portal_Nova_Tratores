// GET ?q=&empresa= -> projetos da Omie (espelho portal_nt_projetos_PRINCIPAL) para o pedido de máquina.
// Projeto novo não é criado aqui: o nome digitado vai no pedido e o envio à Omie cria
// o projeto na conta certa (projetoNaConta, o mesmo do PPV).
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { guardar, respostaErro } from '@/lib/pedidos-maquinas/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60);
    const empresa = /castro/i.test(url.searchParams.get('empresa') || '') ? 'Castro Pecas' : 'Nova Tratores';
    let qb = supabaseAdmin.from('portal_nt_projetos_PRINCIPAL')
      .select('codigo, nome, cliente_nome_ultimo').eq('empresa', empresa).neq('inativo', 'S')
      .order('updated_at', { ascending: false }).limit(25);
    if (q) {
      // cada palavra precisa aparecer no nome ("6075 5756" acha "MAHINDRA 6075 ... 5756")
      for (const p of q.split(/\s+/).filter(Boolean).slice(0, 4)) qb = qb.ilike('nome', `%${p}%`);
    }
    const { data, error } = await qb;
    if (error) throw error;
    return Response.json({ projetos: data || [] });
  } catch (e) {
    return respostaErro(e, 'projetos');
  }
}
