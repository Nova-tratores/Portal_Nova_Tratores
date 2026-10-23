// Executor ÚNICO da mudança automática de fase por data (regra em fase-auto.ts).
// Chamado pela lista do POS (no máximo a cada 5 min) e pelo agendador diário — os dois
// rodam a MESMA regra, então não brigam mais entre si. Respeita quem mudou a fase na mão.
import { supabase } from '@/lib/pos/supabase';
import { TBL_OS, TBL_LOGS_PPO } from '@/lib/pos/constants';
import { aplicarMudancaFase } from '@/lib/pos/fase';
import { decidirFaseAuto, ehRobo, hojeBrasilia, type MudancaManual } from '@/lib/pos/fase-auto';

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

    // última troca de fase feita por uma PESSOA, por OS (dia em Brasília + de qual fase saiu)
    const manual = new Map<string, MudancaManual & { em: string }>();
    const ids = candidatas.map((o) => String(o.Id_Ordem));
    for (let i = 0; i < ids.length; i += 20) {
      // o banco devolve no máximo 1000 linhas por vez: pagina
      for (let de = 0; ; de += 1000) {
        const { data: logs } = await supabase.from(TBL_LOGS_PPO)
          .select('Id_ppo, UsuEmail, Status_Anterior, Status_Atual, created_at')
          .in('Id_ppo', ids.slice(i, i + 20))
          .order('id', { ascending: true })
          .range(de, de + 999);
        for (const l of logs || []) {
          if (!l.Status_Anterior || l.Status_Anterior === l.Status_Atual || ehRobo(l.UsuEmail)) continue;
          const k = String(l.Id_ppo);
          const atual = manual.get(k);
          if (!atual || String(l.created_at) > atual.em) manual.set(k, { dia: hojeBrasilia(new Date(l.created_at)), de: String(l.Status_Anterior), em: String(l.created_at) });
        }
        if (!logs || logs.length < 1000) break;
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
