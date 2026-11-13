// GET  ?id=  -> prévia do payload do IncluirPedido (não grava nada)
// POST {id}  -> envia o pedido à Omie (etapa 10)
import { guardar, autor, respostaErro } from '@/lib/pedidos-maquinas/server';
import { montarPayload, enviarPedidoMaquina } from '@/lib/pedidos-maquinas/omie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const g = await guardar(req, 'enviar_omie');
  if (g.resposta) return g.resposta;
  try {
    const { acc, payload, avisos } = await montarPayload(new URL(req.url).searchParams.get('id') || '');
    return Response.json({ empresa: acc.name, payload, avisos });
  } catch (e) {
    return respostaErro(e, 'omie simular');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'enviar_omie');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    return Response.json({ ok: true, ...(await enviarPedidoMaquina(b.id, autor(g.user))) });
  } catch (e) {
    return respostaErro(e, 'omie enviar');
  }
}
