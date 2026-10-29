// GET /api/planta/kpi/<kpi_id>?conta=NOVA|CASTRO|TODAS — os registros que formam um número
// da Planta Viva (até 200), lidos agora das mesmas fontes e pela MESMA seleção do cálculo
// (lib/planta/regras.ts → selecionar). PV e remessas da Omie vêm da lista gravada pela tarefa
// planta-omie-abertos. Número sensível sem admin nem a ação planta:sensivel = 403. Fica no audit_log.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { carregarFontes, lerItensGravados } from '@/lib/planta/server';
import { CATALOGO, itensDoKpi, type ContaPlanta, type ItemKpi } from '@/lib/planta/regras';
import { registrarAuditLog } from '@/lib/server/audit-notify';
import { permite } from '@/lib/permissoes/explicitas';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ admin: true }, { modulo: 'planta' }]);
  if (g.resposta) return g.resposta;

  const { id } = await ctx.params;
  const def = CATALOGO[id];
  if (!def || id === 'robos') return NextResponse.json({ erro: 'número desconhecido' }, { status: 404 });
  if (def.sensivel && !permite(g.user.modulos, g.user.isAdmin, 'planta', 'sensivel')) {
    return NextResponse.json({ erro: 'só admin (ou quem tem "números sensíveis" da Planta) vê o detalhe deste número' }, { status: 403 });
  }

  const c = String(req.nextUrl.searchParams.get('conta') || 'TODAS').toUpperCase();
  const conta: ContaPlanta = def.porConta && (c === 'NOVA' || c === 'CASTRO') ? c : 'TODAS';
  try {
    let lido: { itens: ItemKpi[]; total: number; por_criador: Array<[string, number]> | null };
    if (def.fonte === 'omie') {
      const g2 = await lerItensGravados(id, conta);
      if (!g2) return NextResponse.json({ erro: 'ainda não houve leitura da Omie para este número' }, { status: 503 });
      lido = g2;
    } else {
      const { fontes } = await carregarFontes([def.comodo]);
      if (fontes.falhas[def.comodo]) return NextResponse.json({ erro: `não deu para ler agora: ${fontes.falhas[def.comodo]}` }, { status: 503 });
      lido = itensDoKpi(id, conta, fontes);
    }
    const { itens, total, por_criador } = lido;
    registrarAuditLog({ userId: g.user.id, userName: autorDe(g.user), sistema: 'planta', acao: 'drill', entidade: 'kpi', entidadeId: id, entidadeLabel: def.rotulo, detalhes: { conta, total } });
    return NextResponse.json({ kpi_id: id, conta, rotulo: def.rotulo, tela: def.tela, total, itens, por_criador }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
