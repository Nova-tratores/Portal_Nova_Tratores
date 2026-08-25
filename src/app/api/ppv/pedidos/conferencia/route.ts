// PPV × rastreio — CONFERÊNCIA liberado × faturado.
//   ?id=PPV-0001    → conferência detalhada de um pedido (itens × unidades,
//                     flags liberada_nao_faturada / faturada_sem_liberacao /
//                     sem_rastreio / rastreio_excedente)
//   ?divergentes=1  → PPVs faturados/terminais que ainda têm unidade presa —
//                     a lista do "questionamento" (peça liberada sem NF).
import { NextRequest, NextResponse } from 'next/server';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { conferirPPV, listarPPVsDivergentes } from '@/lib/pecas/ppv-vinculo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, 'ppv', 'rastreio_liberar');
    const sp = req.nextUrl.searchParams;

    if (sp.get('divergentes') === '1') {
      return NextResponse.json({ ppvs: await listarPPVsDivergentes() });
    }

    const id = (sp.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Informe ?id= ou ?divergentes=1.' }, { status: 400 });
    const conf = await conferirPPV(id);
    if (!conf) return NextResponse.json({ error: `PPV ${id} não encontrado.` }, { status: 404 });
    return NextResponse.json(conf);
  } catch (e) {
    const status = (e as { http?: number })?.http || 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status });
  }
}
