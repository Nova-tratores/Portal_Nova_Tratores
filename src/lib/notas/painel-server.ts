// Painel de notas + Central de erros da Omie — leitura do BANCO (nunca chama a Omie).
// Cada fonte é lida sozinha: se uma tabela falta (migration não aplicada) ou dá erro,
// vira um aviso e as outras seguem. Regras em ./painel.ts.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar, emLotes } from '@/lib/db/paginar';
import {
  daOS, daRemessa, doRetornoGarantia, daReversao, daNotaSemDoc, daAuditoria, doCron,
  marcarResolvidas, chaveResolucao, agruparRobos, ordenarEFiltrar, contarPorSituacao, totaisDiaMes, hojeBR,
  STATUS_OS_PROBLEMA,
  type Empresa, type LinhaPainel, type OSRow, type EmissaoRow, type ReversaoRow, type NotaSemDocRow,
  type AuditRow, type CronRow, type NotaTotalRow, type Totais,
} from './painel';

type Erro = { message?: string; code?: string } | null;

const faltaTabela = (e: Erro) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message || ''));

async function fonte<T>(nome: string, avisos: string[], fazer: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fazer();
  } catch (e) {
    const err = e as Erro;
    avisos.push(faltaTabela(err) ? `${nome}: tabela ainda não criada (migration não aplicada).` : `${nome}: não deu para ler (${err?.message || String(e)}).`);
    return [];
  }
}

function ok<T>(r: { data: T[] | null; error: Erro }): T[] {
  if (r.error) throw r.error;
  return r.data || [];
}

/** Data ISO de N dias atrás. */
function diasAtras(n: number, agora = new Date()): string {
  return new Date(agora.getTime() - n * 86400_000).toISOString();
}

// ── aba Problemas ─────────────────────────────────────────────────────────

export interface RespPainel { linhas: LinhaPainel[]; contagem: ReturnType<typeof contarPorSituacao>; avisos: string[] }

export async function lerProblemas(empresa: Empresa, agora = new Date()): Promise<RespPainel> {
  const avisos: string[] = [];
  const [os, remessas, retornos, reversoes, semDoc] = await Promise.all([
    fonte<OSRow>('Ordens de serviço', avisos, async () => ok(await supabaseAdmin
      .from('Ordem_Servico')
      .select('Id_Ordem,Os_Cliente,Valor_Total,faturamento_status,faturamento_erro,faturado_por,faturado_omie_em,faturando_desde')
      .in('faturamento_status', [...STATUS_OS_PROBLEMA])
      .limit(500))),
    fonte<EmissaoRow>('Remessas', avisos, async () => ok(await supabaseAdmin
      .from('remessas_emissoes')
      .select('id,conta_omie,tipo,status,erro,nf_numero,cliente,valor_total,user_nome,criado_em,atualizado_em,id_remessa_ref,n_cod')
      .neq('status', 'cancelada')
      .or('status.neq.faturada,nf_numero.is.null')
      .order('criado_em', { ascending: false })
      .limit(300))),
    fonte<EmissaoRow>('Devolução em garantia', avisos, async () => ok(await supabaseAdmin
      .from('garantia_retornos')
      .select('id,conta_omie,status,erro,nf_numero,fornecedor,valor_total,user_nome,criado_em,atualizado_em,garantia_id,id_receb,numero_nfe')
      .neq('status', 'cancelada')
      .or('status.neq.faturada,nf_numero.is.null')
      .order('criado_em', { ascending: false })
      .limit(300))),
    fonte<ReversaoRow>('Reversão de recebimento', avisos, async () => ok(await supabaseAdmin
      .from('recebimento_reversoes')
      .select('id,conta_omie,id_receb,numero_nfe,fornecedor,valor_nfe,status,erro,user_nome,criado_em,atualizado_em')
      .in('status', ['falhou', 'parcial', 'revertendo', 'aguardando_relancamento'])
      .limit(300))),
    fonte<NotaSemDocRow>('Arquivo das notas', avisos, async () => (await paginar<NotaSemDocRow>((de, ate) => supabaseAdmin
      .from('notas_fiscais_docs')
      .select('conta_omie,tipo,numero,ultimo_erro,tentativas,atualizado_em')
      .not('ultimo_erro', 'is', null)
      .gte('tentativas', 3)
      .order('id')
      .range(de, ate) as unknown as PromiseLike<{ data: NotaSemDocRow[] | null; error: { message: string } | null }>, { max: 5000 })).data),
  ]);

  const linhas: LinhaPainel[] = [];
  for (const r of os) { const l = daOS(r, agora); if (l) linhas.push(l); }
  for (const r of remessas) { const l = daRemessa(r, agora); if (l) linhas.push(l); }
  for (const r of retornos) { const l = doRetornoGarantia(r, agora); if (l) linhas.push(l); }
  for (const r of reversoes) { const l = daReversao(r, agora); if (l) linhas.push(l); }
  if (empresa) { const l = daNotaSemDoc(semDoc, empresa); if (l) linhas.push(l); }
  else for (const e of ['NOVA', 'CASTRO'] as const) { const l = daNotaSemDoc(semDoc, e); if (l) linhas.push(l); }

  const filtradas = ordenarEFiltrar(linhas, empresa);
  return { linhas: filtradas, contagem: contarPorSituacao(filtradas), avisos };
}

// ── aba Envios ao Omie ────────────────────────────────────────────────────

