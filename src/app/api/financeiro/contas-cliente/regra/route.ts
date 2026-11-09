// Regra de atualização de dívida por empresa (multa, juros a.m., simples/composto,
// carência, desconto nos encargos). GET = quem usa a tela ou o Caixa › Vencidos (Financeiro/DRE: a mesma regra
// vale nas duas telas); PUT = ação
// financeiro:contas-cliente-regra (ou admin). Migration: sql/financeiro-regra-juros.sql.
import { NextRequest, NextResponse } from 'next/server';
import { autorDe, protegerRota } from '@/lib/ajustes/permissao-server';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { lerRegras, salvarRegra, type ContaOmie } from '@/lib/financeiro/contas-cliente-server';
import { normalizarRegra } from '@/lib/financeiro/divida';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'financeiro' }, { modulo: 'dre' }]);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json({ ok: true, ...(await lerRegras()) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'financeiro', acao: 'contas-cliente-regra' }]);
  if (g.resposta) return g.resposta;
  const b = await req.json().catch(() => ({}));
  const conta = String(b?.conta || '').toUpperCase();
  if (conta !== 'NOVA' && conta !== 'CASTRO') return NextResponse.json({ ok: false, erro: 'Empresa inválida' }, { status: 400 });
  const autor = autorDe(g.user);
  try {
    const { antes, depois } = await salvarRegra(conta as ContaOmie, normalizarRegra(b?.regra), autor);
    await registrarAuditLog({
      userId: g.user.id, userName: autor, sistema: 'financeiro', acao: 'regra_juros',
      entidade: 'financeiro_regra_juros', entidadeId: conta, entidadeLabel: `Regra de juros ${conta}`,
      detalhes: { antes, depois },
    });
    return NextResponse.json({ ok: true, regra: depois });
  } catch (e) {
    if ((e as { migracaoFaltando?: boolean })?.migracaoFaltando) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta aplicar sql/financeiro-regra-juros.sql' }, { status: 503 });
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro ao salvar' }, { status: 500 });
  }
}
