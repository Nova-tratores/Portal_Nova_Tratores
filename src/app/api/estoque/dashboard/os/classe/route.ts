import { NextRequest, NextResponse } from 'next/server';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { parseConta } from '@/lib/estoque/conta';
import { definirClasseManual } from '@/lib/estoque/servicos-classe-db';
import { ROTULO_CLASSE, type ClasseServico } from '@/lib/estoque/servicos-classe';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';

// Move uma OS entre "serviço comercial" e garantia/campanha/seguro/promoção
// (Dashboard de Vendas → popup do Serviços). `classe: null` devolve a OS para o
// que a regra automática diz. Fica gravado quem mudou e quando (os_classificacao
// + audit_log).
export async function PATCH(req: NextRequest) {
  let usuario: { id: string; email?: string; nome?: string };
  try {
    usuario = await exigirPermissao(req, 'estoque', 'dashboard');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { conta?: string; ncod_os?: number; classe?: string | null; numero_os?: string };
  const conta = parseConta(body.conta ?? null);
  const ncod = Number(body.ncod_os);
  const classe = body.classe == null ? null : (body.classe as ClasseServico);
  if (!conta || !ncod) return NextResponse.json({ erro: 'Informe conta e ncod_os' }, { status: 400 });
  if (classe != null && !(classe in ROTULO_CLASSE)) return NextResponse.json({ erro: 'classe inválida' }, { status: 400 });

  const nome = usuario.nome || usuario.email || 'usuário';
  try {
    const r = await definirClasseManual(conta, ncod, classe, { id: usuario.id, nome });
    await registrarAuditLog({
      userId: usuario.id,
      userName: nome,
      sistema: 'estoque',
      acao: classe == null ? 'servico_classe_regra' : 'servico_classe_manual',
      entidade: 'os',
      entidadeId: conta + ':' + ncod,
      entidadeLabel: 'OS ' + (body.numero_os || ncod) + ' (' + conta + ')',
      detalhes: { classe: r.classe, origem: r.origem, classe_regra: r.classeRegra },
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 500 });
  }
}
