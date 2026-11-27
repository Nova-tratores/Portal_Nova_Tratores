// "É produtor rural?" do cliente do pedido — no cadastro do cliente na Omie.
// GET  ?id=                        -> lê da Omie
// POST {id, produtor_rural: bool}  -> grava na Omie (AlterarCliente) e confere
import { guardar, autor, respostaErro, log, MODULO } from '@/lib/pedidos-maquinas/server';
import { lerProdutorRural, gravarProdutorRural } from '@/lib/pedidos-maquinas/produtor-rural';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 });
    return Response.json(await lerProdutorRural(id));
  } catch (e) {
    return respostaErro(e, 'produtor-rural GET');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.id || typeof body.produtor_rural !== 'boolean') {
      return Response.json({ error: 'Informe id e produtor_rural (true/false).' }, { status: 400 });
    }
    const r = await gravarProdutorRural(body.id, body.produtor_rural);
    if (r.mudou) {
      const quem = autor(g.user!);
      const texto = `Cliente ${r.produtorRural ? 'marcado' : 'desmarcado'} como produtor rural na Omie (${r.empresa}, cód. ${r.codigoCliente})`;
      await log(r.pedidoId, 'produtor_rural', quem, { de: r.antes, para: r.produtorRural, codigo_cliente: r.codigoCliente, empresa: r.empresa, texto }).catch(() => {});
      const { registrarAuditLog } = await import('@/lib/server/audit-notify');
      await registrarAuditLog({
        userId: g.user!.id, userName: quem, sistema: MODULO, acao: 'cliente_produtor_rural',
        entidade: 'cliente_omie', entidadeId: String(r.codigoCliente), entidadeLabel: `Cliente Omie ${r.codigoCliente} (${r.empresa})`,
        detalhes: { de: r.antes, para: r.produtorRural, pedido_id: r.pedidoId },
      }).catch(() => {});
    }
    return Response.json(r);
  } catch (e) {
    return respostaErro(e, 'produtor-rural POST');
  }
}
