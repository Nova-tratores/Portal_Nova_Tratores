// ============================================================================
// Planta Viva — regras PURAS (sem banco). Plano: docs/planta-viva-plano.md.
//
// `calcularKpis(fontes)` recebe as linhas cruas já lidas (src/lib/planta/server.ts)
// e devolve uma linha por (kpi_id, conta). Os filtros são os MESMOS das telas
// oficiais — conferido no Gate 0 (19/10/2026): vencidos bateram centavo a centavo
// com /api/dre-financeiro/vencidos.
//
// Nunca importa lib/omie: a planta só lê espelhos (teste em __tests__/regras.test.ts).
// ============================================================================
import { PHASES } from '@/lib/pos/constants';
import { valorOS } from '@/lib/pos/relacao';
import { STATUS_ABERTO_PPV } from '@/lib/ppv/relacao';
import { normalizarStatus } from '@/lib/ppv/utils';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const CONTAS = ['NOVA', 'CASTRO'] as const;
export type ContaPlanta = 'NOVA' | 'CASTRO' | 'TODAS';
export type Fonte = 'contas' | 'recebimentos' | 'produtos' | 'nativo';
export type Comodo = 'financeiro' | 'patio' | 'balcao' | 'oficina' | 'almoxarifado' | 'sala_maquinas';

export interface DefKpi {
  comodo: Comodo;
  rotulo: string;
  sensivel: boolean;        // só admin vê valor e detalhe
  fonte: Fonte;             // de onde vem a idade do dado
  porConta: boolean;        // false = a fonte não separa NOVA/CASTRO (só TODAS)
}

export const CATALOGO: Record<string, DefKpi> = {
  pagar_vencido: { comodo: 'financeiro', rotulo: 'A pagar vencido', sensivel: true, fonte: 'contas', porConta: true },
  pagar_hoje: { comodo: 'financeiro', rotulo: 'A pagar hoje', sensivel: true, fonte: 'contas', porConta: true },
  pagar_7d: { comodo: 'financeiro', rotulo: 'A pagar em 7 dias', sensivel: true, fonte: 'contas', porConta: true },
  receber_vencido: { comodo: 'financeiro', rotulo: 'A receber vencido', sensivel: true, fonte: 'contas', porConta: true },
  receber_hoje: { comodo: 'financeiro', rotulo: 'A receber hoje', sensivel: true, fonte: 'contas', porConta: true },
  receber_7d: { comodo: 'financeiro', rotulo: 'A receber em 7 dias', sensivel: true, fonte: 'contas', porConta: true },
  fluxo_30d: { comodo: 'financeiro', rotulo: 'Saída líquida prevista (30 dias)', sensivel: true, fonte: 'contas', porConta: true },
  fila_financeiro: { comodo: 'financeiro', rotulo: 'Pedidos esperando o financeiro', sensivel: true, fonte: 'nativo', porConta: true },
  maq_pedido_fabrica: { comodo: 'patio', rotulo: 'Pedidos à fábrica em aberto', sensivel: false, fonte: 'nativo', porConta: false },
  maq_recebida_sem_faturar: { comodo: 'patio', rotulo: 'Máquina recebida sem faturar', sensivel: false, fonte: 'nativo', porConta: false },
  maq_em_transito: { comodo: 'patio', rotulo: 'Máquinas a caminho (NF faturada)', sensivel: true, fonte: 'recebimentos', porConta: true },
  maq_receb_esquecido: { comodo: 'patio', rotulo: 'Recebimento de máquina esquecido', sensivel: true, fonte: 'recebimentos', porConta: true },
  ppv_aberto: { comodo: 'balcao', rotulo: 'PPV em aberto', sensivel: false, fonte: 'nativo', porConta: false },
  os_por_fase: { comodo: 'oficina', rotulo: 'OS pendentes', sensivel: false, fonte: 'nativo', porConta: false },
  os_atrasada: { comodo: 'oficina', rotulo: 'OS atrasadas', sensivel: false, fonte: 'nativo', porConta: false },
  os_sem_faturar: { comodo: 'oficina', rotulo: 'OS concluída sem faturar', sensivel: true, fonte: 'nativo', porConta: false },
  pecas_a_alocar: { comodo: 'almoxarifado', rotulo: 'Peças a alocar', sensivel: false, fonte: 'nativo', porConta: true },
  estoque_negativo: { comodo: 'almoxarifado', rotulo: 'Estoque negativo', sensivel: false, fonte: 'produtos', porConta: true },
  robos: { comodo: 'sala_maquinas', rotulo: 'Robôs que alimentam a planta', sensivel: false, fonte: 'nativo', porConta: false },
};

