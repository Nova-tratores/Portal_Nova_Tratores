// POST   {pedido_id, proposta_id, oque:{cliente,parcelas}} -> importa a proposta para o pedido
// DELETE ?pedido_id=                                        -> desvincula (parcelas ficam)
import { guardar, autor, respostaErro } from '@/lib/pedidos-maquinas/server';
import { importarPropostaNoPedido, desvincularProposta } from '@/lib/pedidos-maquinas/importar-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    if (!b.pedido_id || !b.proposta_id) return Response.json({ error: 'Informe o pedido e a proposta.' }, { status: 400 });
    const r = await importarPropostaNoPedido(Number(b.pedido_id), Number(b.proposta_id), b.oque || {}, autor(g.user));
    return Response.json({ ok: true, importacao: r });
  } catch (e) {
    return respostaErro(e, 'importar-proposta');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const id = Number(new URL(req.url).searchParams.get('pedido_id'));
    await desvincularProposta(id, autor(g.user));
    return Response.json({ ok: true });
  } catch (e) {
    return respostaErro(e, 'desvincular-proposta');
  }
}
