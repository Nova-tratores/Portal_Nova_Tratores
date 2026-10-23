// Executor ÚNICO da mudança automática de fase por data (regra em fase-auto.ts).
// Chamado pela lista do POS (no máximo a cada 5 min) e pelo agendador diário — os dois
// rodam a MESMA regra, então não brigam mais entre si. Respeita quem mudou a fase na mão.
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS, TBL_LOGS_PPO } from '@/lib/pos/constants';
import { aplicarMudancaFase } from '@/lib/pos/fase';
import { decidirFaseAuto, ehRobo, hojeBrasilia } from '@/lib/pos/fase-auto';

export interface MovidaAuto { id: string; de: string; para: string; motivo: string }

let rodando = false;

export async function moverOSPorData(): Promise<{ movidas: MovidaAuto[]; respeitadas: number }> {
  if (rodando) return { movidas: [], respeitadas: 0 }; // lista e agendador ao mesmo tempo: uma rodada só
  rodando = true;
  try {
    const hoje = hojeBrasilia();
    const { data: ordens, error } = await supabase.from(TBL_OS)
      .select('Id_Ordem, Status, Previsao_Execucao, Dias_Execucao, Previsao_Faturamento, faturado_omie_em')
      .not('Status', 'in', '("Concluída","Cancelada")')
      .is('faturado_omie_em', null);
    if (error) throw new Error(error.message);

    // só olha o histórico das que a regra moveria (sem considerar a pessoa ainda)
    const candidatas = (ordens || []).filter((o) => decidirFaseAuto(o, hoje, null));
    if (!candidatas.length) return { movidas: [], respeitadas: 0 };

    // última troca de fase feita por uma PESSOA, por OS (dia em Brasília)
    const manual = new Map<string, string>();
    const ids = candidatas.map((o) => String(o.Id_Ordem));
    for (let i = 0; i < ids.length; i += 100) {
      const { data: logs } = await supabase.from(TBL_LOGS_PPO)
        .select('Id_ppo, UsuEmail, Status_Anterior, Status_Atual, created_at')
        .in('Id_ppo', ids.slice(i, i + 100))
        .order('id', { ascending: false })
        .limit(5000);
      for (const l of logs || []) {
        if (!l.Status_Anterior || l.Status_Anterior === l.Status_Atual || ehRobo(l.UsuEmail)) continue;
        const dia = hojeBrasilia(new Date(l.created_at));
        const k = String(l.Id_ppo);
        if (!manual.has(k) || dia > manual.get(k)!) manual.set(k, dia);
      }
    }

    const movidas: MovidaAuto[] = [];
    let respeitadas = 0;
    for (const os of candidatas) {
      const id = String(os.Id_Ordem);
      const d = decidirFaseAuto(os, hoje, manual.get(id) || null);
      if (!d) { respeitadas++; continue; }
      const de = String(os.Status || '');
      const r = await aplicarMudancaFase(id, d.destino, 'Automático (datas)', {
        notificar: false,
        acaoLog: `Fase automática por data: ${de} → ${d.destino} (${d.motivo})`,
      });
      if (r.changed) movidas.push({ id, de, para: d.destino, motivo: d.motivo });
    }
    return { movidas, respeitadas };
  } finally {
    rodando = false;
  }
}