// Intervalo esperado de cada fonte (min): amarelo depois de 2×, vermelho depois de 4×.
export const ESPERADO_MIN: Record<Fonte, number> = { contas: 180, recebimentos: 10, produtos: 60, nativo: 5 };
export type Frescor = 'verde' | 'amarelo' | 'vermelho';
export function frescor(idadeMin: number | null, fonte: Fonte): Frescor {
  if (idadeMin == null || !Number.isFinite(idadeMin)) return 'vermelho';
  const e = ESPERADO_MIN[fonte];
  return idadeMin <= 2 * e ? 'verde' : idadeMin <= 4 * e ? 'amarelo' : 'vermelho';
}

export interface LinhaKpi {
  kpi_id: string;
  conta: ContaPlanta;
  comodo: Comodo;
  contagem: number;
  valor: number | null;
  detalhe: Row;
  sensivel: boolean;
  fonte: Fonte;
  erro: string | null;
}

export interface Fontes {
  hoje: string;               // YYYY-MM-DD em Brasília
  pagar: Row[]; receber: Row[];   // contas_* em aberto
  fila: Row[];                // finan_pagar status='financeiro'
  pedidosFabrica: Row[];      // v_proposta_fabrica
  nfMaquinas: Row[];          // recebimentos_nfe Faturada com qtd_maquinas>0
  pedidos: Row[];             // pedidos (PPV)
  os: Row[];                  // Ordem_Servico
  metricasAbertas: Row[];     // tecnico_metricas data_fim null
  alocacao: Row[];            // pecas_alocacao_pendencias aberta
  negativos: Row[];           // produtos estoque<0
  robos: Row;                 // resumo por job
  falhas: Partial<Record<Comodo, string>>; // leitura que falhou, por cômodo
}

// ---------------------------------------------------------------- utilidades
export const VENCIDOS_IGNORADOS = new Set([2485828573]); // = calc.js
export const FECHADOS = ['PAGO', 'RECEBIDO', 'LIQUIDADO', 'CANCELADO'];
export const JANELA_TRANSITO_DIAS = 45;

const r2 = (v: number) => Math.round(v * 100) / 100;
export function somaDias(iso: string, n: number): string {
  return new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 86400_000).toISOString().slice(0, 10);
}
export function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400_000);
}
/** Datas em DD/MM/AAAA (linhas antigas de recebimentos_nfe) ou ISO → YYYY-MM-DD. */
export function isoDe(d: unknown): string {
  const s = String(d || '');
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10);
}
export function hojeBrasilia(agora = Date.now()): string {
  return new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
}
/** Contraparte NOVA ↔ CASTRO: não é inadimplência real (= /api/dre-financeiro/vencidos). */
export function ehIntercompany(nome: unknown): boolean {
  const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return n.includes('castro pecas') || n.includes('nova tratores');
}
/** Valor em aberto do título (= rota de vencidos: documento − pago; pago vazio → documento). */
export function valorAberto(r: Row): number {
  const d = Number(r.valor_documento) || 0;
  const a = d - (Number(r.valor_pago) || 0);
  return a <= 0.01 ? d : a;
}
export function faixaAtraso(dias: number): '1-30' | '31-60' | '61-90' | '90+' {
  return dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+';
}
const contaDe = (c: unknown) => String(c || '').toUpperCase();

// ---------------------------------------------------------------- cálculo
type Parcial = Omit<LinhaKpi, 'comodo' | 'sensivel' | 'fonte' | 'erro'>;
function linha(p: Parcial): LinhaKpi {
  const d = CATALOGO[p.kpi_id];
  return { ...p, comodo: d.comodo, sensivel: d.sensivel, fonte: d.fonte, erro: null };
}

