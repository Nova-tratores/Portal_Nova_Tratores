// GET  ?id=  -> prévia do payload do IncluirPedido (não grava nada)
// POST {id}  -> envia o pedido à Omie (etapa 10)
import { guardar, autor, respostaErro, registrarFalhaOmie } from '@/lib/pedidos-maquinas/server';
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
  let id: unknown;
  try {
    const b = await req.json().catch(() => ({}));
    id = b.id;
    return Response.json({ ok: true, ...(await enviarPedidoMaquina(b.id, autor(g.user))) });
  } catch (e) {
    await registrarFalhaOmie('enviar_erro', id, g.user, e).catch(() => {});
    return respostaErro(e, 'omie enviar');
  }
}
