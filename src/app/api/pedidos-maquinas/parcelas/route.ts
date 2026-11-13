// PUT {pedido_id, parcelas:[{vencimento, valor, meio, entrada, origem_proposta_parcela}]}
import {
  guardar, autor, respostaErro, lerPedido, exigirEditavel, gravarParcelas, log, normalizarParcelasCorpo,
} from '@/lib/pedidos-maquinas/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    const p = await lerPedido(b.pedido_id);
    exigirEditavel(p);
    const parcelas = await gravarParcelas(p.id, normalizarParcelasCorpo(b.parcelas), Number(p.valor_total) || 0);
    await log(p.id, `Pagamento alterado (${parcelas.length} parcela(s))`, autor(g.user));
    return Response.json({ ok: true, parcelas });
  } catch (e) {
    return respostaErro(e, 'parcelas');
  }
}
