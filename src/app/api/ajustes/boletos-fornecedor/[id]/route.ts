/* eslint-disable @typescript-eslint/no-explicit-any */
// Um boleto: detalhe (GET) e ações (POST {acao: 'pagar' | 'estornar' | 'reaplicar'}).
import { NextRequest, NextResponse } from 'next/server';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { aplicarPendentes, estornarBoleto, migracaoFaltando, obterBoleto, pagarParcela } from '@/lib/ajustes/boletos-fornecedor-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function erroResp(e: unknown) {
  const msg = (e as Error).message || String(e);
  if (migracaoFaltando(msg)) return NextResponse.json({ erro: 'Tabelas do boleto agrupado ainda não existem no banco (aplicar sql/boletos-fornecedor.sql).', migracaoFaltando: true }, { status: 503 });
  return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }, { modulo: 'ajustes', acao: 'correcao-contas' }, { modulo: 'ajustes', acao: 'baixa-contas' }]);
  if (g.resposta) return g.resposta;
  const { id } = await ctx.params;
  try {
    const boleto = await obterBoleto(id);
    if (!boleto) return NextResponse.json({ erro: 'boleto não encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true, boleto });
  } catch (e) {
    return erroResp(e);
  }
}

// WRITE na Omie: pagar parcela (LancarPagamento por duplicata), estornar (AlterarContaPagar de volta) ou reaplicar pendentes.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as any;
  const acao = String(b.acao || '');
  // pagar = permissão de baixa; estornar/reaplicar = permissão do boleto (ou correção de contas)
  const gate = acao === 'pagar'
    ? [{ modulo: 'ajustes', acao: 'baixa-contas' }, { modulo: 'ajustes', acao: 'boletos-fornecedor' }]
    : [{ modulo: 'ajustes', acao: 'boletos-fornecedor' }, { modulo: 'ajustes', acao: 'correcao-contas' }];
  const g = await protegerRota(req, gate);
  if (g.resposta) return g.resposta;
  const criadoPor = autorDe(g.user);
  try {
    if (acao === 'pagar') {
      if (!b.parcelaId) return NextResponse.json({ ok: false, erro: 'informe a parcela' }, { status: 400 });
      const out = await pagarParcela({
        boletoId: id, parcelaId: String(b.parcelaId), codigoContaCorrente: Number(b.codigoContaCorrente) || 0,
        data: String(b.data || '').slice(0, 10) || new Date().toISOString().slice(0, 10), observacao: b.observacao || null,
        conciliar: !!b.conciliar, criadoPor, userId: g.user.id,
      });
      return NextResponse.json(out, { status: out.ok ? 200 : 400 });
    }
    if (acao === 'estornar') {
      const out = await estornarBoleto({ boletoId: id, criadoPor, userId: g.user.id, motivo: b.motivo || null });
      return NextResponse.json(out, { status: out.ok ? 200 : 400 });
    }
    if (acao === 'reaplicar') {
      const out = await aplicarPendentes(id, criadoPor);
      return NextResponse.json({ ok: out.falhas === 0, ...out, boleto: await obterBoleto(id) });
    }
    return NextResponse.json({ ok: false, erro: 'acao inválida (pagar | estornar | reaplicar)' }, { status: 400 });
  } catch (e) {
    return erroResp(e);
  }
}
