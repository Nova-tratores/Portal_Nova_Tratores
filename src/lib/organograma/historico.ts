// Organograma — conta, por pessoa, os rastros do portal que as tarefas deixam (últimos 180 dias).
// Servidor (service role). A regra de sugestão é pura, em ./sugestoes.ts.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { criarIndice, DIAS_HISTORICO, somar, type Contagem } from './sugestoes';

type Linha = Record<string, unknown>;
type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Lê tudo de 1.000 em 1.000 (teto do PostgREST). Tabela que falta ou erro = lista vazia e aviso. */
async function todas(nome: string, montar: (de: number, ate: number) => Pagina): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) { console.warn(`[organograma/historico] ${nome}:`, error.message); return out; }
    out.push(...((data || []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const txt = (v: unknown) => (typeof v === 'string' ? v : '');

export async function contarHistorico(dias = DIAS_HISTORICO): Promise<Contagem> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const [usuarios, logs, ordens, cheques, garantias, requisicoes, ligacoes] = await Promise.all([
    todas('financeiro_usu', (a, b) => supabaseAdmin.from('financeiro_usu').select('id,nome,email').order('id').range(a, b)),
    todas('logs_ppo', (a, b) => supabaseAdmin.from('logs_ppo').select('id,Id_ppo,UsuEmail,acao,Status_Anterior,Status_Atual')
      .gte('created_at', desde).or('acao.ilike."Ordem Criada*",Status_Atual.eq.Concluída').order('id').range(a, b)),
    todas('Ordem_Servico', (a, b) => supabaseAdmin.from('Ordem_Servico').select('Id_Ordem,Tipo_Servico').order('Id_Ordem').range(a, b)),
    todas('revisao_emails', (a, b) => supabaseAdmin.from('revisao_emails').select('id,enviado_por').gte('enviado_em', desde).order('id').range(a, b)),
    todas('garantia_eventos', (a, b) => supabaseAdmin.from('garantia_eventos').select('id,ator').gte('created_at', desde).order('id').range(a, b)),
    todas('audit_log', (a, b) => supabaseAdmin.from('audit_log').select('id,user_id,acao').eq('sistema', 'requisicoes')
      .in('acao', ['criar', 'editar']).gte('created_at', desde).order('id').range(a, b)),
    todas('feedback_chamada', (a, b) => supabaseAdmin.from('feedback_chamada').select('id,atendente_id').gte('iniciada_em', desde).order('id').range(a, b)),
  ]);

  const quem = criarIndice(usuarios as Array<{ id: string; nome: string | null; email: string | null }>);
  const tipo = new Map(ordens.map((o) => [txt(o.Id_Ordem), txt(o.Tipo_Servico)]));
  const c: Contagem = {};

  for (const l of logs) {
    const p = quem(txt(l.UsuEmail));
    if (/^ordem criada/i.test(txt(l.acao))) {
      somar(c, p, 'os_aberta');
      const ts = tipo.get(txt(l.Id_ppo)) || '';
      if (/manuten/i.test(ts)) somar(c, p, 'os_aberta_manutencao');
      if (/revis/i.test(ts)) somar(c, p, 'os_aberta_revisao');
    } else if (txt(l.Status_Atual) === 'Concluída' && l.Status_Anterior && txt(l.Status_Anterior) !== 'Concluída') {
      somar(c, p, 'os_concluida');
    }
  }
  for (const r of cheques) somar(c, quem(txt(r.enviado_por)), 'cheque');
  for (const g of garantias) somar(c, quem(txt(g.ator)), 'garantia');
  for (const a of requisicoes) if (a.user_id) somar(c, `u:${txt(a.user_id)}`, a.acao === 'criar' ? 'requisicao_criar' : 'requisicao_editar');
  for (const f of ligacoes) if (f.atendente_id) somar(c, `u:${txt(f.atendente_id)}`, 'feedback');
  return c;
}
