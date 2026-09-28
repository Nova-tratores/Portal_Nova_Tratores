import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { aplicarUmaCorrecao, type CorrecaoBody, type HttpError } from '@/lib/ajustes/cmc';
import { logEntradaReceb } from '@/lib/ajustes/recebimentos';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: corrige o CMC distorcido de UM item apos dar entrada (reusa
// aplicarUmaCorrecao -> ajuste SLD + auditoria em cmc_correcoes) e grava o log
// interno em recebimento_entrada_log. codLocal e' resolvido no servidor se ausente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Onda 0: exige login e permissao; o autor sai do login, nao do corpo.
  const acesso = await protegerRota(req, [{ modulo: 'estoque', acao: 'recebimentos' }, { modulo: 'ajustes', acao: 'recebimentos' }]);
  if (acesso.resposta) return acesso.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as CorrecaoBody & {
    userId?: string | null;
    userNome?: string | null;
    tipo?: string | null;
    numeroNFe?: string | null;
  };
  try {
    const r = await aplicarUmaCorrecao({ ...body, conta }, autorDe(acesso.user));
    logEntradaReceb({
      conta,
      idReceb: id,
      numeroNFe: body.numeroNFe ?? body.nfOrigemNumero ?? null,
      tipo: body.tipo ?? null,
      acao: 'correcao_cmc',
      userId: acesso.user.id,
      userNome: autorDe(acesso.user),
      payload: { codigoProduto: body.codigoProduto, novoCMC: body.novoCMC, cfopOrigem: body.cfopOrigem },
      resultado: r,
    });
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    logEntradaReceb({
      conta,
      idReceb: id,
      numeroNFe: body.numeroNFe ?? body.nfOrigemNumero ?? null,
      tipo: body.tipo ?? null,
      acao: 'correcao_cmc',
      userId: acesso.user.id,
      userNome: autorDe(acesso.user),
      payload: { codigoProduto: body.codigoProduto, novoCMC: body.novoCMC },
      resultado: { erro: err.message },
    });
    return NextResponse.json(
      { ok: false, erro: err.message, correcaoId: err.correcaoId ?? null },
      { status: err.http || 400 },
    );
  }
}
