// Quests do vendedor — servidor: lê tratores/visitas/localizações, aplica as
// regras (quests-regras.ts) e grava até `limite` sugestões novas por rodada em
// vendas_quests (status `sugerida`, vendedor sugerido pela cidade). O
// supervisor aprova no app (Supervisor → Quests). Tabelas: vendas-pwa/supabase-quests.sql.
// Quem chama: agendador (tarefa vendas-quests-sugerir, diário 06:30) e
// POST /api/crm-vendas/quests/sugerir (botão "Gerar sugestões agora").
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import {
  candidatasDoTrator, escolherSugestoes, vendedorDaCidade, ROTULO_REGRA,
  type Candidata, type ContatoVisita, type QuestExistente, type Regra, type TratorRevisoes,
} from './quests-regras';

export function migracaoQuestsFaltando(msg: string | null | undefined): boolean {
  return /vendas_quests|schema cache|does not exist|PGRST205|42P01/i.test(String(msg || ''));
}

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export interface ResultadoSugestoes {
  candidatas: Record<Regra, number>;
  criadas: number;
  sugestoes: { regra: Regra; titulo: string; vendedor_sugerido_id: number | null }[];
  pulado?: string;
}

export async function sugerirQuests(opts: { limite?: number; gravar?: boolean } = {}): Promise<ResultadoSugestoes> {
  const limite = Math.max(0, Math.min(100, opts.limite ?? 10));
  const hoje = hojeSP();

  const existentesQ = await paginar<QuestExistente>((a, b) => supabaseAdmin
    .from('vendas_quests').select('chave, status, chassis, cliente_nome, regra, alvo_tipo, updated_at, concluida_em')
    .order('id').range(a, b));
  // simulação roda antes da migration: sem a tabela, nada existe ainda
  const semTabela = !!existentesQ.error && migracaoQuestsFaltando(existentesQ.error.message);
  if (existentesQ.error && !(semTabela && opts.gravar === false)) {
    if (semTabela) {
      return { candidatas: vazio(), criadas: 0, sugestoes: [], pulado: 'falta aplicar vendas-pwa/supabase-quests.sql' };
    }
    throw new Error(`vendas_quests: ${existentesQ.error.message}`);
  }

  const [tratQ, visQ, locQ, cidQ] = await Promise.all([
    paginar<TratorRevisoes & { ID: number }>((a, b) => supabaseAdmin.from('tratores').select('*').order('ID').range(a, b)),
    paginar<{ id: number; propriedade_id: number | null; data_visita: string }>((a, b) => supabaseAdmin
      .from('visitas').select('id, propriedade_id, data_visita').is('deleted_at', null).order('id').range(a, b)),
    paginar<{ id: number; chassis: string; confirmado_em: string }>((a, b) => supabaseAdmin
      .from('trator_localizacao').select('id, chassis, confirmado_em').order('id').range(a, b)),
    supabaseAdmin.from('vendedor_cidades').select('vendedor_id, cidade'),
  ]);
  if (tratQ.error) throw new Error(`tratores: ${tratQ.error.message}`);
  if (visQ.error) throw new Error(`visitas: ${visQ.error.message}`);

  // nome do dono de cada propriedade visitada
  const pids = [...new Set(visQ.data.map((v) => v.propriedade_id).filter((x): x is number => x != null))];
  const nomes = new Map<number, (string | null)[]>();
  for (let i = 0; i < pids.length; i += 200) {
    const { data } = await supabaseAdmin.from('portal_nt_clientes_PRINCIPAL')
      .select('id, nome_fantasia, razao_social').in('id', pids.slice(i, i + 200));
    for (const p of (data || []) as { id: number; nome_fantasia: string | null; razao_social: string | null }[]) {
      nomes.set(Number(p.id), [p.nome_fantasia, p.razao_social]);
    }
  }
  const visitas: ContatoVisita[] = visQ.data
    .filter((v) => v.propriedade_id != null && v.data_visita)
    .map((v) => ({ nomes: nomes.get(Number(v.propriedade_id)) || [], data: String(v.data_visita) }));
  const localizacoes = new Map<string, string>();
  for (const l of locQ.data || []) {
    const d = String(l.confirmado_em || '').slice(0, 10);
    if (d && (!localizacoes.has(l.chassis) || d > (localizacoes.get(l.chassis) as string))) localizacoes.set(l.chassis, d);
  }

  const candidatas: Candidata[] = tratQ.data.flatMap((t) => candidatasDoTrator(t, { hoje, localizacoes, visitas }));
  const contagem = vazio();
  for (const c of candidatas) contagem[c.regra]++;
  const escolhidas = escolherSugestoes(candidatas, semTabela ? [] : existentesQ.data, limite, hoje);
  const vendCid = (cidQ.data || []) as { vendedor_id: number; cidade: string }[];
  const linhas = escolhidas.map((c) => ({
    titulo: c.titulo, descricao: null, origem: 'automatica', regra: c.regra, chave: c.chave,
    alvo_tipo: c.alvo_tipo, chassis: c.alvo_tipo === 'trator' ? c.chassis : null, modelo: c.modelo,
    cliente_nome: c.cliente_nome, cidade: c.cidade, motivo: c.motivo, itens: c.itens, xp: c.xp,
    vendedor_sugerido_id: vendedorDaCidade(c.cidade, vendCid), status: 'sugerida', criado_por: `Regra: ${ROTULO_REGRA[c.regra]}`,
  }));

  if (opts.gravar !== false && linhas.length) {
    // chave única: duas rodadas ao mesmo tempo não duplicam
    const { error } = await supabaseAdmin.from('vendas_quests').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true });
    if (error) throw new Error(`gravar sugestões: ${error.message}`);
  }
  return {
    candidatas: contagem,
    criadas: opts.gravar === false ? 0 : linhas.length,
    sugestoes: linhas.map((l) => ({ regra: l.regra as Regra, titulo: l.titulo, vendedor_sugerido_id: l.vendedor_sugerido_id })),
  };
}

function vazio(): Record<Regra, number> {
  return { revisao_chegando: 0, aniversario_entrega: 0, cliente_sumido: 0, trator_sem_noticia: 0 };
}
