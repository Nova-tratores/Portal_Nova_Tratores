// GET /api/planta/kpi/<kpi_id>?conta=NOVA|CASTRO|TODAS — os registros que formam um número
// da Planta Viva (até 200), lidos agora das mesmas fontes e pela MESMA seleção do cálculo
// (lib/planta/regras.ts → selecionar). Número sensível sem admin = 403. Fica no audit_log.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { carregarFontes } from '@/lib/planta/server';
import { CATALOGO, itensDoKpi, type ContaPlanta } from '@/lib/planta/regras';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ admin: true }, { modulo: 'planta' }]);
  if (g.resposta) return g.resposta;

  const { id } = await ctx.params;
  const def = CATALOGO[id];
  if (!def || id === 'robos') return NextResponse.json({ erro: 'número desconhecido' }, { status: 404 });
  if (def.sensivel && !g.user.isAdmin) return NextResponse.json({ erro: 'só admin vê o detalhe deste número' }, { status: 403 });

  const c = String(req.nextUrl.searchParams.get('conta') || 'TODAS').toUpperCase();
  const conta: ContaPlanta = def.porConta && (c === 'NOVA' || c === 'CASTRO') ? c : 'TODAS';
  try {
    const { fontes } = await carregarFontes([def.comodo]);
    if (fontes.falhas[def.comodo]) return NextResponse.json({ erro: `não deu para ler agora: ${fontes.falhas[def.comodo]}` }, { status: 503 });
    const { itens, total } = itensDoKpi(id, conta, fontes);
    registrarAuditLog({ userId: g.user.id, userName: autorDe(g.user), sistema: 'planta', acao: 'drill', entidade: 'kpi', entidadeId: id, entidadeLabel: def.rotulo, detalhes: { conta, total } });
    return NextResponse.json({ kpi_id: id, conta, rotulo: def.rotulo, tela: def.tela, total, itens }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