function financeiro(f: Fontes): Parcial[] {
  const out: Parcial[] = [];
  const anoCorrente = `${f.hoje.slice(0, 4)}-01-01`;
  const ate7 = somaDias(f.hoje, 7);
  const fluxo: Record<string, { receber: number[]; pagar: number[] }> = {};
  for (const [tipo, linhas, colNome] of [['pagar', f.pagar, 'nome_fornecedor'], ['receber', f.receber, 'nome_cliente']] as const) {
    for (const conta of CONTAS) {
      const ls = linhas.filter((r) => contaDe(r.conta_omie) === conta && !FECHADOS.includes(r.status_titulo));
      const venc = ls.filter((r) => r.status_titulo === 'ATRASADO' && r.data_vencimento
        && !VENCIDOS_IGNORADOS.has(Number(r.codigo_lancamento)) && !ehIntercompany(r[colNome]));
      const doAno = venc.filter((r) => String(r.data_vencimento) >= anoCorrente);
      const antigos = venc.filter((r) => String(r.data_vencimento) < anoCorrente);
      const aging: Record<string, number> = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
      for (const r of doAno) aging[faixaAtraso(Math.max(1, diasEntre(String(r.data_vencimento).slice(0, 10), f.hoje)))] += valorAberto(r);
      const soma = (xs: Row[]) => r2(xs.reduce((s, r) => s + valorAberto(r), 0));
      out.push({ kpi_id: `${tipo}_vencido`, conta, contagem: doAno.length, valor: soma(doAno),
        detalhe: { aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, r2(v)])), antes_do_ano: { contagem: antigos.length, valor: soma(antigos) } } });
      const prev = (r: Row) => String(r.data_previsao || '').slice(0, 10);
      const hoje = ls.filter((r) => prev(r) === f.hoje);
      const semana = ls.filter((r) => prev(r) > f.hoje && prev(r) <= ate7);
      out.push({ kpi_id: `${tipo}_hoje`, conta, contagem: hoje.length, valor: soma(hoje), detalhe: {} });
      out.push({ kpi_id: `${tipo}_7d`, conta, contagem: semana.length, valor: soma(semana), detalhe: {} });
      const fx = fluxo[conta] || (fluxo[conta] = { receber: [0, 0, 0, 0, 0], pagar: [0, 0, 0, 0, 0] });
      for (const r of ls) {
        const p = prev(r);
        const i = p ? diasEntre(f.hoje, p) : -1;
        if (i >= 0 && i < 30) fx[tipo][Math.min(4, Math.floor(i / 7))] += valorAberto(r);
      }
    }
  }
  // Sem saldo bancário: a planta mostra a saída líquida prevista por semana (decisão 19/10).
  for (const conta of CONTAS) {
    const fx = fluxo[conta];
    const semanas = fx.receber.map((rec, i) => ({ semana: i + 1, receber: r2(rec), pagar: r2(fx.pagar[i]), liquido: r2(rec - fx.pagar[i]) }));
    out.push({ kpi_id: 'fluxo_30d', conta, contagem: semanas.length, valor: r2(semanas.reduce((s, x) => s + x.liquido, 0)), detalhe: { semanas } });
  }
  for (const conta of CONTAS) {
    // finan_pagar.omie_empresa: "Nova Tratores" | "Castro Peças" (nulo = Nova, padrão do kanban)
    const ls = f.fila.filter((r) => ((/castro/i.test(String(r.omie_empresa || '')) ? 'CASTRO' : 'NOVA') === conta));
    out.push({ kpi_id: 'fila_financeiro', conta, contagem: ls.length, valor: r2(ls.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
      detalhe: { erro_envio: ls.filter((r) => r.status_envio === 'erro').length, aguardando_omie: ls.filter((r) => r.aguardando_omie_desde).length,
        mais_antigo: ls.map((r) => String(r.criado_em || '').slice(0, 10)).filter(Boolean).sort()[0] || null } });
  }
  return out;
}

export const FASES_FABRICA_ANTES = ['Proposta solicitada', 'Proposta Recebida', 'Pedido Feito / Aguardando Maq'];
export const FASES_FABRICA_CHEGOU = ['Proposta Concluida/ Maquina Recebida', 'Aguardando faturamento da fábrica'];

