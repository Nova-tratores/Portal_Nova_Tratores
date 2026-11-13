// POST {id, motivo} -> cancela no portal (e na Omie, se já enviado)
import { guardar, autor, respostaErro } from '@/lib/pedidos-maquinas/server';
import { cancelarPedidoMaquina } from '@/lib/pedidos-maquinas/omie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guardar(req, 'cancelar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    return Response.json(await cancelarPedidoMaquina(b.id, String(b.motivo || ''), autor(g.user)));
  } catch (e) {
    return respostaErro(e, 'cancelar');
  }
}
