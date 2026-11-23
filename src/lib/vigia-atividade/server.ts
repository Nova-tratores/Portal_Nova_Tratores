// Vigia de atividade suspeita — casca do servidor (11/2026). Regras em ./regras.ts.
// Lê as últimas 26 h do audit_log e 2 dias do portal_uso_api, grava os alertas novos em
// vigia_atividade_alertas (UNIQUE chave = não repete) e manda UM aviso no sino por rodada.
// Só avisa: nada é bloqueado.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { detectar, DESTINATARIOS_VIGIA, type Alerta, type Evento, type UsoApi } from './regras';
export { DESTINATARIOS_VIGIA, podeVerAlertas } from './regras';

export const LINK_ALERTAS = '/atividades?tab=alertas';

const TABELA = 'vigia_atividade_alertas';
const semTabela = (msg?: string) => /vigia_atividade_alertas|PGRST205|does not exist|schema cache/i.test(String(msg || ''));

async function lerPaginado<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, teto = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < teto; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function nomesDe(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const m = new Map<string, string>();
  if (!unicos.length) return m;
  const { data } = await sb.from('financeiro_usu').select('id, nome').in('id', unicos);
  for (const u of (data || []) as Array<{ id: string; nome: string | null }>) if (u.nome) m.set(u.id, u.nome);
  return m;
}

export async function rodarVigiaAtividade(agora: Date = new Date()): Promise<{ pular?: string; resumo: string }> {
  // tabela existe?
  const teste = await sb.from(TABELA).select('id').limit(1);
  if (teste.error) {
    if (semTabela(teste.error.message)) return { pular: 'falta aplicar sql/vigia-atividade.sql', resumo: '' };
    throw new Error(teste.error.message);
  }

  const desde = new Date(agora.getTime() - 26 * 3600 * 1000).toISOString();
  const eventos = await lerPaginado<Evento>((de, ate) => sb.from('audit_log')
    .select('id, user_id, user_nome, sistema, acao, entidade, entidade_id, entidade_label, detalhes, created_at')
    .gte('created_at', desde).order('id', { ascending: true }).range(de, ate));
  const diaDesde = new Date(agora.getTime() - 2 * 864e5).toISOString().slice(0, 10);
  let uso: UsoApi[] = [];
  try {
    uso = await lerPaginado<UsoApi>((de, ate) => sb.from('portal_uso_api')
      .select('user_id, rota, dia, chamadas').gte('dia', diaDesde).range(de, ate));
  } catch { /* sem o monitor de uso, segue só com o audit_log */ }

  // nomes: autor (o registro às vezes tem o e-mail) e a pessoa que teve a permissão mudada
  const nomes = await nomesDe([
    ...eventos.map((e) => e.user_id || ''),
    ...eventos.filter((e) => e.sistema === 'permissoes' && e.entidade === 'usuario').map((e) => e.entidade_id || ''),
    ...uso.map((u) => u.user_id),
  ]);
  for (const e of eventos) {
    if (e.user_id && nomes.has(e.user_id)) e.user_nome = nomes.get(e.user_id)!;
    if (e.sistema === 'permissoes' && e.entidade === 'usuario' && !e.entidade_label && e.entidade_id) e.entidade_label = nomes.get(e.entidade_id) || null;
  }

  const alertas = detectar(eventos, uso).map((a) => (a.user_id && nomes.has(a.user_id) ? { ...a, user_nome: nomes.get(a.user_id)! } : a));
  if (!alertas.length) return { resumo: `${eventos.length} registros lidos, nada suspeito` };

  // grava só os novos (a chave repetida é ignorada)
  const ehDestinatario = (a: Alerta) => DESTINATARIOS_VIGIA.some((d) => d.id === a.user_id);
  const linhas = alertas.map((a) => ({
    chave: a.chave, tipo: a.tipo, gravidade: a.gravidade, user_id: a.user_id, user_nome: a.user_nome,
    titulo: a.titulo.slice(0, 300), descricao: a.descricao.slice(0, 2000), quando: a.quando, detalhes: a.detalhes,
    notificado: !ehDestinatario(a),
  }));
  const { data: novos, error } = await sb.from(TABELA).upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true }).select('chave, titulo, descricao, gravidade, notificado');
  if (error) throw new Error(error.message);
  const paraAvisar = ((novos || []) as Array<{ titulo: string; descricao: string | null; gravidade: string; notificado: boolean }>).filter((n) => n.notificado);

  if (paraAvisar.length) {
    const altas = paraAvisar.filter((n) => n.gravidade === 'alta').length;
    const titulo = paraAvisar.length === 1
      ? `Atividade a conferir: ${paraAvisar[0].titulo}`
      : `${paraAvisar.length} atividades a conferir${altas ? ` (${altas} importante${altas > 1 ? 's' : ''})` : ''}`;
    const descricao = paraAvisar.length === 1
      ? String(paraAvisar[0].descricao || '')
      : paraAvisar.slice(0, 5).map((n) => `• ${n.titulo}`).join('\n') + (paraAvisar.length > 5 ? `\n… e mais ${paraAvisar.length - 5}` : '');
    const { error: eN } = await sb.from('portal_notificacoes').insert(DESTINATARIOS_VIGIA.map((d) => ({
      user_id: d.id, tipo: 'atividades', titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link: LINK_ALERTAS,
    })));
    if (eN) console.warn('[vigia-atividade] sino:', eN.message);
  }
  const novosN = (novos || []).length;
  return { resumo: `${eventos.length} registros lidos · ${novosN} alerta(s) novo(s) · ${paraAvisar.length} avisado(s)` };
}

export type AlertaGravado = {
  id: number; chave: string; tipo: string; gravidade: string; user_id: string | null; user_nome: string | null;
  titulo: string; descricao: string | null; quando: string; detalhes: Record<string, unknown>;
  notificado: boolean; situacao: string; situacao_por: string | null; situacao_em: string | null;
};

export async function listarAlertas(dias = 30): Promise<{ alertas: AlertaGravado[]; migracaoFaltando?: boolean }> {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const { data, error } = await sb.from(TABELA).select('*').gte('quando', desde).order('quando', { ascending: false }).limit(1000);
  if (error) {
    if (semTabela(error.message)) return { alertas: [], migracaoFaltando: true };
    throw new Error(error.message);
  }
  return { alertas: (data || []) as AlertaGravado[] };
}

export async function marcarAlerta(id: number, situacao: 'novo' | 'visto' | 'normal' | 'investigar', por: string): Promise<void> {
  const { error } = await sb.from(TABELA).update({ situacao, situacao_por: por, situacao_em: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
