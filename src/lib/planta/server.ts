// Planta Viva — leitura das fontes + gravação do resumo (tabela planta_kpi).
// Roda no WORKER pelo agendador (tarefa `planta-snapshot`, a cada 5 min); o site só lê
// planta_kpi. Só LÊ espelhos do Supabase — nenhuma chamada à Omie.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { calcularKpis, hojeBrasilia, CATALOGO, FECHADOS, type Fontes, type Comodo, type Fonte, type LinhaKpi } from './regras';
import { calcularMedias, type Medias, type Meta } from './termometro';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Todas as linhas, de 1.000 em 1.000, com ordem estável (o PostgREST corta em 1.000). */
async function todas(tabela: string, colunas: string, ordem: string, filtro?: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(colunas).order(ordem, { ascending: true }).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const JOBS_ROBOS = ['estoque-sync-recebimentos', 'pecas-alocacao-rapido', 'estoque-sync-estoque', 'estoque-sync-incremental', 'estoque-sync-produtos'];

/** Última rodada de um job (qualquer status) + fim da última rodada OK (cron_runs). */
async function ultimaRodada(job: string): Promise<Row | null> {
  const [{ data: ult }, { data: ok }] = await Promise.all([
    sb.from('cron_runs').select('status,finalizado_em,bloqueio').eq('job', job).order('id', { ascending: false }).limit(1),
    sb.from('cron_runs').select('finalizado_em').eq('job', job).eq('status', 'ok').order('id', { ascending: false }).limit(1),
  ]);
  const u = ult?.[0];
  return u ? { ...u, ultimo_ok: ok?.[0]?.finalizado_em || null } : null;
}
/** cp_sync_log grava sem fuso, em UTC (CLAUDE.md, baixa de contas). */
const utc = (s: unknown) => (s ? (/[Zz]|[+-]\d\d:?\d\d$/.test(String(s)) ? String(s) : String(s) + 'Z') : null);

/** `so` = ler só esses cômodos (drill-down de um número); sem `so`, tudo (o snapshot). */
export async function carregarFontes(so?: Comodo[]): Promise<{ fontes: Fontes; dadoAte: Record<string, string | null> }> {
  const falhas: Fontes['falhas'] = {};
  // Uma leitura que falha (timeout/rede: 4 em 291 rodadas no 1º dia) tenta de novo 1× após 2 s.
  const tentar = async <T>(comodo: Comodo, fn: () => Promise<T>, vazio: T): Promise<T> => {
    if (so && !so.includes(comodo)) return vazio;
    try { return await fn(); } catch {
      await new Promise((r) => setTimeout(r, 2000));
      try { return await fn(); } catch (e) { falhas[comodo] = (e as Error).message; return vazio; }
    }
  };
  const naoFechado = (q: any) => q.not('status_titulo', 'in', `(${FECHADOS.join(',')})`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const COLS = 'id,codigo_lancamento,conta_omie,data_vencimento,data_previsao,valor_documento,valor_pago,status_titulo,numero_documento,numero_documento_fiscal,numero_parcela';

  const [pagar, receber, fila, propostas, zap, revisoesPendentes, garantias, pedidosFabrica, nfMaquinas, pedidos, os, metricasAbertas, requisicoes, alocacao, negativos] = await Promise.all([
    tentar('financeiro', () => todas('contas_pagar', COLS + ',nome_fornecedor', 'id', naoFechado), []),
    tentar('financeiro', () => todas('contas_receber', COLS + ',nome_cliente', 'id', naoFechado), []),
    tentar('financeiro', () => todas('finan_pagar', 'id,valor,criado_em,omie_empresa,status_envio,aguardando_omie_desde,fornecedor,motivo,numero_NF,data_vencimento', 'id', (q) => q.eq('status', 'financeiro')), []),
    tentar('patio', async () => {
      // Propostas em aberto = v_forecast (base do forecast de /propostas) + marca/modelo/vendedor/dias da v_formulario.
      const fc = await todas('v_forecast', 'id,Cliente,status,valor,valor_ponderado,previsao_fechamento,probabilidade', 'id');
      const ids = fc.map((p) => p.id);
      const extra: Row[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await sb.from('v_formulario').select('id,Marca,Modelo,vendedor_nome,dias_na_fase').in('id', ids.slice(i, i + 200));
        extra.push(...((data || []) as Row[]));
      }
      const por = new Map(extra.map((e) => [e.id, e]));
      return fc.map((p) => ({ ...p, ...(por.get(p.id) || {}) }));
    }, []),
    tentar('posvenda', () => todas('tratorilson_solicitacoes', 'id,contato_nome,cliente_nome,resumo,created_at,ultima_msg_em,origem,conversa_id', 'id',
      (q) => q.eq('tipo', 'humano').eq('status', 'nova').in('origem', ['vigia', 'vigia_robo_desligado'])), []),
    tentar('posvenda', () => todas('Ordem_Servico', 'Id_Ordem,Os_Cliente,pendencia_mahindra', 'Id_Ordem', (q) => q.not('pendencia_mahindra', 'is', null)), []),
    tentar('posvenda', () => todas('garantias', 'id,numero,cliente,modelo,chassis,status,enviada_fabrica_em,created_at,id_ordem', 'id',
      (q) => q.not('status', 'in', '(aprovada,rejeitada,cancelada)')), []),
    tentar('patio', () => todas('v_proposta_fabrica', 'id,status,eta_fabrica,dias_atraso_eta,dias_na_fase,cliente,marca,modelo', 'id'), []),
    tentar('patio', () => todas('recebimentos_nfe', 'id_receb,conta_omie,emissao_nfe,qtd_maquinas,valor_maquinas,numero_nfe,fornecedor', 'id_receb', (q) => q.eq('status', 'Faturada').gt('qtd_maquinas', 0)), []),
    tentar('balcao', () => todas('pedidos', 'id_pedido,status,valor_total,status_desde,data,cliente,Tipo_Pedido', 'id_pedido'), []),
    tentar('oficina', () => todas('Ordem_Servico', 'Id_Ordem,Status,Valor_Total,Os_Cliente,Os_Tecnico', 'Id_Ordem'), []),
    tentar('oficina', () => todas('tecnico_metricas', 'id,id_ordem,dias', 'id', (q) => q.is('data_fim', null)), []),
    tentar('almoxarifado', () => todas('Requisicao', 'id,titulo,tipo,status,valor_despeza,created_at,solicitante,fornecedor', 'id',
      (q) => q.or('status.ilike.pedido,status.ilike.completa,status.ilike.aguardando')), []),
    tentar('almoxarifado', () => todas('pecas_alocacao_pendencias', 'id,conta_omie,codigo,codigo_produto,descricao,fornecedor,numero_nfe,recebido_em', 'id', (q) => q.eq('status', 'aberta')), []),
    tentar('almoxarifado', () => todas('produtos', 'codigo_produto,conta_omie,codigo,descricao,estoque', 'codigo_produto', (q) => q.lt('estoque', 0)), []),
  ]);

  // Idade do dado por fonte (e o resumo da sala de máquinas).
  const robos: Row = {};
  const dadoAte: Record<string, string | null> = {};
  await tentar('sala_maquinas', async () => {
    const runs = await Promise.all(JOBS_ROBOS.map(ultimaRodada));
    JOBS_ROBOS.forEach((job, i) => { const r = runs[i]; robos[job] = r ? { status: r.status, fim: r.finalizado_em, ultimo_ok: r.ultimo_ok, bloqueio: !!r.bloqueio } : null; });
    const fins = (jobs: string[]) => jobs.map((j) => robos[j]?.ultimo_ok || null).filter(Boolean).sort().pop() || null;
    dadoAte['recebimentos'] = fins(['pecas-alocacao-rapido', 'estoque-sync-recebimentos']);
    dadoAte['produtos'] = fins(['estoque-sync-estoque', 'estoque-sync-incremental', 'estoque-sync-produtos']);
    for (const conta of ['NOVA', 'CASTRO']) {
      const fins: Array<string | null> = [];
      for (const tipo of ['contas_pagar', 'contas_receber']) {
        const { data } = await sb.from('cp_sync_log').select('fim').eq('tipo', tipo).eq('conta_omie', conta).eq('status', 'ok').order('id', { ascending: false }).limit(1);
        const fim = utc(data?.[0]?.fim);
        robos[`${tipo}:${conta}`] = fim ? { status: 'ok', fim } : null;
        fins.push(fim);
      }
      // idade das contas = a do espelho mais VELHO (pagar ou receber); um sem registro = desconhecida
      dadoAte[`contas:${conta}`] = fins.every(Boolean) ? (fins as string[]).sort()[0] : null;
    }
  }, undefined);

  return { fontes: { hoje: hojeBrasilia(), agora: Date.now(), pagar, receber, fila, propostas, zap, revisoesPendentes, garantias, pedidosFabrica, nfMaquinas, pedidos, os, metricasAbertas, requisicoes, alocacao, negativos, robos, falhas }, dadoAte };
}

function dadoAteDe(l: LinhaKpi, dadoAte: Record<string, string | null>, agora: string): string | null {
  const f: Fonte = l.fonte;
  if (f === 'nativo') return agora;
  if (f === 'contas') {
    if (l.conta === 'TODAS') { const a = dadoAte['contas:NOVA'], b = dadoAte['contas:CASTRO']; return a && b ? (a < b ? a : b) : null; }
    return dadoAte[`contas:${l.conta}`] ?? null;
  }
  return dadoAte[f] ?? null;
}

/** Tabela ausente (migration sql/planta-viva.sql não aplicada). */
export function semTabela(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /planta_kpi/.test(e.message || '') && /not find|does not exist/i.test(e.message || ''));
}

export async function rodarSnapshot(): Promise<{ resumo?: string; pular?: string }> {
  const t0 = Date.now();
  const { fontes, dadoAte } = await carregarFontes();
  const linhas = calcularKpis(fontes);
  const agora = new Date().toISOString();
  const boas = linhas.filter((l) => !l.erro).map((l) => ({ ...l, dado_ate: dadoAteDe(l, dadoAte, agora), calculado_em: agora }));
  // Cômodo com erro NÃO apaga o último número bom: grava só a marca de erro (contagem, valor,
  // detalhe, dado_ate e calculado_em ficam os da última rodada OK — a tela mostra a idade).
  const comErro = linhas.filter((l) => l.erro).map(({ kpi_id, conta, comodo, sensivel, fonte, erro }) => ({ kpi_id, conta, comodo, sensivel, fonte, erro }));
  for (const lote of [boas, comErro]) {
    if (!lote.length) continue;
    const { error } = await sb.from('planta_kpi').upsert(lote, { onConflict: 'kpi_id,conta' });
    if (semTabela(error)) return { pular: 'migration sql/planta-viva.sql não aplicada' };
    if (error) throw new Error(error.message);
  }
  const termo = await gravarHistoricoEMedias(boas, fontes.hoje);
  const falhas = [...new Set(linhas.filter((l) => l.erro).map((l) => `${l.comodo}: ${String(l.erro).slice(0, 120)}`))];
  return { resumo: `${linhas.length} números em ${((Date.now() - t0) / 1000).toFixed(1)} s${termo ? ` · ${termo}` : ''}${falhas.length ? ` · com erro (mantido o último valor) — ${falhas.join(' | ')}` : ''}` };
}

// ── Termômetros (sql/planta-termometros.sql) ──────────────────────────────────
// A linha do dia é regravada a cada rodada (fica o último valor do dia). As médias só
// usam dias FECHADOS, então mudam uma vez por dia: ficam em memória até o dia virar.
let cacheMedias: { dia: string; porChave: Record<string, Medias> } | null = null;

async function gravarHistoricoEMedias(boas: LinhaKpi[], hoje: string): Promise<string | null> {
  const doDia = boas.filter((l) => l.kpi_id !== 'robos').map((l) => ({ kpi_id: l.kpi_id, conta: l.conta, dia: hoje, contagem: l.contagem, valor: l.valor, gravado_em: new Date().toISOString() }));
  const { error } = await sb.from('planta_kpi_dia').upsert(doDia, { onConflict: 'kpi_id,conta,dia' });
  if (error) return /planta_kpi_dia|PGRST205|42P01/.test(`${error.code} ${error.message}`) ? null : `histórico: ${error.message}`;

  if (!cacheMedias || cacheMedias.dia !== hoje) {
    const desde = new Date(new Date(hoje + 'T12:00:00Z').getTime() - 366 * 86400_000).toISOString().slice(0, 10);
    const linhas = await todas('planta_kpi_dia', 'kpi_id,conta,dia,contagem,valor', 'dia', (q) => q.gte('dia', desde).lt('dia', hoje));
    const grupos: Record<string, Row[]> = {};
    for (const r of linhas) (grupos[`${r.kpi_id}|${r.conta}`] ||= []).push(r);
    const porChave: Record<string, Medias> = {};
    for (const [k, xs] of Object.entries(grupos)) porChave[k] = calcularMedias(xs as Array<{ dia: string; valor: number | null; contagem: number }>, hoje);
    cacheMedias = { dia: hoje, porChave };
  }
  const comMedias = boas.filter((l) => l.kpi_id !== 'robos').map(({ kpi_id, conta, comodo, sensivel, fonte }) => ({
    kpi_id, conta, comodo, sensivel, fonte, medias: cacheMedias!.porChave[`${kpi_id}|${conta}`] || {},
  }));
  const r = await sb.from('planta_kpi').upsert(comMedias, { onConflict: 'kpi_id,conta' });
  if (r.error) return /medias/.test(r.error.message) ? null : `médias: ${r.error.message}`;
  return null;
}

/** Metas (sql/planta-termometros.sql); tabela ausente = sem metas. */
export async function lerMetas(): Promise<Record<string, Meta>> {
  const { data, error } = await sb.from('planta_metas').select('kpi_id,meta,tolerancia_pct');
  if (error) return {};
  return Object.fromEntries((data || []).map((m: Row) => [m.kpi_id, { meta: Number(m.meta), tolerancia_pct: Number(m.tolerancia_pct) }]));
}

export async function lerSnapshot(): Promise<{ linhas: Row[]; migracaoFaltando?: boolean }> {
  const { data, error } = await sb.from('planta_kpi').select('*');
  if (semTabela(error)) return { linhas: [], migracaoFaltando: true };
  if (error) throw new Error(error.message);
  return { linhas: (data || []).filter((r: Row) => CATALOGO[r.kpi_id]) };
}
