// Custo dos SERVIÇOS (oficina) por mês, lido do Painel Omie
// (sistemacompletoomie-production.up.railway.app, rota /api/dashboard-vendedor).
//
// É o MESMO número que o painel publica como "saída" do departamento Oficina
// (blocoDepartamento.saida) e soma no gráfico mensal do /api/dashboard-geral:
// comissão + despesas gerais + despesas de veículo + custo fixo (RH) + custo
// real das OS internas absorvidas. Não refazemos a conta aqui — se o painel
// mudar a régua, o dashboard acompanha.
//
// Autenticação máquina-a-máquina: header x-painel-token = PAINEL_SERVICE_TOKEN
// (mesmo valor configurado no serviço do painel). Sem o token, ou com o painel
// fora, devolve null e o dashboard mostra "—" como antes.
import type { ContaFiltro } from './conta';

const PAINEL = (
  process.env.PAINEL_OMIE_URL ||
  process.env.NEXT_PUBLIC_PAINEL_OMIE_URL ||
  'https://sistemacompletoomie-production.up.railway.app'
).replace(/\/$/, '');

const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 45_000;

/** Mapa "YYYY-MM" → custo do mês. */
export type CustoServicosMensal = Record<string, number>;

interface GraficoMesPainel {
  mes?: string;
  comissao?: number;
  despesaGeral?: number;
  despesaVeic?: number;
  custoFixo?: number;
  custoRealInterno?: number;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Soma os componentes de custo de cada mês do gráfico do painel (régua do dashboard-geral). */
export function custoPorMesDoGrafico(grafico: GraficoMesPainel[]): CustoServicosMensal {
  const out: CustoServicosMensal = {};
  for (const g of grafico || []) {
    if (!g.mes || !/^\d{4}-\d{2}$/.test(g.mes)) continue;
    out[g.mes] = (out[g.mes] || 0) + n(g.comissao) + n(g.despesaGeral) + n(g.despesaVeic) + n(g.custoFixo) + n(g.custoRealInterno);
  }
  return out;
}

export const chaveMes = (mes: number, ano: number) => `${ano}-${String(mes).padStart(2, '0')}`;

/** Soma o custo dos meses [deMes/deAno .. ateMes/ateAno] (inclusive). */
export function somarCusto(mapa: CustoServicosMensal, meses: Array<{ mes: number; ano: number }>): number {
  return meses.reduce((s, m) => s + (mapa[chaveMes(m.mes, m.ano)] || 0), 0);
}

type Entrada = { ts: number; dados: CustoServicosMensal | null };
const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<CustoServicosMensal | null>>();

function paramsConta(conta: ContaFiltro): string {
  // Painel: empresa=NOVA|CASTRO; "Todas" = consolidar=true (junta as duas).
  if (!conta) return 'empresa=NOVA&consolidar=true';
  return `empresa=${conta}&consolidar=false`;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Custo de serviços por mês entre o 1º dia de (deMes/deAno) e o último de (ateMes/ateAno).
 * Cache de 30 min por conta+janela; chamadas simultâneas compartilham a mesma ida ao painel.
 * Devolve null quando o painel não respondeu (sem token, fora do ar, timeout).
 */
export async function custoServicosMensal(
  conta: ContaFiltro,
  de: { mes: number; ano: number },
  ate: { mes: number; ano: number },
): Promise<CustoServicosMensal | null> {
  const token = process.env.PAINEL_SERVICE_TOKEN;
  if (!token) return null;
  const ini = new Date(de.ano, de.mes - 1, 1);
  const fim = new Date(ate.ano, ate.mes, 0);
  const chave = `${conta || 'TODAS'}|${iso(ini)}|${iso(fim)}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.ts < TTL_MS) return c.dados;
  const voando = emVoo.get(chave);
  if (voando) return voando;

  const p = (async () => {
    try {
      const url = `${PAINEL}/api/dashboard-vendedor?nome=TODOS&${paramsConta(conta)}&dataInicio=${iso(ini)}&dataFim=${iso(fim)}&_pularComparativo=1`;
      const r = await fetch(url, { headers: { 'x-painel-token': token }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
      if (!r.ok) throw new Error(`painel respondeu ${r.status}`);
      const j = (await r.json()) as { grafico?: GraficoMesPainel[]; resumo?: { nfsePronta?: boolean } };
      // NFS-e ainda carregando no painel: o custo não depende dela, mas a resposta pode vir parcial — não cacheia por muito tempo.
      const dados = custoPorMesDoGrafico(j.grafico || []);
      cache.set(chave, { ts: j.resumo?.nfsePronta === false ? Date.now() - TTL_MS + 60_000 : Date.now(), dados });
      return dados;
    } catch (e) {
      console.warn('[custo-servicos-painel]', (e as Error).message);
      // Falha fica 2 min no cache para não martelar o painel a cada clique.
      cache.set(chave, { ts: Date.now() - TTL_MS + 120_000, dados: null });
      return null;
    } finally {
      emVoo.delete(chave);
    }
  })();
  emVoo.set(chave, p);
  return p;
}
