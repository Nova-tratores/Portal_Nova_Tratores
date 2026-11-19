// GET /api/financeiro/notas/painel?aba=totais|problemas|envios&conta=NOVA|CASTRO&dias=7
// totais    = notas de hoje e do mês por tipo (financeiro:notas)
// problemas = notas rejeitadas/presas, remessas/devoluções sem NF, notas sem PDF/XML (financeiro:notas-problemas)
// envios    = falhas de gravação na Omie (pessoas, audit_log) + robôs com erro (financeiro:notas-problemas)
// Só lê o banco. Plano: docs/painel-notas-e-erros-omie.md
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { permite } from '@/lib/permissoes/explicitas';
import { podeVerEntrada } from '@/lib/notas/cache-regras';
import { empresaDe } from '@/lib/notas/painel';
import { lerProblemas, lerEnvios, lerTotais } from '@/lib/notas/painel-server';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'financeiro', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;
  const u = guarda.user;
  const sp = req.nextUrl.searchParams;
  const aba = sp.get('aba') || 'totais';
  const empresa = empresaDe(sp.get('conta'));
  const podeProblemas = permite(u.modulos, u.isAdmin, 'financeiro', 'notas-problemas');

  try {
    if (aba === 'totais') {
      const r = await lerTotais(empresa, podeVerEntrada(u.isAdmin, u.modulos));
      return NextResponse.json({ ...r, podeProblemas });
    }
    if (!podeProblemas) return NextResponse.json({ error: 'Sem permissão para Problemas / Envios ao Omie.' }, { status: 403 });
    if (aba === 'problemas') return NextResponse.json(await lerProblemas(empresa));
    if (aba === 'envios') {
      const dias = parseInt(sp.get('dias') || '7', 10) || 7;
      const r = await lerEnvios(empresa, dias);
      // contadores da porta da Omie: só Dev, e só deste processo (o worker tem os dele)
      let porta: unknown = null;
      const a = await autenticar(req);
      if (a?.isDev) {
        const { estadoPorta } = await import('@/lib/omie/porta');
        porta = estadoPorta();
      }
      return NextResponse.json({ ...r, porta });
    }
    return NextResponse.json({ error: 'aba inválida' }, { status: 400 });
  } catch (e) {
    console.error('[notas/painel]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 });
  }
}
