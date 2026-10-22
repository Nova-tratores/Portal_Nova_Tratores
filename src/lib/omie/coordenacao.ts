// Coordenação da porta da Omie entre os processos (PAPEL=web × PAPEL=worker) pelo banco:
// a vaga de gravação (uma por vez por chave) e o disjuntor (bloqueio da Omie visto por
// um processo vale para o outro). Usada só pela porta (src/lib/omie/porta.ts).
// Tabelas: sql/omie-coordenacao.sql. Sem elas, a porta segue com a coordenação local.
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export interface BloqueioExterno { chave: string; metodo: string; ate: number; motivo: string; criadoEm: number }

export const FONTE_COORDENACAO = {
  async pegarVaga(chave: string, dono: string, ms: number, metodo: string, processo: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('omie_pegar_vaga_gravacao', {
      p_chave: chave, p_dono: dono, p_ms: Math.round(ms), p_metodo: metodo, p_processo: processo,
    });
    if (error) throw error;
    return data === true;
  },
  async soltarVaga(chave: string, dono: string): Promise<void> {
    await supabaseAdmin.from('omie_vaga_gravacao').delete().eq('chave', chave).eq('dono', dono);
  },
  async lerBloqueios(): Promise<BloqueioExterno[]> {
    const { data, error } = await supabaseAdmin
      .from('omie_bloqueios')
      .select('chave, metodo, ate, motivo, criado_em')
      .gt('ate', new Date().toISOString())
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((b) => ({
      chave: b.chave as string,
      metodo: b.metodo as string,
      ate: new Date(b.ate as string).getTime(),
      motivo: (b.motivo as string) || '',
      criadoEm: new Date(b.criado_em as string).getTime(),
    }));
  },
  async gravarBloqueio(chave: string, metodo: string, ate: number, motivo: string, processo: string): Promise<void> {
    const { error } = await supabaseAdmin.from('omie_bloqueios').upsert({
      chave, metodo, ate: new Date(ate).toISOString(), motivo: motivo.slice(0, 300), processo, criado_em: new Date().toISOString(),
    });
    if (error) throw error;
    // limpeza: bloqueios vencidos há mais de 1 dia
    await supabaseAdmin.from('omie_bloqueios').delete().lt('ate', new Date(Date.now() - 86_400_000).toISOString());
  },
  async liberarBloqueio(chave: string, metodo: string): Promise<void> {
    await supabaseAdmin.from('omie_bloqueios').delete().eq('chave', chave).eq('metodo', metodo);
  },
};

export type FonteCoordenacao = typeof FONTE_COORDENACAO;
