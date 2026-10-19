/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — raio-x de uma cidade (servidor). Cada fonte falha
// sozinha (fica 'erro' em `fontes`) e o resto aparece. IBGE em cache de 1 dia,
// previsão do tempo de 3 h, concorrentes vêm das propostas já em cache.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { emCache } from './server';
import { PROPOSTA_PERDIDA } from './base';
import {
  alertasDoClima, anoDe, semSubitens, climaDoOpenMeteo, concorrentesNaCidade, linhas, porCategoria, serieAnual, valorPor, valorSidra,
  type CidadeIV, type LinhaSidra, type PropostaCidade,
} from './cidade';

const DIA = 24 * 3_600_000;

async function json(url: string): Promise<any> {
  let ultimo: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (PortalNovaTratores)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

const sidra = (q: string) => json(`https://apisidra.ibge.gov.br/values/${q}/f/n`).then(linhas);

type Publico = Omit<CidadeIV, 'clima' | 'alertasClima' | 'concorrentes' | 'perdasTotal'>;

async function publico(ibge: number): Promise<Publico> {
  const fontes: Record<string, 'ok' | 'erro'> = {};
  const tenta = async (nome: string, q: string): Promise<LinhaSidra[]> => {
    try { const r = await sidra(q); fontes[nome] = 'ok'; return r; } catch { fontes[nome] = 'erro'; return []; }
  };
  const n = `n6/${ibge}`;
  const [pop, pib, estab, trat, pot, valor, area6, valor6, reb, leite] = await Promise.all([
    tenta('População (IBGE)', `t/6579/${n}/v/9324/p/last%201`),
    tenta('PIB municipal (IBGE)', `t/5938/${n}/v/37,513/p/last%203`),
    tenta('Censo Agro: propriedades', `t/6778/${n}/v/183/p/all`),
    tenta('Censo Agro: tratores', `t/6869/${n}/v/1862,1918/p/all`),
    tenta('Censo Agro: potência', `t/6869/${n}/v/1862/p/all/c12605/113522,113523`),
    tenta('Valor por cultura (PAM)', `t/5457/${n}/v/215/p/last%201/c782/allxt`),
    tenta('Área plantada 6 anos (PAM)', `t/5457/${n}/v/8331/p/last%206/c782/0`),
    tenta('Valor da produção 6 anos (PAM)', `t/5457/${n}/v/215/p/last%206/c782/0`),
    tenta('Rebanhos (PPM)', `t/3939/${n}/v/105/p/last%201/c79/allxt`),
    tenta('Leite (PPM)', `t/74/${n}/v/106/p/last%201/c80/2682`),
  ]);

  // o PIB do agro sai depois do PIB total: usa o último ano que tem os dois
  const anosPib = [...new Set(pib.map((l) => l.D3N))].sort().reverse();
  const anoPib = anosPib.find((a) => valorPor(pib, 'agropecuária', a) != null) ?? anosPib[0] ?? '';
  const pibTotal = valorPor(pib, 'Produto Interno Bruto', anoPib);
  const pibAgro = valorPor(pib, 'agropecuária', anoPib);
  const propriedades = estab.length ? valorSidra(estab[0].V) : null;
  const comTrator = valorPor(trat, 'estabelecimentos agropecuários com tratores');
  const tratores = valorPor(trat, 'tratores existentes');
  return {
    ibge,
    populacao: pop.length && valorSidra(pop[0].V) != null ? { valor: valorSidra(pop[0].V)!, ano: anoDe(pop) } : null,
    pib: pibTotal != null ? { totalMil: pibTotal, agroMil: pibAgro, agroPct: pibAgro != null && pibTotal ? (pibAgro / pibTotal) * 100 : null, ano: anoPib } : null,
    censo: propriedades != null || tratores != null ? {
      propriedades, comTrator, tratores,
      menos100cv: valorPor(pot, 'Menos de 100'), mais100cv: valorPor(pot, '100 cv e mais'),
      semTratorPct: propriedades && comTrator != null ? Math.max(0, ((propriedades - comTrator) / propriedades) * 100) : null,
    } : null,
    valorCulturas: semSubitens(porCategoria(valor)).slice(0, 8).map((x) => ({ nome: x.nome, valorMil: x.valor })),
    serie: serieAnual(area6, valor6),
    rebanhos: semSubitens(porCategoria(reb)).slice(0, 5).map((x) => ({ nome: x.nome, cabecas: x.valor })),
    leiteMilLitros: leite.length ? valorSidra(leite[0].V) : null,
    anoAgro: anoDe(valor) || anoDe(reb),
    fontes,
  };
}

export async function raioXCidade(ibge: number, nome: string, lat: number | null, lng: number | null): Promise<CidadeIV> {
  const fontes: Record<string, 'ok' | 'erro'> = {};
  const [pub, clima, conc] = await Promise.all([
    emCache(`cidade:${ibge}`, DIA, () => publico(ibge)),
    lat != null && lng != null
      ? emCache(`clima:${lat.toFixed(2)},${lng.toFixed(2)}`, 3 * 3_600_000, () => json(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=7`,
      ).then(climaDoOpenMeteo)).then((d) => { fontes['Previsão do tempo (Open-Meteo)'] = 'ok'; return d; }).catch(() => { fontes['Previsão do tempo (Open-Meteo)'] = 'erro'; return []; })
      : Promise.resolve([] as CidadeIV['clima']),
    // só as propostas perdidas (poucas linhas) — não carrega a base inteira
    emCache('propostas-perdidas', 30 * 60_000, async () => {
      const { data, error } = await supabaseAdmin.from('v_formulario').select('Cidade,status,concorrente,concorrente_valor,fechado_em,status_desde,criado_em').eq('status', PROPOSTA_PERDIDA).limit(5000);
      if (error) throw error;
      return (data || []) as PropostaCidade[];
    }).then((ps) => { fontes['Propostas (portal)'] = 'ok'; return concorrentesNaCidade(ps, nome, PROPOSTA_PERDIDA); })
      .catch(() => { fontes['Propostas (portal)'] = 'erro'; return { lista: [], total: 0 }; }),
  ]);
  return { ...pub, clima, alertasClima: alertasDoClima(clima), concorrentes: conc.lista, perdasTotal: conc.total, fontes: { ...pub.fontes, ...fontes } };
}
