// Push do app de vendas (crm.novatratores.com): avisos no celular do vendedor com
// o app fechado. Mesmas chaves VAPID do push do portal (lib/push/portal-server.ts);
// aparelhos em vendas_push_inscricoes (vendas-pwa/supabase-push.sql).
// Nunca lança para quem chama: push não derruba nada.
import webpush, { type PushSubscription } from 'web-push';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { pushLigado } from '@/lib/push/portal-server';
import { avisosManha, avisosTarde, diaBR, type Aviso, type VisitaAviso } from './push-avisos';

export const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const TAB = 'vendas_push_inscricoes';

export function tabelaFaltando(msg: string) { return /vendas_push_|schema cache|does not exist/i.test(msg); }

interface Inscricao { endpoint: string; inscricao: PushSubscription; falhas: number | null }

/** vendedorId null = todos os vendedores com aparelho inscrito. */
export async function enviarPushVendedor(vendedorId: number | null, aviso: { titulo: string; corpo?: string; link?: string; tag?: string }) {
  if (!pushLigado()) return { enviados: 0, total: 0, pulado: 'VAPID não configurado' };
  let q = supabaseAdmin.from(TAB).select('endpoint, inscricao, falhas');
  if (vendedorId != null) q = q.eq('vendedor_id', vendedorId);
  const { data, error } = await q;
  if (error) return { enviados: 0, total: 0, pulado: error.message };
  const lista = (data || []) as Inscricao[];
  const corpo = JSON.stringify({ titulo: aviso.titulo.slice(0, 120), corpo: (aviso.corpo || '').slice(0, 300), link: aviso.link || '/', tag: aviso.tag });
  let enviados = 0;
  await Promise.all(lista.map(async (i) => {
    try {
      await webpush.sendNotification(i.inscricao, corpo, { TTL: 6 * 3600, urgency: 'high' });
      enviados++;
      await supabaseAdmin.from(TAB).update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq('endpoint', i.endpoint);
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410 || (i.falhas || 0) >= 4) await supabaseAdmin.from(TAB).delete().eq('endpoint', i.endpoint);
      else await supabaseAdmin.from(TAB).update({ falhas: (i.falhas || 0) + 1 }).eq('endpoint', i.endpoint);
    }
  }));
  return { enviados, total: lista.length };
}

/** Marca a chave como enviada; false = já tinha saído (não manda de novo). */
async function primeiraVez(chave: string) {
  const { error } = await supabaseAdmin.from('vendas_push_enviados').insert({ chave });
  return !error;
}

async function nomesPropriedades(ids: number[]) {
  const mapa = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin.from('portal_nt_clientes_PRINCIPAL').select('id, nome_fantasia, razao_social').in('id', ids.slice(i, i + 200));
    for (const p of data || []) mapa.set(Number(p.id), String(p.nome_fantasia || p.razao_social || '').trim());
  }
  return (id: number) => mapa.get(id) || 'cliente';
}

/** Tarefa do agendador: manhã (retornos do dia) ou tarde (visitas de hoje sem retorno). */
export async function rodarAvisosVendas(momento: 'manha' | 'tarde') {
  if (!pushLigado()) return { pular: 'VAPID não configurado' };
  const teste = await supabaseAdmin.from(TAB).select('vendedor_id');
  if (teste.error) return { pular: tabelaFaltando(teste.error.message) ? 'falta aplicar vendas-pwa/supabase-push.sql' : teste.error.message };
  const comAparelho = new Set((teste.data || []).map((r) => Number(r.vendedor_id)));
  if (!comAparelho.size) return { resumo: 'nenhum aparelho inscrito' };

  const hoje = diaBR(new Date());
  const desde = momento === 'manha' ? new Date(Date.now() - 400 * 86400000) : new Date(`${hoje}T03:00:00Z`);
  const visitas: VisitaAviso[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin.from('visitas')
      .select('id, vendedor_id, propriedade_id, data_visita, data_proximo_contato, proximos_passos')
      .is('deleted_at', null).in('vendedor_id', [...comAparelho]).gte('data_visita', desde.toISOString())
      .order('id').range(de, de + 999);
    if (error) throw new Error(error.message);
    visitas.push(...((data || []) as VisitaAviso[]));
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(visitas.map((v) => v.propriedade_id).filter((x): x is number => !!x))];
  const nome = await nomesPropriedades(ids);
  const avisos: Aviso[] = momento === 'manha' ? avisosManha(visitas, nome, hoje) : avisosTarde(visitas, nome, hoje);

  let enviados = 0, vendedores = 0;
  for (const a of avisos) {
    if (!(await primeiraVez(a.chave))) continue;
    const r = await enviarPushVendedor(a.vendedorId, { titulo: a.titulo, corpo: a.corpo, link: a.link, tag: a.chave });
    enviados += r.enviados;
    if (r.enviados) vendedores++;
  }
  return { resumo: `${momento}: ${avisos.length} aviso(s) · ${vendedores} vendedor(es) · ${enviados} aparelho(s)` };
}
