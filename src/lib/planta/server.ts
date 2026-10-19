// Planta Viva — leitura das fontes + gravação do resumo (tabela planta_kpi).
// Roda no WORKER pelo agendador (tarefa `planta-snapshot`, a cada 5 min); o site só lê
// planta_kpi. Só LÊ espelhos do Supabase — nenhuma chamada à Omie.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { calcularKpis, hojeBrasilia, CATALOGO, FECHADOS, type Fontes, type Comodo, type Fonte, type LinhaKpi } from './regras';

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

export async function carregarFontes(): Promise<{ fontes: Fontes; dadoAte: Record<string, string | null> }> {
  const falhas: Fontes['falhas'] = {};
  const tentar = async <T>(comodo: Comodo, fn: () => Promise<T>, vazio: T): Promise<T> => {
    try { return await fn(); } catch (e) { falhas[comodo] = (e as Error).message; return vazio; }
  };
  const naoFechado = (q: any) => q.not('status_titulo', 'in', `(${FECHADOS.join(',')})`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const COLS = 'id,codigo_lancamento,conta_omie,data_vencimento,data_previsao,valor_documento,valor_pago,status_titulo';

  const [pagar, receber, fila, pedidosFabrica, nfMaquinas, pedidos, os, metricasAbertas, alocacao, negativos] = await Promise.all([
    tentar('financeiro', () => todas('contas_pagar', COLS + ',nome_fornecedor', 'id', naoFechado), []),
    tentar('financeiro', () => todas('contas_receber', COLS + ',nome_cliente', 'id', naoFechado), []),
    tentar('financeiro', () => todas('finan_pagar', 'id,valor,criado_em,omie_empresa,status_envio,aguardando_omie_desde', 'id', (q) => q.eq('status', 'financeiro')), []),
    tentar('patio', () => todas('v_proposta_fabrica', 'id,status,eta_fabrica,dias_atraso_eta,dias_na_fase', 'id'), []),
    tentar('patio', () => todas('recebimentos_nfe', 'id_receb,conta_omie,emissao_nfe,qtd_maquinas,valor_maquinas', 'id_receb', (q) => q.eq('status', 'Faturada').gt('qtd_maquinas', 0)), []),
    tentar('balcao', () => todas('pedidos', 'id_pedido,status,valor_total,status_desde,data', 'id_pedido'), []),
    tentar('oficina', () => todas('Ordem_Servico', 'Id_Ordem,Status,Valor_Total', 'Id_Ordem'), []),
    tentar('oficina', () => todas('tecnico_metricas', 'id,id_ordem,dias', 'id', (q) => q.is('data_fim', null)), []),
    tentar('almoxarifado', () => todas('pecas_alocacao_pendencias', 'id,conta_omie', 'id', (q) => q.eq('status', 'aberta')), []),
    tentar('almoxarifado', () => todas('produtos', 'codigo_produto,conta_omie', 'codigo_produto', (q) => q.lt('estoque', 0)), []),
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

  return { fontes: { hoje: hojeBrasilia(), pagar, receber, fila, pedidosFabrica, nfMaquinas, pedidos, os, metricasAbertas, alocacao, negativos, robos, falhas }, dadoAte };
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
  const rows = linhas.map((l) => ({ ...l, dado_ate: dadoAteDe(l, dadoAte, agora), calculado_em: agora }));
  const { error } = await sb.from('planta_kpi').upsert(rows, { onConflict: 'kpi_id,conta' });
  if (semTabela(error)) return { pular: 'migration sql/planta-viva.sql não aplicada' };
  if (error) throw new Error(error.message);
  const erros = linhas.filter((l) => l.erro).map((l) => l.comodo);
  return { resumo: `${rows.length} números em ${((Date.now() - t0) / 1000).toFixed(1)} s${erros.length ? ` · com erro: ${[...new Set(erros)].join(', ')}` : ''}` };
}

export async function lerSnapshot(): Promise<{ linhas: Row[]; migracaoFaltando?: boolean }> {
  const { data, error } = await sb.from('planta_kpi').select('*');
  if (semTabela(error)) return { linhas: [], migracaoFaltando: true };
  if (error) throw new Error(error.message);
  return { linhas: (data || []).filter((r: Row) => CATALOGO[r.kpi_id]) };
}
