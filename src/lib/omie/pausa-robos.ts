// Pausa dos robôs do Omie guardada no banco: o faturamento roda no serviço web e boa
// parte dos robôs no worker (PAPEL=web/worker) — cada um tem a sua fila da porta, então
// a pausa precisa passar pelo banco. Usada só pela porta (src/lib/omie/porta.ts).
// Tabela: sql/omie-pausa-robos.sql. Sem a tabela, a porta segue com a pausa local.
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const FONTE_PAUSA = {
  async lerAte(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('omie_pausa_robos')
      .select('ate')
      .gt('ate', new Date().toISOString())
      .order('ate', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0]?.ate ? new Date(data[0].ate as string).getTime() : 0;
  },
  async gravar(id: string, ate: number | null, motivo: string): Promise<void> {
    if (ate === null) {
      await supabaseAdmin.from('omie_pausa_robos').delete().eq('id', id);
      // limpeza: pausas vencidas há mais de 1 dia (processo que caiu no meio)
      await supabaseAdmin.from('omie_pausa_robos').delete().lt('ate', new Date(Date.now() - 86_400_000).toISOString());
      return;
    }
    const { error } = await supabaseAdmin
      .from('omie_pausa_robos')
      .upsert({ id, motivo: motivo.slice(0, 200), ate: new Date(ate).toISOString() });
    if (error) throw error;
  },
};
