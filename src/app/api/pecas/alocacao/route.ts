import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe, type OpcaoAcesso } from '@/lib/ajustes/permissao-server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { dispensar, listarAbertas, listarEncerradas, reabrir, sincronizarAlocacao } from '@/lib/pecas/alocacao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Demanda de ALOCAÇÃO de peça recebida (painel "A alocar" de /ajustes/caracteristicas).
// A demanda nasce sozinha (motor encadeado no cron de recebimentos) e fecha sozinha
// quando a peça ganha Prateleira/Andar/Caixa — ALOCAR não passa por aqui: a tela usa
// POST /api/ajustes/localizacao, e o gancho em editarCaractProduto fecha a demanda.
// Aqui: listar, dispensar/reabrir e "verificar agora".
// Acesso = quem enxerga Características OU Localização física (sem módulo novo).
const ACESSO: OpcaoAcesso[] = [
  { modulo: 'ajustes', acao: 'caracteristicas' },
  { modulo: 'ajustes', acao: 'localizacao' },
];

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  try {
    const lista = await listarAbertas({ userId: acesso.user.id });
    const comEncerradas = req.nextUrl.searchParams.get('encerradas') === '1';
    return NextResponse.json({
      ok: true,
      ...lista,
      meuUserId: acesso.user.id,
      encerradas: comEncerradas ? await listarEncerradas(100) : undefined,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

// "Verificar agora": roda o motor sem esperar o cron de 15 min.
export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  try {
    const r = await sincronizarAlocacao();
    return NextResponse.json({ ok: !r.pulado, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const acesso = await protegerRota(req, ACESSO);
  if (acesso.resposta) return acesso.resposta;
  const body = (await req.json().catch(() => ({}))) as { acao?: string; conta?: string; codigo_produto?: number | string; motivo?: string };
  const { acao, conta, codigo_produto } = body;
  if (!conta || !codigo_produto) return NextResponse.json({ ok: false, erro: 'conta e codigo_produto são obrigatórios' }, { status: 400 });
  const autor = { userId: acesso.user.id, userName: autorDe(acesso.user) };
  const alvo = { conta, codigoProduto: codigo_produto };
  try {
    if (acao !== 'dispensar' && acao !== 'reabrir') return NextResponse.json({ ok: false, erro: 'acao inválida (use dispensar|reabrir)' }, { status: 400 });
    const linhas = acao === 'dispensar' ? await dispensar(alvo, body.motivo || '', autor) : await reabrir(alvo);
    if (linhas.length === 0) return NextResponse.json({ ok: false, erro: acao === 'dispensar' ? 'Nenhuma demanda aberta para esta peça' : 'Nenhuma demanda dispensada para esta peça' }, { status: 404 });
    await registrarAuditLog({
      userId: autor.userId,
      userName: autor.userName,
      sistema: 'alocacao',
      acao,
      entidade: 'peca_alocacao',
      entidadeId: `${String(conta).toUpperCase()}:${codigo_produto}`,
      entidadeLabel: linhas[0].codigo || linhas[0].descricao || String(codigo_produto),
      detalhes: {
        empresa: String(conta).toUpperCase(), codigo_produto, codigo: linhas[0].codigo, descricao: linhas[0].descricao,
        motivo: acao === 'dispensar' ? String(body.motivo || '').trim() : undefined,
        notas: linhas.map((l) => l.numero_nfe), ids: linhas.map((l) => l.id),
      },
    });
    return NextResponse.json({ ok: true, afetadas: linhas.length });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ ok: false, erro: msg }, { status: /motivo/i.test(msg) ? 400 : 500 });
  }
}
