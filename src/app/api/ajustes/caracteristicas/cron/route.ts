import { NextRequest, NextResponse } from 'next/server';
import { iniciarSyncCaracteristicas } from '@/lib/ajustes/caracteristicas';
import { comCronRun } from '@/lib/cron/observar';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sync diário de `produtos_caracteristicas` (ListarProdutos da Omie, as duas contas).
// Até 01/10/2026 esse espelho só era atualizado pelo botão "Sincronizar agora" de
// /ajustes/caracteristicas — ficou 2 meses parado e as Etiquetas do PPV (que leem
// daqui) não achavam peça cadastrada depois do último clique.
//
// FIRE-AND-FORGET (mesmo padrão de /api/estoque/cron/sync-produtos): a varredura
// leva ~6 min e o proxy do Railway corta requests longas. Respondemos 200 já; a
// promise vive no servidor node. O lock de `ajustes_jobs` evita rodar em dobro
// com a tela; `comCronRun` registra em `cron_runs` pra tela /agendamentos.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // RESERVA (Etapa 3 do plano docs/omie-fila-agendador-plano.md): desde 15/10/2026 o
  // agendador do portal roda este sync às 20:00. O GitHub (que dispara de manhã) só
  // roda se o portal NÃO tiver terminado bem nas últimas 20 h.
  const desde = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data: feito } = await supabaseAdmin.from('cron_runs').select('iniciado_em')
    .eq('job', 'ajustes-sync-caracteristicas').eq('status', 'ok').in('disparado_por', ['agendador', 'botao', 'marcado'])
    .gte('iniciado_em', desde).limit(1);
  if (feito?.length) {
    return NextResponse.json({ sucesso: true, pulado: `o agendador do portal já rodou (${feito[0].iniciado_em})` });
  }
  comCronRun('ajustes-sync-caracteristicas', async () => {
    const r = await iniciarSyncCaracteristicas('cron', { aguardar: true });
    if (r.jaRodando) return { pulado: 'sync já em andamento pela tela', jobId: r.jobId };
    if (!r.ok) throw new Error(r.erro || 'sync falhou');
    return r.resumo;
  }, { lockMinutos: 60, disparadoPor: 'github' })
    .then((r) => console.log('[cron sync-caracteristicas]', r.pulado ? 'pulado (já rodando)' : r.erro ? 'erro: ' + r.erro : 'concluído', JSON.stringify(r.resultado ?? {})))
    .catch((e) => console.error('[cron sync-caracteristicas] erro', (e as Error).message));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
