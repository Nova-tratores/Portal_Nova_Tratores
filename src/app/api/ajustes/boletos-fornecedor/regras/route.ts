/* eslint-disable @typescript-eslint/no-explicit-any */
// Regras por fornecedor (quem cobra por boleto agrupado) + busca de fornecedor no espelho.
import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { buscarFornecedores, listarRegras, migracaoFaltando, salvarRegra } from '@/lib/ajustes/boletos-fornecedor-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function erroResp(e: unknown) {
  const msg = (e as Error).message || String(e);
  if (migracaoFaltando(msg)) return NextResponse.json({ erro: 'Tabelas do boleto agrupado ainda não existem no banco (aplicar sql/boletos-fornecedor.sql).', migracaoFaltando: true }, { status: 503 });
  return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }, { modulo: 'ajustes', acao: 'correcao-contas' }, { modulo: 'ajustes', acao: 'baixa-contas' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const busca = sp.get('busca');
  try {
    if (busca != null) {
      if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta' }, { status: 400 });
      return NextResponse.json({ ok: true, fornecedores: await buscarFornecedores(conta, busca) });
    }
    return NextResponse.json({ ok: true, regras: await listarRegras(conta) });
  } catch (e) {
    return erroResp(e);
  }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }]);
  if (g.resposta) return g.resposta;
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b.conta);
    if (!conta) return NextResponse.json({ ok: false, erro: 'informe conta (NOVA/CASTRO)' }, { status: 400 });
    const regra = await salvarRegra({
      id: b.id || null, conta, codigoFornecedor: Number(b.codigoFornecedor), nome: String(b.nome || ''), ativo: b.ativo,
      diasTolerancia: b.diasTolerancia, toleranciaValor: b.toleranciaValor, alinharVencimento: b.alinharVencimento, criadoPor: autorDe(g.user),
    });
    return NextResponse.json({ ok: true, regra });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/informe/i.test(msg)) return NextResponse.json({ ok: false, erro: msg }, { status: 400 });
    return erroResp(e);
  }
}