function patio(f: Fontes): Parcial[] {
  const antes = f.pedidosFabrica.filter((r) => FASES_FABRICA_ANTES.includes(r.status));
  const chegou = f.pedidosFabrica.filter((r) => FASES_FABRICA_CHEGOU.includes(r.status));
  const out: Parcial[] = [
    { kpi_id: 'maq_pedido_fabrica', conta: 'TODAS', contagem: antes.length, valor: null,
      detalhe: { com_previsao: antes.filter((r) => r.eta_fabrica).length, atrasados: antes.filter((r) => Number(r.dias_atraso_eta) > 0).length } },
    { kpi_id: 'maq_recebida_sem_faturar', conta: 'TODAS', contagem: chegou.length, valor: null,
      detalhe: { maior_dias_na_fase: chegou.reduce((m, r) => Math.max(m, Number(r.dias_na_fase) || 0), 0) } },
  ];
  for (const conta of CONTAS) {
    const ls = f.nfMaquinas.filter((r) => contaDe(r.conta_omie) === conta)
      .map((r) => ({ ...r, _iso: isoDe(r.emissao_nfe), _dias: diasEntre(isoDe(r.emissao_nfe), f.hoje) }));
    const transito = ls.filter((r) => r._dias <= JANELA_TRANSITO_DIAS);
    const velho = ls.filter((r) => r._dias > JANELA_TRANSITO_DIAS);
    const un = (xs: Row[]) => xs.reduce((s, r) => s + (Number(r.qtd_maquinas) || 0), 0);
    const val = (xs: Row[]) => r2(xs.reduce((s, r) => s + (Number(r.valor_maquinas) || 0), 0));
    out.push({ kpi_id: 'maq_em_transito', conta, contagem: un(transito), valor: val(transito),
      detalhe: { nfs: transito.length, mais_antiga: transito.map((r) => r._iso).sort()[0] || null } });
    out.push({ kpi_id: 'maq_receb_esquecido', conta, contagem: un(velho), valor: val(velho),
      detalhe: { nfs: velho.length, mais_antiga: velho.map((r) => r._iso).sort()[0] || null } });
  }
  return out;
}

function balcao(f: Fontes): Parcial[] {
  const abertos = f.pedidos.filter((r) => STATUS_ABERTO_PPV.includes(normalizarStatus(r.status)));
  const idade: Record<string, number> = { '0-2': 0, '3-7': 0, '8+': 0, 'sem data': 0 };
  for (const r of abertos) {
    const d = r.status_desde ? String(r.status_desde).slice(0, 10) : isoDe(r.data);
    const n = d ? diasEntre(d, f.hoje) : NaN;
    idade[!Number.isFinite(n) ? 'sem data' : n <= 2 ? '0-2' : n <= 7 ? '3-7' : '8+']++;
  }
  return [{ kpi_id: 'ppv_aberto', conta: 'TODAS', contagem: abertos.length,
    valor: r2(abertos.reduce((s, r) => s + (Number(r.valor_total) || 0), 0)), detalhe: { por_idade: idade } }];
}

/** Fases em que o serviço terminou e falta faturar (Executada → Cobrando Cliente). */
export const FASES_SEM_FATURAR = ['Executada', 'Executada aguardando comercial', 'Relatório Concluído', 'Enviar Omie', 'Enviado Para Omie', 'Cobrando Cliente'];

function oficina(f: Fontes): Parcial[] {
  // "Atrasada" = mesmo mapaAtraso de /api/pos/ordens: métrica aberta com dias > 0.
  const atraso: Record<string, number> = {};
  for (const m of f.metricasAbertas) atraso[m.id_ordem] = Math.max(atraso[m.id_ordem] || 0, Number(m.dias) || 0);
  const pend = f.os.filter((r) => r.Status !== 'Concluída' && r.Status !== 'Cancelada');
  const porFase: Record<string, number> = {};
  for (const r of pend) { const k = (PHASES as readonly string[]).includes(r.Status) ? r.Status : 'Outras'; porFase[k] = (porFase[k] || 0) + 1; }
  const atrasadas = pend.filter((r) => (atraso[r.Id_Ordem] || 0) > 0);
  const sf = pend.filter((r) => FASES_SEM_FATURAR.includes(r.Status));
  return [
    { kpi_id: 'os_por_fase', conta: 'TODAS', contagem: pend.length, valor: null, detalhe: { por_fase: porFase } },
    { kpi_id: 'os_atrasada', conta: 'TODAS', contagem: atrasadas.length, valor: null,
      detalhe: { maior_atraso_dias: atrasadas.reduce((m, r) => Math.max(m, atraso[r.Id_Ordem] || 0), 0) } },
    { kpi_id: 'os_sem_faturar', conta: 'TODAS', contagem: sf.length, valor: r2(sf.reduce((s, r) => s + valorOS({ valor: r.Valor_Total }), 0)), detalhe: {} },
  ];
}

