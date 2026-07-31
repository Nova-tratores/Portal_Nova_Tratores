// Garantias — alerta de prazo da DEVOLUÇÃO DE PEÇAS à fábrica (prova de
// destruição). Chamado por GitHub Actions (garantias-devolucoes.yml, 1x/dia
// 08:00 BRT) com x-cron-secret. Anti-spam em 3 camadas: cron diário + rearme
// só após 3 dias (devolucao_alertado_em) + limit(100).
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS } from '@/lib/garantias/constants';
import { notificarGarantistas } from '@/lib/garantias/server';
import { diasAte } from '@/lib/garantias/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
    if (provided !== secret) return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  }

  // Datas em BRT (-3h fixo), senão um dispatch manual à noite desloca a janela
  // e o rearme em +1 dia (o slice de toISOString é a data UTC).
  const ymdBRT = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
  const agora = Date.now();
  const hoje = ymdBRT(agora);
  const em5dias = ymdBRT(agora + 5 * 86400000);
  const ha2dias = ymdBRT(agora - 2 * 86400000);

  // Pendentes com prazo chegando (<= 5 dias, o que já inclui vencidas) e que
  // não foram alertadas nos últimos 3 dias. O .or é obrigatório: .lt sozinho
  // excluiria as nunca alertadas (NULL).
  const { data: pendentes, error } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, devolucao_prazo')
    .eq('status', 'aprovada')
    .eq('devolucao_status', 'pendente')
    .lte('devolucao_prazo', em5dias)
    .or(`devolucao_alertado_em.is.null,devolucao_alertado_em.lt.${ha2dias}`)
    .limit(100);
  if (error) {
    console.error('[garantias/devolucoes] consulta falhou:', error.message);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  let alertados = 0;
  for (const g of pendentes || []) {
    // diasAte é dias-calendário em BRT: 0 = vence hoje, negativo = atraso exato.
    const dias = diasAte(g.devolucao_prazo);
    const titulo =
      dias != null && dias < 0
        ? `Devolução de peças da ${g.numero} venceu há ${Math.abs(dias)} dia(s)`
        : dias === 0
          ? `Devolução de peças da ${g.numero} vence HOJE`
          : `Devolução de peças da ${g.numero} vence em ${dias ?? '?'} dia(s)`;
    await notificarGarantistas({
      titulo,
      descricao: `OS ${g.id_ordem} — envie as peças usadas à fábrica (prova de destruição) e registre no card.`,
      link: `/garantias?id=${g.id}`,
    });
    await supabase
      .from(TBL_GARANTIAS)
      .update({ devolucao_alertado_em: hoje })
      .eq('id', g.id);
    alertados++;
  }

  return NextResponse.json({ ok: true, candidatos: (pendentes || []).length, alertados });
}

export async function POST(req: NextRequest) { return executar(req); }
export async function GET(req: NextRequest) { return executar(req); }
