/* eslint-disable @typescript-eslint/no-explicit-any */
// Boleto agrupado de fornecedor: lista (+ regras + duplicatas já em boleto) e
// registro (reprograma as duplicatas na Omie). Tabelas: sql/boletos-fornecedor.sql.
import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { listarBoletos, listarRegras, migracaoFaltando, registrarBoleto, titulosEmBoletoAtivo } from '@/lib/ajustes/boletos-fornecedor-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GATE = [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }, { modulo: 'ajustes', acao: 'correcao-contas' }, { modulo: 'ajustes', acao: 'baixa-contas' }];

function erroResp(e: unknown) {
  const msg = (e as Error).message || String(e);
  if (migracaoFaltando(msg)) return NextResponse.json({ erro: 'Tabelas do boleto agrupado ainda não existem no banco (aplicar sql/boletos-fornecedor.sql).', migracaoFaltando: true }, { status: 503 });
  return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, GATE);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const status = (sp.get('status') || 'ativos') as any;
  try {
    const [boletos, regras, ativos] = await Promise.all([
      listarBoletos(conta, { status }),
      listarRegras(conta),
      conta ? titulosEmBoletoAtivo(conta) : Promise.resolve({}),
    ]);
    return NextResponse.json({ ok: true, boletos, regras, titulosAtivos: ativos });
  } catch (e) {
    return erroResp(e);
  }
}

// WRITE na Omie: registra o boleto e altera previsão/vencimento/observação de cada duplicata.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }, { modulo: 'ajustes', acao: 'correcao-contas' }]);
  if (g.resposta) return g.resposta;
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b.conta);
    if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta (NOVA/CASTRO)' }, { status: 400 });
    const out = await registrarBoleto({
      conta,
      codigos: Array.isArray(b.codigos) ? b.codigos : [],
      numero: String(b.numero || ''),
      codigoBarras: b.codigoBarras || null,
      dataEmissao: b.dataEmissao || null,
      parcelas: Array.isArray(b.parcelas) ? b.parcelas : [],
      alinharVencimento: b.alinharVencimento,
      observacao: b.observacao || null,
      criadoPor: autorDe(g.user),
      userId: g.user.id,
    });
    if (!out.ok) return NextResponse.json(out, { status: 400 });
    return NextResponse.json(out);
  } catch (e) {
    return erroResp(e);
  }
}
