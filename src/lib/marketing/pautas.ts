// =============================================================================
// Ideias de post que nascem do próprio portal (Fase 6.1 do plano do Marketing, 24/11/2026).
// Roda 1x por dia junto do robô 'marketing-diario'. Cria posts com status 'ideia' e sem data
// (aparecem em "Ideias sem data" no calendário), já com etiquetas sugeridas e o link da origem nas anotações.
//
//   venda fechada (proposta "Concluida-Vendido") ......... "Filmar a entrega"
//   revisão concluída (OS tipo Revisão) .................. "Pedir depoimento"
//   1 ano da compra ...................................... "1 ano com a máquina: agradecer + lembrar revisão"
//   busca no site sem resultado (2+ vezes na semana) ..... "Procuraram X e não acharam"
//
// Cada ideia tem origem_ref única (ex.: 'venda:128'): rodar de novo não duplica (sql/marketing-fase6.sql).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { gerarCodigo } from './redes/etiquetas';
import { PROPOSTA_VENDIDA } from './tipos';

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const primeiroNome = (s: unknown) => String(s || '').trim().split(/\s+/)[0] || '';
/** "Modelo: JIVO\nChassis: …" → "JIVO" */
const modeloDaOS = (txt: unknown) => /Modelo:\s*([^\n]+)/i.exec(String(txt || ''))?.[1]?.trim() || '';

type Ideia = {
  origem_ref: string; titulo: string; notas: string; etiqueta_tipo: string; formato: string;
  gente_real: boolean | null; gancho: string | null; maquina: string | null;
};

