// Separar máquinas recebidas em lote (1 produto por série/chassi).
// GET  ?pendentes=1                      -> linhas de notas recebidas ainda juntas
// GET  ?conta=NOVA&produto=<id>          -> prévia (produto + estoque ao vivo na Omie)
// POST {conta, idProduto, maquinas[], gravar, idReceb?, numeroNfe?, seq?} -> confere (gravar=false) ou separa
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { ACESSO_RECEBIMENTOS } from '@/lib/ajustes/recebimentos-espelho';
import { listarPendentes, previa, separar, ErroSeparar } from '@/lib/estoque/separar-maquinas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function erro(e: unknown, onde: string) {
  if (e instanceof ErroSeparar) return Response.json({ error: e.message, ...(e.extra || {}) }, { status: e.status });
  const err = e as { faultstring?: string; message?: string };
  console.error(`[separar-maquinas] ${onde}:`, err?.faultstring || err?.message || e);
  return Response.json({ error: err?.faultstring || err?.message || 'Erro interno' }, { status: 500 });
}

export async function GET(req: Request) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('pendentes')) return Response.json({ pendentes: await listarPendentes() });
    const produto = Number(url.searchParams.get('produto'));
    if (!produto) return Response.json({ error: 'Informe o produto.' }, { status: 400 });
    return Response.json(await previa(url.searchParams.get('conta') || 'NOVA', produto));
  } catch (e) {
    return erro(e, 'GET');
  }
}

export async function POST(req: Request) {
  const g = await protegerRota(req, ACESSO_RECEBIMENTOS);
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    if (!b?.idProduto || !Array.isArray(b.maquinas)) return Response.json({ error: 'Informe o produto e as máquinas.' }, { status: 400 });
    const usuario = { id: g.user.id, nome: g.user.nome || g.user.email || g.user.id };
    const r = await separar({
      conta: String(b.conta || 'NOVA'), idProduto: Number(b.idProduto), maquinas: b.maquinas, gravar: b.gravar === true,
      idReceb: b.idReceb ?? null, numeroNfe: b.numeroNfe ?? null, seq: b.seq ?? null,
    }, usuario);
    return Response.json(r);
  } catch (e) {
    return erro(e, 'POST');
  }
}
