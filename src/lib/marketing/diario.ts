// =============================================================================
// MARKETING — rotina diária (Fase 2 do plano do Marketing, 23/11/2026).
// Roda pelo agendador do portal (tarefa 'marketing-diario', sql/marketing-fase2.sql), às 07:30.
//
//   1. Promoção ligada que já venceu → desliga (o site já esconde pela data; aqui o portal fica coerente).
//   2. Promoção que vence em até 3 dias → avisa no sino quem cuida das promoções. Uma vez por promoção.
//   3. Campanha "em andamento" sem nada novo há 7+ dias (custo, lead, proposta) → avisa o responsável.
//      Repete no máximo a cada 7 dias. (Post não entra: o calendário ainda não é ligado à campanha.)
//
// Idempotente: os marcadores aviso_fim_em / alerta_parada_em impedem aviso repetido.
// =============================================================================
import { db } from './db';
import { avisarPedido } from './redes/server';

const DIA = 86_400_000;
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Quem cuida das promoções: módulo Marketing inteiro ou a tela Promoções. Sem ninguém, os admins. */
async function quemCuidaDasPromocoes(): Promise<string[]> {
  const { data } = await db.from('portal_permissoes').select('user_id, is_admin, modulos_permitidos');
  const linhas = (data || []) as Array<{ user_id: string; is_admin: boolean | null; modulos_permitidos: string[] | null }>;
  const deles = linhas.filter((l) => (l.modulos_permitidos || []).some((m) => m === 'marketing' || m.startsWith('marketing:promocoes'))).map((l) => l.user_id);
  return deles.length ? deles : linhas.filter((l) => l.is_admin).map((l) => l.user_id);
}

export async function cronMarketingDiario(agora = new Date()) {
  const hoje = isoDia(agora);
  const em3 = isoDia(new Date(agora.getTime() + 3 * DIA));
  const r = { promocoesDesligadas: 0, promocoesAvisadas: 0, campanhasAvisadas: 0, erros: [] as string[] };

  // 1) promoções vencidas
  try {
    const { data, error } = await db.from('site_promocoes').update({ ativo: false, atualizado_em: agora.toISOString(), atualizado_por: 'Portal (venceu)' })
      .eq('ativo', true).lt('fim', hoje).select('id');
    if (error) throw new Error(error.message);
    r.promocoesDesligadas = (data || []).length;
  } catch (e) { r.erros.push(`vencidas: ${(e as Error).message}`); }

  // 2) promoções vencendo em até 3 dias
  try {
    const { data, error } = await db.from('site_promocoes').select('id, titulo, fim')
      .eq('ativo', true).gte('fim', hoje).lte('fim', em3).is('aviso_fim_em', null);
    if (error) throw new Error(error.message);
    const lista = (data || []) as Array<{ id: string; titulo: string; fim: string }>;
    if (lista.length) {
      const quem = await quemCuidaDasPromocoes();
      for (const p of lista) {
        const dias = Math.round((Date.parse(p.fim) - Date.parse(hoje)) / DIA);
        await avisarPedido(quem, `Promoção acaba ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}: ${p.titulo}`,
          `Ela sai do site depois de ${p.fim.split('-').reverse().join('/')}. Se for continuar, mude a data de fim.`, '/marketing/promocoes');
        await db.from('site_promocoes').update({ aviso_fim_em: agora.toISOString() }).eq('id', p.id);
        r.promocoesAvisadas++;
      }
    }
  } catch (e) { r.erros.push(`vencendo: ${(e as Error).message}`); }

  // 3) campanhas em andamento paradas
  try {
    const seteDias = new Date(agora.getTime() - 7 * DIA).toISOString();
    const { data, error } = await db.from('mkt_acoes').select('id, nome, responsavel_id, criado_em, alerta_parada_em')
      .eq('status', 'em_andamento').is('deleted_at', null).not('responsavel_id', 'is', null).lt('criado_em', seteDias);
    if (error) throw new Error(error.message);
    for (const a of (data || []) as Array<{ id: string; nome: string; responsavel_id: string; alerta_parada_em: string | null }>) {
      if (a.alerta_parada_em && a.alerta_parada_em > seteDias) continue;   // avisou há menos de 7 dias
      const [c, l, p] = await Promise.all([
        db.from('mkt_custos').select('id', { count: 'exact', head: true }).eq('acao_id', a.id).gte('criado_em', seteDias),
        db.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('acao_id', a.id).gte('capturado_em', seteDias),
        db.from('mkt_acao_propostas').select('id', { count: 'exact', head: true }).eq('acao_id', a.id).gte('criado_em', seteDias),
      ]);
      if ((c.count || 0) + (l.count || 0) + (p.count || 0) > 0) continue;
      await avisarPedido([a.responsavel_id], `Campanha parada há 7 dias: ${a.nome}`,
        'Está "em andamento", mas nada novo foi lançado (custo, lead ou proposta) na última semana. Ela ainda está rodando?', `/marketing/${a.id}`);
      await db.from('mkt_acoes').update({ alerta_parada_em: agora.toISOString() }).eq('id', a.id);
      r.campanhasAvisadas++;
    }
  } catch (e) { r.erros.push(`campanhas: ${(e as Error).message}`); }

  return r;
}