const SISTEMAS_AUDIT = ['pos', 'ppv', 'pedidos-maquinas', 'remessas', 'recebimentos', 'financeiro', 'localizacao', 'clientes'];

/** O caso que falhou já está certo hoje? (só OS e PPV, que têm situação clara no banco) */
async function resolucoes(linhas: LinhaPainel[], avisos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const os = [...new Set(linhas.filter((l) => l.origem === 'Faturar OS' && l.documento).map((l) => l.documento))];
  const ppv = [...new Set(linhas.filter((l) => l.origem === 'Faturar PPV' && l.documento).map((l) => l.documento))];
  const [osRows, ppvRows] = await Promise.all([
    fonte<{ Id_Ordem: string; faturamento_status: string | null; nfse_numero: string | null; recibo_numero?: string | null }>('Situação atual das OS', avisos, async () =>
      (await emLotes(os, (p) => supabaseAdmin.from('Ordem_Servico').select('Id_Ordem,faturamento_status,nfse_numero,recibo_numero').in('Id_Ordem', p) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>)).data),
    fonte<{ id_pedido: string; faturado_omie_em: string | null; nf_numero: string | null }>('Situação atual dos PPV', avisos, async () =>
      (await emLotes(ppv, (p) => supabaseAdmin.from('pedidos').select('id_pedido,faturado_omie_em,nf_numero').in('id_pedido', p) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>)).data),
  ]);
  for (const r of osRows) {
    if (r.faturamento_status === 'nfse_autorizada') mapa.set(chaveResolucao('Faturar OS', r.Id_Ordem), `NFS-e ${r.nfse_numero || ''} autorizada`.replace('  ', ' '));
    else if (r.faturamento_status === 'recibo_emitido') mapa.set(chaveResolucao('Faturar OS', r.Id_Ordem), `recibo ${r.recibo_numero || ''} emitido`.replace('  ', ' '));
  }
  for (const r of ppvRows) {
    if (r.faturado_omie_em && r.nf_numero) mapa.set(chaveResolucao('Faturar PPV', r.id_pedido), `faturado, NF-e ${String(r.nf_numero).replace(/^0+/, '')}`);
  }
  return mapa;
}

export async function lerEnvios(empresa: Empresa, dias: number, agora = new Date()): Promise<RespPainel> {
  const avisos: string[] = [];
  const desde = diasAtras(Math.min(Math.max(dias, 1), 90), agora);
  const [audit, crons] = await Promise.all([
    fonte<AuditRow>('Histórico (audit_log)', avisos, async () => ok(await supabaseAdmin
      .from('audit_log')
      .select('id,user_nome,sistema,acao,entidade,entidade_id,entidade_label,detalhes,created_at')
      .gte('created_at', desde)
      .in('sistema', SISTEMAS_AUDIT)
      .or('acao.like.*_erro,acao.like.*_falhou,acao.like.*_recusado,acao.like.*_desconhecido,acao.eq.erro_envio_omie,acao.eq.erro_gravar')
      .order('created_at', { ascending: false })
      .limit(1000))),
    fonte<CronRow>('Robôs (cron_runs)', avisos, async () => ok(await supabaseAdmin
      .from('cron_runs')
      .select('id,job,status,detalhe,iniciado_em,quem,disparado_por')
      .gte('iniciado_em', desde)
      .in('status', ['erro', 'bloqueio', 'interrompida'])
      .order('iniciado_em', { ascending: false })
      .limit(500))),
  ]);
  const pessoas: LinhaPainel[] = [];
  for (const a of audit) { const l = daAuditoria(a); if (l) pessoas.push(l); }
  const robos: LinhaPainel[] = [];
  for (const c of crons) { const l = doCron(c); if (l) robos.push(l); }
  const resolvidas = marcarResolvidas(pessoas, await resolucoes(pessoas, avisos));
  const linhas = ordenarEFiltrar([...resolvidas, ...agruparRobos(robos)], empresa);
  return { linhas, contagem: contarPorSituacao(linhas), avisos };
}

// ── totais do dia e do mês (aba Notas) ────────────────────────────────────

export async function lerTotais(empresa: Empresa, podeEntrada: boolean, agora = new Date()): Promise<{ totais: Totais; avisos: string[] }> {
  const avisos: string[] = [];
  const dia = hojeBR(agora);
  const inicio = `${dia.slice(0, 7)}-01`;
  const ler = (cols: string) => paginar<NotaTotalRow>((de, ate) => {
    let q = supabaseAdmin.from('notas_fiscais_docs').select(cols).gte('data_emissao', inicio).lte('data_emissao', dia);
    if (empresa) q = q.eq('conta_omie', empresa);
    if (!podeEntrada) q = q.neq('tipo', 'entrada');
    return q.order('id').range(de, ate) as unknown as PromiseLike<{ data: NotaTotalRow[] | null; error: { message: string } | null }>;
  }, { max: 30000 });
  let r = await ler('data_emissao,tipo,categoria,valor,cancelada');
  if (r.error && /categoria/.test(r.error.message)) {
    avisos.push('Tipo das NF-e (peças/máquinas) indisponível: falta aplicar sql/notas-fiscais-categoria.sql.');
    r = await ler('data_emissao,tipo,valor,cancelada');
  }
  if (r.error) avisos.push(`Totais: ${r.error.message}`);
  return { totais: totaisDiaMes(r.data, dia), avisos };
}
