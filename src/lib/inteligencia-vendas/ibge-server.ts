/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — dados públicos por município (servidor).
//
//   IBGE localidades  → código IBGE de cada cidade (o cadastro só tem o nome)
//   IBGE SIDRA 5457   → PAM: área plantada por cultura (v 8331) e valor da
//                       produção (v 215), último ano publicado
//   IBGE SIDRA 3939   → PPM: rebanho bovino (v 105, c79 2670)
//   agro_* (CAR+SICOR)→ imóveis, área útil e crédito rural (rateado por gleba)
// Tudo em cache (IBGE muda 1x/ano; agro muda quando o pipeline roda).
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { emCache } from './server';
import { textoNorm } from './normalizar';
import type { DadosAgro, DadosPublicos } from './municipios';

const DIA = 24 * 3_600_000;

async function buscarJSON(url: string, tentativas = 2): Promise<any> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { ultimo = e; }
  }
  throw new Error(`IBGE indisponível (${url.slice(0, 60)}…): ${String((ultimo as any)?.message || ultimo)}`);
}

/** 'piraju|SP' → { ibge, nome } de todas as cidades das UFs pedidas. */
export async function municipiosIBGE(ufs: string[]): Promise<Map<string, { ibge: number; nome: string; uf: string }>> {
  const mapa = new Map<string, { ibge: number; nome: string; uf: string }>();
  for (const uf of [...new Set(ufs.filter((u) => /^[A-Z]{2}$/.test(u)))]) {
    const lista = await emCache(`ibge-uf-${uf}`, 7 * DIA, () =>
      buscarJSON(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?view=nivelado`));
    for (const m of lista as any[]) {
      mapa.set(`${textoNorm(m['municipio-nome'])}|${uf}`, { ibge: Number(m['municipio-id']), nome: String(m['municipio-nome']), uf });
    }
  }
  return mapa;
}

/** Os 45 municípios atendidos pela NOVA (mesma lista do Dashboard Agro). */
export function municipiosDaLoja(): { ibge: number; nome: string }[] {
  try {
    const j = JSON.parse(readFileSync(path.join(process.cwd(), 'docs/agro/municipios-nova.json'), 'utf8'));
    return (j.municipios || []).map((m: any) => ({ ibge: Number(m.ibge), nome: String(m.nome) }));
  } catch {
    return [];
  }
}

function linhasSidra(j: any[]): any[] {
  return Array.isArray(j) ? j.slice(1).filter((r) => r && r.V && !['-', '...', 'X', '..'].includes(r.V)) : [];
}

/** PAM + PPM do último ano, por município. Lotes de 40 códigos por chamada. */
export async function dadosPublicos(codigos: number[]): Promise<Map<number, DadosPublicos>> {
  const unicos = [...new Set(codigos)].sort((a, b) => a - b);
  return emCache(`ibge-dados-${unicos.join(',')}`, DIA, async () => {
    const out = new Map<number, DadosPublicos>();
    const pega = (ib: number) => out.get(ib) || out.set(ib, { culturas: [], valorProducaoMil: null, bovinos: null, ano: '' }).get(ib)!;
    for (let i = 0; i < unicos.length; i += 40) {
      const lote = unicos.slice(i, i + 40).join(',');
      const [area, valor, bov] = await Promise.all([
        buscarJSON(`https://apisidra.ibge.gov.br/values/t/5457/n6/${lote}/v/8331/p/last%201/c782/allxt`),
        buscarJSON(`https://apisidra.ibge.gov.br/values/t/5457/n6/${lote}/v/215/p/last%201/c782/0`),
        buscarJSON(`https://apisidra.ibge.gov.br/values/t/3939/n6/${lote}/v/105/p/last%201/c79/2670`),
      ]);
      for (const r of linhasSidra(area)) {
        const d = pega(Number(r.D1C));
        // "Café (em grão) Total" + "Arábica" + "Canephora": fica só o Total.
        if (/Café \(em grão\) (Arábica|Canephora)/.test(r.D4N)) continue;
        d.culturas.push({ nome: String(r.D4N).replace(/ \(em grão\)| \(cacho\)| \(em casca\)| Total/g, ''), ha: Number(r.V) });
        d.ano = String(r.D3N);
      }
      for (const r of linhasSidra(valor)) pega(Number(r.D1C)).valorProducaoMil = Number(r.V);
      for (const r of linhasSidra(bov)) pega(Number(r.D1C)).bovinos = Number(r.V);
    }
    return out;
  });
}

/** Imóveis do CAR + crédito rural por município (tabelas agro_*). Vazio se o agro não existir. */
export async function dadosAgro(): Promise<Map<number, DadosAgro>> {
  return emCache('agro-municipios', 6 * 3_600_000, async () => {
    const out = new Map<number, DadosAgro>();
    try {
      const [imoveis, perfis] = await Promise.all([
        paginar<any>((de, ate) => supabaseAdmin.from('agro_car_imovel').select('cod_car,municipio_ibge,area_util_ha,area_ha')
          .eq('status_car', 'AT').order('cod_car').range(de, ate) as any),
        paginar<any>((de, ate) => supabaseAdmin.from('agro_car_perfil').select('cod_car,credito_12m,credito_36m,credito_invest_36m')
          .order('cod_car').range(de, ate) as any),
      ]);
      if (imoveis.error || perfis.error) return out;
      const perfil = new Map(perfis.data.map((p) => [p.cod_car, p]));
      for (const i of imoveis.data) {
        const ib = Number(i.municipio_ibge);
        const d = out.get(ib) || { imoveis: 0, areaUtilHa: 0, credito12m: 0, credito36m: 0, invest36m: 0, imoveisComCredito: 0 };
        d.imoveis++;
        d.areaUtilHa += Number(i.area_util_ha ?? i.area_ha) || 0;
        const p = perfil.get(i.cod_car);
        if (p) {
          d.credito12m += Number(p.credito_12m) || 0;
          d.credito36m += Number(p.credito_36m) || 0;
          d.invest36m += Number(p.credito_invest_36m) || 0;
          if (Number(p.credito_36m) > 0) d.imoveisComCredito++;
        }
        out.set(ib, d);
      }
    } catch (e) {
      console.warn('[inteligencia-vendas] agro indisponível:', e);
    }
    return out;
  });
}

/** Centro [lat, lng] de cada município carregado no Agro (RPC agro_mapa_municipios). */
export async function centrosMunicipios(): Promise<Map<number, [number, number]>> {
  return emCache('agro-centros', DIA, async () => {
    const out = new Map<number, [number, number]>();
    try {
      const { data } = await supabaseAdmin.rpc('agro_mapa_municipios');
      for (const m of (data as any[]) || []) if (Array.isArray(m.centro)) out.set(Number(m.ibge), [Number(m.centro[0]), Number(m.centro[1])]);
    } catch { /* sem agro: mapa some */ }
    return out;
  });
}
