// =============================================================================
// Lead sem resposta (Fase 5.3 do plano do Marketing, 23/11/2026).
// Lead "novo" há mais de 1 hora de HORÁRIO COMERCIAL sem ninguém atender → aviso no sino para quem cuida dos
// leads (módulo Marketing inteiro ou a tela Leads; sem ninguém, os admins). Um aviso por lead.
// Roda junto do robô de 15 em 15 min ('marketing-contatos-posts'). Lead da roleta não entra (não tem telefone).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { avisarPedido } from './redes/server';

/** Minutos de horário comercial (seg–sex 8h–18h, sáb 8h–12h, horário de Brasília) entre dois instantes. Pura. */
export function minutosComerciais(de: Date, ate: Date): number {
  let min = 0;
  // anda de 15 em 15 minutos: precisão de sobra para "passou de 1 hora"
  for (let t = de.getTime(); t < ate.getTime(); t += 15 * 60_000) {
    const d = new Date(t - 3 * 3600_000);   // Brasília (UTC−3, sem horário de verão)
    const dia = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const aberto = (dia >= 1 && dia <= 5 && h >= 8 && h < 18) || (dia === 6 && h >= 8 && h < 12);
    if (aberto) min += 15;
  }
  return min;
}

async function quemCuidaDosLeads(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('portal_permissoes').select('user_id, is_admin, modulos_permitidos');
  const linhas = (data || []) as Array<{ user_id: string; is_admin: boolean | null; modulos_permitidos: string[] | null }>;
  const deles = linhas.filter((l) => (l.modulos_permitidos || []).some((m) => m === 'marketing' || m.startsWith('marketing:leads'))).map((l) => l.user_id);
  return deles.length ? deles : linhas.filter((l) => l.is_admin).map((l) => l.user_id);
}

export async function alertarLeadsSemResposta(agora = new Date()): Promise<{ pulado?: string; avisados: number }> {
  const desde = new Date(agora.getTime() - 3 * 86_400_000).toISOString();   // lead mais velho que 3 dias não avisa (não vira enxurrada)
  const { data, error } = await supabaseAdmin.from('mkt_leads')
    .select('id, nome, texto, origem, capturado_em').eq('qualificacao', 'novo').is('alerta_sem_resposta_em', null)
    .gte('capturado_em', desde).lte('capturado_em', new Date(agora.getTime() - 3600_000).toISOString()).limit(50);
  if (error) return { pulado: /alerta_sem_resposta_em/.test(error.message) ? 'falta rodar sql/marketing-fase5.sql' : error.message, avisados: 0 };
  const atrasados = (data || []).filter((l) => l.origem !== 'roleta' && minutosComerciais(new Date(l.capturado_em), agora) >= 60);
  if (!atrasados.length) return { avisados: 0 };
  const quem = await quemCuidaDosLeads();
  for (const l of atrasados) {
    const nome = l.nome || String(l.texto || '').slice(0, 40) || 'Contato';
    await avisarPedido(quem, `Lead sem resposta há mais de 1 hora: ${nome}`, `Veio de ${l.origem || 'campanha'}. Quanto antes o retorno, maior a chance de venda.`, '/marketing/leads');
    await supabaseAdmin.from('mkt_leads').update({ alerta_sem_resposta_em: agora.toISOString() }).eq('id', l.id);
  }
  return { avisados: atrasados.length };
}