function almoxarifado(f: Fontes): Parcial[] {
  return CONTAS.flatMap((conta) => [
    { kpi_id: 'pecas_a_alocar', conta, contagem: f.alocacao.filter((r) => contaDe(r.conta_omie) === conta).length, valor: null, detalhe: {} },
    { kpi_id: 'estoque_negativo', conta, contagem: f.negativos.filter((r) => contaDe(r.conta_omie) === conta).length, valor: null, detalhe: {} },
  ]);
}

const BLOCOS: Array<[Comodo, (f: Fontes) => Parcial[]]> = [
  ['financeiro', financeiro], ['patio', patio], ['balcao', balcao], ['oficina', oficina], ['almoxarifado', almoxarifado],
  ['sala_maquinas', (f) => [{ kpi_id: 'robos', conta: 'TODAS', contagem: Object.keys(f.robos).length, valor: null, detalhe: f.robos }]],
];

/** Linhas com erro para todos os KPIs de um cômodo (leitura ou cálculo falhou). */
function linhasComErro(comodo: Comodo, erro: string): LinhaKpi[] {
  return Object.entries(CATALOGO).filter(([, d]) => d.comodo === comodo).flatMap(([id, d]) =>
    (d.porConta ? [...CONTAS, 'TODAS' as const] : ['TODAS' as const]).map((conta) => ({
      kpi_id: id, conta, comodo, contagem: 0, valor: null, detalhe: {}, sensivel: d.sensivel, fonte: d.fonte, erro })));
}

/** KPI por conta → acrescenta a linha TODAS (soma de contagem e valor; detalhe fica por conta). */
function comTodas(ls: LinhaKpi[]): LinhaKpi[] {
  const out = [...ls];
  const porId = new Map<string, LinhaKpi[]>();
  for (const l of ls) if (l.conta !== 'TODAS') porId.set(l.kpi_id, [...(porId.get(l.kpi_id) || []), l]);
  for (const [id, xs] of porId) {
    const temValor = xs.some((x) => x.valor != null);
    out.push({ ...xs[0], kpi_id: id, conta: 'TODAS', contagem: xs.reduce((s, x) => s + x.contagem, 0),
      valor: temValor ? r2(xs.reduce((s, x) => s + (x.valor || 0), 0)) : null,
      detalhe: Object.fromEntries(xs.map((x) => [x.conta, x.detalhe])) });
  }
  return out;
}

export function calcularKpis(f: Fontes): LinhaKpi[] {
  const out: LinhaKpi[] = [];
  for (const [comodo, fn] of BLOCOS) {
    if (f.falhas[comodo]) { out.push(...linhasComErro(comodo, f.falhas[comodo]!)); continue; }
    try { out.push(...comTodas(fn(f).map(linha))); } catch (e) { out.push(...linhasComErro(comodo, (e as Error).message)); }
  }
  return out;
}

// ---------------------------------------------------------------- leitura pela rota
export interface KpiTela extends LinhaKpi { rotulo: string; dado_ate: string | null; calculado_em: string | null; idade_min: number | null; frescor: Frescor; lacrado: boolean }

/** Para quem não é admin: KPI sensível volta sem valor e sem detalhe (só a contagem). */
export function prepararParaUsuario(ls: Array<LinhaKpi & { dado_ate?: string | null; calculado_em?: string | null }>, isAdmin: boolean, agora = Date.now()): KpiTela[] {
  return ls.map((l) => {
    const idade = l.dado_ate ? Math.round((agora - new Date(l.dado_ate).getTime()) / 60000) : null;
    const lacrado = l.sensivel && !isAdmin;
    return {
      ...l, rotulo: CATALOGO[l.kpi_id]?.rotulo || l.kpi_id,
      valor: lacrado ? null : l.valor, detalhe: lacrado ? {} : l.detalhe,
      dado_ate: l.dado_ate ?? null, calculado_em: l.calculado_em ?? null,
      idade_min: idade, frescor: l.erro ? 'vermelho' : frescor(idade, l.fonte), lacrado,
    };
  });
}

/** Linhas para a conta pedida: a da conta quando o KPI separa por conta, senão a TODAS. */
export function filtrarConta<T extends { kpi_id: string; conta: string }>(ls: T[], conta: ContaPlanta): T[] {
  return ls.filter((l) => (CATALOGO[l.kpi_id]?.porConta ? l.conta === conta : l.conta === 'TODAS'));
}