export async function gerarIdeiasDePost(agora = new Date()): Promise<{ pulado?: string; criadas: number }> {
  const desde = iso(new Date(agora.getTime() - 2 * DIA));
  const ideias: Ideia[] = [];

  // 1) venda fechada nos últimos 2 dias → filmar a entrega
  const { data: vendas } = await supabaseAdmin.from('v_formulario')
    .select('id, "Modelo", "Cliente", vendedor_nome, fechado_em, deleted_at, status_ui')
    .eq('status', PROPOSTA_VENDIDA).gte('fechado_em', `${desde}T00:00:00-03:00`).limit(50);
  for (const p of (vendas || []) as Record<string, unknown>[]) {
    if (p.deleted_at || p.status_ui === 'Lixeira') continue;
    const modelo = String(p.Modelo || '').trim() || 'máquina';
    ideias.push({
      origem_ref: `venda:${p.id}`, titulo: `Filmar a entrega: ${modelo}`.slice(0, 120),
      notas: `Máquina vendida para ${p.Cliente || 'cliente'}${p.vendedor_nome ? ` (vendedor ${primeiroNome(p.vendedor_nome)})` : ''}. Filmar a entrega (30 a 60 s), com o cliente se ele topar. Proposta #${p.id}.`,
      etiqueta_tipo: 'entrega', formato: 'reels', gente_real: true, gancho: 'pessoa', maquina: modelo,
    });
  }

  // 2) revisão concluída nos últimos 2 dias → pedir depoimento
  const { data: revisoes } = await supabaseAdmin.from('Ordem_Servico')
    .select('"Id_Ordem", "Os_Cliente", "Serv_Solicitado", "Data_Fim_Servico"')
    .eq('Tipo_Servico', 'Revisão').eq('Status', 'Concluída').gte('Data_Fim_Servico', desde).limit(50);
  for (const o of (revisoes || []) as Record<string, unknown>[]) {
    const modelo = modeloDaOS(o.Serv_Solicitado);
    ideias.push({
      origem_ref: `revisao:${o.Id_Ordem}`, titulo: `Pedir depoimento: revisão${modelo ? ` ${modelo}` : ''}`.slice(0, 120),
      notas: `Revisão concluída (${o.Id_Ordem}) para ${o.Os_Cliente || 'cliente'}. Pedir um depoimento curto: como foi o atendimento e como a máquina está.`,
      etiqueta_tipo: 'depoimento', formato: 'reels', gente_real: true, gancho: 'pessoa', maquina: modelo || null,
    });
  }

  // 3) 1 ano da compra (fechou há exatamente 365 dias)
  const umAno = iso(new Date(agora.getTime() - 365 * DIA));
  const { data: aniv } = await supabaseAdmin.from('v_formulario')
    .select('id, "Modelo", "Cliente", fechado_em, deleted_at')
    .eq('status', PROPOSTA_VENDIDA).gte('fechado_em', `${umAno}T00:00:00-03:00`).lte('fechado_em', `${umAno}T23:59:59-03:00`).limit(50);
  for (const p of (aniv || []) as Record<string, unknown>[]) {
    if (p.deleted_at) continue;
    const modelo = String(p.Modelo || '').trim() || 'máquina';
    ideias.push({
      origem_ref: `aniversario:${p.id}`, titulo: `1 ano com a ${modelo}`.slice(0, 120),
      notas: `${p.Cliente || 'Cliente'} comprou a ${modelo} há 1 ano (proposta #${p.id}). Post de agradecimento e lembrete da revisão — melhor ainda com foto da máquina trabalhando.`,
      etiqueta_tipo: 'data', formato: 'feed', gente_real: true, gancho: 'outro', maquina: modelo,
    });
  }

  // 4) busca no site sem resultado (2+ vezes nos últimos 7 dias) → ideia de post/dica
  const { data: buscas } = await supabaseAdmin.from('site_eventos').select('evento, rotulo')
    .like('evento', 'busca_sem_resultado_%').gte('em', new Date(agora.getTime() - 7 * DIA).toISOString()).limit(2000);
  const conta = new Map<string, { termo: string; n: number }>();
  for (const b of (buscas || []) as { rotulo: string | null }[]) {
    const termo = String(b.rotulo || '').trim();
    if (termo.length < 3) continue;
    const k = termo.toLowerCase();
    conta.set(k, { termo, n: (conta.get(k)?.n || 0) + 1 });
  }
  const semana = iso(new Date(agora.getTime() - ((agora.getUTCDay() + 6) % 7) * DIA));   // segunda da semana
  for (const [k, v] of conta) {
    if (v.n < 2) continue;
    ideias.push({
      origem_ref: `busca:${k}:${semana}`, titulo: `Procuraram "${v.termo}" no site e não acharam`.slice(0, 120),
      notas: `${v.n} buscas por "${v.termo}" sem resultado no site nesta semana. Ideia: post mostrando o que a Nova tem disso (ou a alternativa), ou uma dica.`,
      etiqueta_tipo: 'dica', formato: 'feed', gente_real: null, gancho: 'pergunta', maquina: null,
    });
  }

  if (!ideias.length) return { criadas: 0 };

  // só as que ainda não existem
  const { data: ja, error } = await supabaseAdmin.from('site_posts').select('origem_ref').in('origem_ref', ideias.map((i) => i.origem_ref));
  if (error) return { pulado: /origem_ref/.test(error.message) ? 'falta rodar sql/marketing-fase6.sql' : error.message, criadas: 0 };
  const existe = new Set((ja || []).map((x) => x.origem_ref));
  const novas = ideias.filter((i) => !existe.has(i.origem_ref)).map((i) => ({
    ...i, status: 'ideia', quando: null, redes: ['instagram', 'facebook'], midia: {}, resultado: {},
    codigo: gerarCodigo(i.maquina || i.titulo), criado_por: 'Portal (ideia automática)', atualizado_por: 'Portal (ideia automática)',
  }));
  if (!novas.length) return { criadas: 0 };
  const { error: e2 } = await supabaseAdmin.from('site_posts').insert(novas);
  if (e2) return { pulado: e2.message, criadas: 0 };
  return { criadas: novas.length };
}
