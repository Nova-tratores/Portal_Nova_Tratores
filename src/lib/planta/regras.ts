// ============================================================================
// Planta Viva — regras PURAS (sem banco). Plano: docs/planta-viva-plano.md.
//
// `calcularKpis(fontes)` recebe as linhas cruas já lidas (src/lib/planta/server.ts)
// e devolve uma linha por (kpi_id, conta). Os filtros são os MESMOS das telas
// oficiais — conferido no Gate 0 (19/10/2026): vencidos bateram centavo a centavo
// com /api/dre-financeiro/vencidos.
//
// `selecionar(kpi, conta, fontes)` é a FONTE ÚNICA dos registros de cada número:
// o cálculo e a lista do detalhe (itensDoKpi) usam a mesma seleção, então o que o
// clique mostra é exatamente o que somou.
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
  tela: string;             // tela oficial onde o número se confere
}

export const CATALOGO: Record<string, DefKpi> = {
  pagar_vencido: { comodo: 'financeiro', rotulo: 'A pagar vencido', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/vencidos' },
  pagar_hoje: { comodo: 'financeiro', rotulo: 'A pagar hoje', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  pagar_7d: { comodo: 'financeiro', rotulo: 'A pagar em 7 dias', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  receber_vencido: { comodo: 'financeiro', rotulo: 'A receber vencido', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/vencidos' },
  receber_hoje: { comodo: 'financeiro', rotulo: 'A receber hoje', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  receber_7d: { comodo: 'financeiro', rotulo: 'A receber em 7 dias', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  pagar_90d: { comodo: 'financeiro', rotulo: 'A pagar em 90 dias', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  receber_90d: { comodo: 'financeiro', rotulo: 'A receber em 90 dias', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/calendario' },
  fluxo_30d: { comodo: 'financeiro', rotulo: 'Saída líquida prevista (30 dias)', sensivel: true, fonte: 'contas', porConta: true, tela: '/dre-financeiro/curva-saldo' },
  fila_financeiro: { comodo: 'financeiro', rotulo: 'Pedidos esperando o financeiro', sensivel: true, fonte: 'nativo', porConta: true, tela: '/financeiro/home-financeiro' },
  propostas_abertas: { comodo: 'patio', rotulo: 'Propostas de máquina em aberto', sensivel: true, fonte: 'nativo', porConta: false, tela: '/propostas' },
  maq_pedido_fabrica: { comodo: 'patio', rotulo: 'Pedidos à fábrica em aberto', sensivel: false, fonte: 'nativo', porConta: false, tela: '/propostas' },
  maq_recebida_sem_faturar: { comodo: 'patio', rotulo: 'Máquina recebida sem faturar', sensivel: false, fonte: 'nativo', porConta: false, tela: '/propostas' },
  maq_em_transito: { comodo: 'patio', rotulo: 'Máquinas a caminho (NF faturada)', sensivel: true, fonte: 'recebimentos', porConta: true, tela: '/estoque/recebimentos-omie' },
  maq_receb_esquecido: { comodo: 'patio', rotulo: 'Recebimento de máquina esquecido', sensivel: true, fonte: 'recebimentos', porConta: true, tela: '/estoque/recebimentos-omie' },
  ppv_aberto: { comodo: 'balcao', rotulo: 'PPV em aberto', sensivel: false, fonte: 'nativo', porConta: false, tela: '/ppv' },
  os_por_fase: { comodo: 'oficina', rotulo: 'OS pendentes', sensivel: false, fonte: 'nativo', porConta: false, tela: '/pos' },
  os_atrasada: { comodo: 'oficina', rotulo: 'OS atrasadas', sensivel: false, fonte: 'nativo', porConta: false, tela: '/pos' },
  os_sem_faturar: { comodo: 'oficina', rotulo: 'OS concluída sem faturar', sensivel: true, fonte: 'nativo', porConta: false, tela: '/pos' },
  pecas_a_alocar: { comodo: 'almoxarifado', rotulo: 'Peças a alocar', sensivel: false, fonte: 'nativo', porConta: true, tela: '/ajustes/caracteristicas?alocar=1' },
  estoque_negativo: { comodo: 'almoxarifado', rotulo: 'Estoque negativo', sensivel: false, fonte: 'produtos', porConta: true, tela: '/ajustes/negativos' },
  robos: { comodo: 'sala_maquinas', rotulo: 'Robôs que alimentam a planta', sensivel: false, fonte: 'nativo', porConta: false, tela: '/agendamentos' },
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
  propostas: Row[];           // v_forecast (propostas em aberto) + marca/modelo/vendedor da v_formulario
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
export const FASES_FABRICA_ANTES = ['Proposta solicitada', 'Proposta Recebida', 'Pedido Feito / Aguardando Maq'];
export const FASES_FABRICA_CHEGOU = ['Proposta Concluida/ Maquina Recebida', 'Aguardando faturamento da fábrica'];
/** Fases em que o serviço terminou e falta faturar (Executada → Cobrando Cliente). */
export const FASES_SEM_FATURAR = ['Executada', 'Executada aguardando comercial', 'Relatório Concluído', 'Enviar Omie', 'Enviado Para Omie', 'Cobrando Cliente'];

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
const prevDe = (r: Row) => String(r.data_previsao || '').slice(0, 10);
/** finan_pagar.omie_empresa: "Nova Tratores" | "Castro Peças" (nulo = Nova, padrão do kanban). */
const contaFila = (r: Row) => (/castro/i.test(String(r.omie_empresa || '')) ? 'CASTRO' : 'NOVA');
const idadePPV = (r: Row, hoje: string) => {
  const d = r.status_desde ? String(r.status_desde).slice(0, 10) : isoDe(r.data);
  const n = d ? diasEntre(d, hoje) : NaN;
  return Number.isFinite(n) ? n : null;
};
function mapaAtraso(f: Fontes): Record<string, number> {
  // "Atrasada" = mesmo mapaAtraso de /api/pos/ordens: métrica aberta com dias > 0.
  const m: Record<string, number> = {};
  for (const x of f.metricasAbertas) m[x.id_ordem] = Math.max(m[x.id_ordem] || 0, Number(x.dias) || 0);
  return m;
}

// ---------------------------------------------------------------- seleção (fonte única)
function abertos(f: Fontes, tipo: 'pagar' | 'receber', conta: string): Row[] {
  return (tipo === 'pagar' ? f.pagar : f.receber).filter((r) => contaDe(r.conta_omie) === conta && !FECHADOS.includes(r.status_titulo));
}
function vencidos(f: Fontes, tipo: 'pagar' | 'receber', conta: string): Row[] {
  const col = tipo === 'pagar' ? 'nome_fornecedor' : 'nome_cliente';
  return abertos(f, tipo, conta).filter((r) => r.status_titulo === 'ATRASADO' && r.data_vencimento
    && !VENCIDOS_IGNORADOS.has(Number(r.codigo_lancamento)) && !ehIntercompany(r[col]));
}
function porConta(kpi: string, conta: string, f: Fontes): Row[] {
  const anoCorrente = `${f.hoje.slice(0, 4)}-01-01`;
  const ate7 = somaDias(f.hoje, 7);
  const ate90 = somaDias(f.hoje, 90);
  const ate29 = somaDias(f.hoje, 29);
  const nf = () => f.nfMaquinas.filter((r) => contaDe(r.conta_omie) === conta);
  switch (kpi) {
    case 'pagar_vencido': case 'receber_vencido': {
      const t = kpi.startsWith('pagar') ? 'pagar' : 'receber';
      return vencidos(f, t, conta).filter((r) => String(r.data_vencimento) >= anoCorrente).map((r) => ({ ...r, _tipo: t }));
    }
    case 'pagar_hoje': case 'receber_hoje': {
      const t = kpi.startsWith('pagar') ? 'pagar' : 'receber';
      return abertos(f, t, conta).filter((r) => prevDe(r) === f.hoje).map((r) => ({ ...r, _tipo: t }));
    }
    case 'pagar_7d': case 'receber_7d': {
      const t = kpi.startsWith('pagar') ? 'pagar' : 'receber';
      return abertos(f, t, conta).filter((r) => prevDe(r) > f.hoje && prevDe(r) <= ate7).map((r) => ({ ...r, _tipo: t }));
    }
    case 'pagar_90d': case 'receber_90d': {
      const t = kpi.startsWith('pagar') ? 'pagar' : 'receber';
      return abertos(f, t, conta).filter((r) => prevDe(r) > f.hoje && prevDe(r) <= ate90).map((r) => ({ ...r, _tipo: t }));
    }
    case 'fluxo_30d':
      return (['pagar', 'receber'] as const).flatMap((t) => abertos(f, t, conta)
        .filter((r) => prevDe(r) >= f.hoje && prevDe(r) <= ate29).map((r) => ({ ...r, _tipo: t })));
    case 'fila_financeiro': return f.fila.filter((r) => contaFila(r) === conta);
    case 'maq_em_transito': return nf().filter((r) => diasEntre(isoDe(r.emissao_nfe), f.hoje) <= JANELA_TRANSITO_DIAS);
    case 'maq_receb_esquecido': return nf().filter((r) => diasEntre(isoDe(r.emissao_nfe), f.hoje) > JANELA_TRANSITO_DIAS);
    case 'pecas_a_alocar': return f.alocacao.filter((r) => contaDe(r.conta_omie) === conta);
    case 'estoque_negativo': return f.negativos.filter((r) => contaDe(r.conta_omie) === conta);
    default: return [];
  }
}
function semConta(kpi: string, f: Fontes): Row[] {
  const pend = () => f.os.filter((r) => r.Status !== 'Concluída' && r.Status !== 'Cancelada');
  switch (kpi) {
    case 'propostas_abertas': return f.propostas;
    case 'maq_pedido_fabrica': return f.pedidosFabrica.filter((r) => FASES_FABRICA_ANTES.includes(r.status));
    case 'maq_recebida_sem_faturar': return f.pedidosFabrica.filter((r) => FASES_FABRICA_CHEGOU.includes(r.status));
    case 'ppv_aberto': return f.pedidos.filter((r) => STATUS_ABERTO_PPV.includes(normalizarStatus(r.status)));
    case 'os_por_fase': return pend();
    case 'os_atrasada': { const at = mapaAtraso(f); return pend().filter((r) => (at[r.Id_Ordem] || 0) > 0).map((r) => ({ ...r, _atraso: at[r.Id_Ordem] })); }
    case 'os_sem_faturar': return pend().filter((r) => FASES_SEM_FATURAR.includes(r.Status));
    default: return [];
  }
}
/** Registros que formam o número (KPI por conta: NOVA, CASTRO ou as duas em TODAS). */
export function selecionar(kpi: string, conta: ContaPlanta, f: Fontes): Row[] {
  const d = CATALOGO[kpi];
  if (!d) return [];
  if (!d.porConta) return semConta(kpi, f);
  return conta === 'TODAS' ? CONTAS.flatMap((c) => porConta(kpi, c, f)) : porConta(kpi, conta, f);
}

// ---------------------------------------------------------------- cálculo
type Parcial = Omit<LinhaKpi, 'comodo' | 'sensivel' | 'fonte' | 'erro'>;
function linha(p: Parcial): LinhaKpi {
  const d = CATALOGO[p.kpi_id];
  return { ...p, comodo: d.comodo, sensivel: d.sensivel, fonte: d.fonte, erro: null };
}
const somaAberto = (xs: Row[]) => r2(xs.reduce((s, r) => s + valorAberto(r), 0));

function financeiro(f: Fontes): Parcial[] {
  const out: Parcial[] = [];
  const anoCorrente = `${f.hoje.slice(0, 4)}-01-01`;
  for (const tipo of ['pagar', 'receber'] as const) {
    for (const conta of CONTAS) {
      const doAno = porConta(`${tipo}_vencido`, conta, f);
      const antigos = vencidos(f, tipo, conta).filter((r) => String(r.data_vencimento) < anoCorrente);
      const aging: Record<string, number> = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
      for (const r of doAno) aging[faixaAtraso(Math.max(1, diasEntre(String(r.data_vencimento).slice(0, 10), f.hoje)))] += valorAberto(r);
      out.push({ kpi_id: `${tipo}_vencido`, conta, contagem: doAno.length, valor: somaAberto(doAno),
        detalhe: { aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, r2(v)])), antes_do_ano: { contagem: antigos.length, valor: somaAberto(antigos) } } });
      for (const k of [`${tipo}_hoje`, `${tipo}_7d`, `${tipo}_90d`]) {
        const xs = porConta(k, conta, f);
        out.push({ kpi_id: k, conta, contagem: xs.length, valor: somaAberto(xs), detalhe: {} });
      }
    }
  }
  // Sem saldo bancário: a planta mostra a saída líquida prevista por semana (decisão 19/10).
  for (const conta of CONTAS) {
    const sem = Array.from({ length: 5 }, (_, i) => ({ semana: i + 1, receber: 0, pagar: 0, liquido: 0 }));
    for (const r of porConta('fluxo_30d', conta, f)) {
      const s = sem[Math.min(4, Math.floor(diasEntre(f.hoje, prevDe(r)) / 7))];
      s[r._tipo as 'pagar' | 'receber'] += valorAberto(r);
    }
    const semanas = sem.map((s) => ({ semana: s.semana, receber: r2(s.receber), pagar: r2(s.pagar), liquido: r2(s.receber - s.pagar) }));
    out.push({ kpi_id: 'fluxo_30d', conta, contagem: semanas.length, valor: r2(semanas.reduce((s, x) => s + x.liquido, 0)), detalhe: { semanas } });
  }
  for (const conta of CONTAS) {
    const ls = porConta('fila_financeiro', conta, f);
    out.push({ kpi_id: 'fila_financeiro', conta, contagem: ls.length, valor: r2(ls.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
      detalhe: { erro_envio: ls.filter((r) => r.status_envio === 'erro').length, aguardando_omie: ls.filter((r) => r.aguardando_omie_desde).length,
        mais_antigo: ls.map((r) => String(r.criado_em || '').slice(0, 10)).filter(Boolean).sort()[0] || null } });
  }
  return out;
}

function patio(f: Fontes): Parcial[] {
  const antes = semConta('maq_pedido_fabrica', f);
  const chegou = semConta('maq_recebida_sem_faturar', f);
  const out: Parcial[] = [
    { kpi_id: 'maq_pedido_fabrica', conta: 'TODAS', contagem: antes.length, valor: null,
      detalhe: { com_previsao: antes.filter((r) => r.eta_fabrica).length, atrasados: antes.filter((r) => Number(r.dias_atraso_eta) > 0).length } },
    { kpi_id: 'maq_recebida_sem_faturar', conta: 'TODAS', contagem: chegou.length, valor: null,
      detalhe: { maior_dias_na_fase: chegou.reduce((m, r) => Math.max(m, Number(r.dias_na_fase) || 0), 0) } },
  ];
  // Propostas em aberto (mesma base do forecast de /propostas: v_forecast).
  const props = semConta('propostas_abertas', f);
  const porStatus: Record<string, number> = {};
  for (const p of props) porStatus[p.status || '?'] = (porStatus[p.status || '?'] || 0) + 1;
  out.push({ kpi_id: 'propostas_abertas', conta: 'TODAS', contagem: props.length, valor: r2(props.reduce((s, p) => s + (Number(p.valor) || 0), 0)),
    detalhe: { ponderado: r2(props.reduce((s, p) => s + (Number(p.valor_ponderado) || 0), 0)), por_status: porStatus, sem_previsao: props.filter((p) => !p.previsao_fechamento).length } });
  const un = (xs: Row[]) => xs.reduce((s, r) => s + (Number(r.qtd_maquinas) || 0), 0);
  const val = (xs: Row[]) => r2(xs.reduce((s, r) => s + (Number(r.valor_maquinas) || 0), 0));
  for (const conta of CONTAS) for (const k of ['maq_em_transito', 'maq_receb_esquecido']) {
    const xs = porConta(k, conta, f);
    out.push({ kpi_id: k, conta, contagem: un(xs), valor: val(xs), detalhe: { nfs: xs.length, mais_antiga: xs.map((r) => isoDe(r.emissao_nfe)).sort()[0] || null } });
  }
  return out;
}

function balcao(f: Fontes): Parcial[] {
  const ab = semConta('ppv_aberto', f);
  const idade: Record<string, number> = { '0-2': 0, '3-7': 0, '8+': 0, 'sem data': 0 };
  for (const r of ab) { const n = idadePPV(r, f.hoje); idade[n == null ? 'sem data' : n <= 2 ? '0-2' : n <= 7 ? '3-7' : '8+']++; }
  return [{ kpi_id: 'ppv_aberto', conta: 'TODAS', contagem: ab.length, valor: r2(ab.reduce((s, r) => s + (Number(r.valor_total) || 0), 0)), detalhe: { por_idade: idade } }];
}

function oficina(f: Fontes): Parcial[] {
  const pend = semConta('os_por_fase', f);
  const porFase: Record<string, number> = {};
  for (const r of pend) { const k = (PHASES as readonly string[]).includes(r.Status) ? r.Status : 'Outras'; porFase[k] = (porFase[k] || 0) + 1; }
  const atrasadas = semConta('os_atrasada', f);
  const sf = semConta('os_sem_faturar', f);
  return [
    { kpi_id: 'os_por_fase', conta: 'TODAS', contagem: pend.length, valor: null, detalhe: { por_fase: porFase } },
    { kpi_id: 'os_atrasada', conta: 'TODAS', contagem: atrasadas.length, valor: null, detalhe: { maior_atraso_dias: atrasadas.reduce((m, r) => Math.max(m, r._atraso || 0), 0) } },
    { kpi_id: 'os_sem_faturar', conta: 'TODAS', contagem: sf.length, valor: r2(sf.reduce((s, r) => s + valorOS({ valor: r.Valor_Total }), 0)), detalhe: {} },
  ];
}

function almoxarifado(f: Fontes): Parcial[] {
  return CONTAS.flatMap((conta) => ['pecas_a_alocar', 'estoque_negativo'].map((k) => ({ kpi_id: k, conta, contagem: porConta(k, conta, f).length, valor: null, detalhe: {} })));
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

// ---------------------------------------------------------------- itens do detalhe
export interface ItemKpi { chave: string; titulo: string; sub: string; valor: number | null; data: string | null; href: string | null }
export const LIMITE_ITENS = 200;

/** Nomes do espelho da Omie vêm com entidades HTML ("ROSA &amp; RIBEIRO"). */
export function semEntidades(t: unknown): string {
  return String(t ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
const brData = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '');

function paraItem(kpi: string, r: Row, f: Fontes): ItemKpi {
  switch (CATALOGO[kpi].comodo) {
    case 'financeiro': {
      if (kpi === 'fila_financeiro') return { chave: `fp-${r.id}`, titulo: r.fornecedor || 'Sem fornecedor', sub: [r.numero_NF ? `NF ${r.numero_NF}` : '', r.motivo || ''].filter(Boolean).join(' · ').slice(0, 140), valor: Number(r.valor) || 0, data: String(r.data_vencimento || r.criado_em || '').slice(0, 10) || null, href: '/financeiro/home-financeiro' };
      const nome = r._tipo === 'pagar' ? r.nome_fornecedor : r.nome_cliente;
      const doc = [r.numero_documento_fiscal || r.numero_documento, r.numero_parcela].filter(Boolean).join(' · parcela ');
      const quando = kpi.endsWith('vencido') ? `venceu ${brData(String(r.data_vencimento).slice(0, 10))}` : `previsão ${brData(prevDe(r))}`;
      return { chave: `${r._tipo}-${r.codigo_lancamento || r.id}`, titulo: nome || 'Sem nome', sub: [kpi === 'fluxo_30d' ? (r._tipo === 'pagar' ? 'a pagar' : 'a receber') : '', doc, quando, r.conta_omie].filter(Boolean).join(' · '),
        valor: (kpi === 'fluxo_30d' && r._tipo === 'pagar' ? -1 : 1) * valorAberto(r), data: kpi.endsWith('vencido') ? String(r.data_vencimento).slice(0, 10) : prevDe(r), href: CATALOGO[kpi].tela };
    }
    case 'patio':
      if (kpi.startsWith('maq_em') || kpi.startsWith('maq_receb'))
        return { chave: `nf-${r.conta_omie}-${r.id_receb}`, titulo: r.fornecedor || 'Fornecedor', sub: `NF ${String(r.numero_nfe || '').replace(/^0+/, '')} · ${r.qtd_maquinas} máquina(s) · emitida ${brData(isoDe(r.emissao_nfe))} · ${String(r.conta_omie).toUpperCase()}`, valor: Number(r.valor_maquinas) || 0, data: isoDe(r.emissao_nfe), href: '/estoque/recebimentos-omie' };
      if (kpi === 'propostas_abertas') return { chave: `pr-${r.id}`, titulo: r.Cliente || 'Sem cliente', sub: [`${r.Marca || ''} ${r.Modelo || ''}`.trim(), r.status, r.vendedor_nome, r.previsao_fechamento ? `fecha ${brData(String(r.previsao_fechamento).slice(0, 10))}` : 'sem previsão', r.dias_na_fase != null ? `${r.dias_na_fase} d na fase` : ''].filter(Boolean).join(' · '), valor: Number(r.valor) || 0, data: r.previsao_fechamento || null, href: '/propostas' };
      return { chave: `pf-${r.id}`, titulo: r.cliente || 'Sem cliente', sub: [`${r.marca || ''} ${r.modelo || ''}`.trim(), r.status, r.eta_fabrica ? `chega ${brData(r.eta_fabrica)}${Number(r.dias_atraso_eta) > 0 ? ` (atrasada ${r.dias_atraso_eta} d)` : ''}` : `${r.dias_na_fase ?? 0} d na fase`].filter(Boolean).join(' · '), valor: null, data: r.eta_fabrica || null, href: '/propostas' };
    case 'balcao': {
      const n = idadePPV(r, f.hoje);
      return { chave: `ppv-${r.id_pedido}`, titulo: `${r.id_pedido} · ${r.cliente || 'Sem cliente'}`, sub: [normalizarStatus(r.status), n == null ? '' : `${n} d na fase`, r.Tipo_Pedido].filter(Boolean).join(' · '), valor: Number(r.valor_total) || 0, data: null, href: `/ppv?id=${encodeURIComponent(r.id_pedido)}` };
    }
    case 'oficina':
      return { chave: `os-${r.Id_Ordem}`, titulo: `${r.Id_Ordem} · ${r.Os_Cliente || 'Sem cliente'}`, sub: [r.Status, r.Os_Tecnico, r._atraso ? `${r._atraso} d no contador` : ''].filter(Boolean).join(' · '), valor: kpi === 'os_sem_faturar' ? valorOS({ valor: r.Valor_Total }) : null, data: null, href: `/pos?id=${encodeURIComponent(r.Id_Ordem)}` };
    case 'almoxarifado':
      if (kpi === 'pecas_a_alocar') return { chave: `al-${r.id}`, titulo: `${r.codigo || r.codigo_produto} · ${r.descricao || ''}`.trim(), sub: [r.fornecedor, r.numero_nfe ? `NF ${String(r.numero_nfe).replace(/^0+/, '')}` : '', r.recebido_em ? `recebida ${brData(r.recebido_em)}` : '', r.conta_omie].filter(Boolean).join(' · '), valor: null, data: r.recebido_em || null, href: `/ajustes/caracteristicas?alocar=1&cod=${encodeURIComponent(r.codigo || r.codigo_produto)}` };
      return { chave: `neg-${r.conta_omie}-${r.codigo_produto}`, titulo: `${r.codigo || r.codigo_produto} · ${r.descricao || ''}`.trim(), sub: `estoque ${r.estoque} · ${String(r.conta_omie).toUpperCase()}`, valor: null, data: null, href: '/ajustes/negativos' };
    default:
      return { chave: String(r.id ?? ''), titulo: String(r.id ?? ''), sub: '', valor: null, data: null, href: null };
  }
}

/** Lista do detalhe: os mesmos registros de `selecionar`, mais graves/maiores primeiro, até 200. */
export function itensDoKpi(kpi: string, conta: ContaPlanta, f: Fontes): { itens: ItemKpi[]; total: number } {
  const rows = selecionar(kpi, conta, f);
  const itens = rows.map((r) => { const it = paraItem(kpi, r, f); return { ...it, titulo: semEntidades(it.titulo), sub: semEntidades(it.sub) }; });
  const venc = kpi.endsWith('vencido');
  itens.sort((a, b) => venc ? String(a.data).localeCompare(String(b.data)) : Math.abs(b.valor || 0) - Math.abs(a.valor || 0) || String(a.data).localeCompare(String(b.data)));
  return { itens: itens.slice(0, LIMITE_ITENS), total: itens.length };
}

// ---------------------------------------------------------------- leitura pela rota
export interface KpiTela extends LinhaKpi { rotulo: string; tela: string; dado_ate: string | null; calculado_em: string | null; idade_min: number | null; frescor: Frescor; lacrado: boolean }

/** Para quem não é admin: KPI sensível volta sem valor e sem detalhe (só a contagem). */
export function prepararParaUsuario(ls: Array<LinhaKpi & { dado_ate?: string | null; calculado_em?: string | null }>, isAdmin: boolean, agora = Date.now()): KpiTela[] {
  return ls.map((l) => {
    const idade = l.dado_ate ? Math.round((agora - new Date(l.dado_ate).getTime()) / 60000) : null;
    const lacrado = l.sensivel && !isAdmin;
    return {
      ...l, rotulo: CATALOGO[l.kpi_id]?.rotulo || l.kpi_id, tela: CATALOGO[l.kpi_id]?.tela || '',
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
