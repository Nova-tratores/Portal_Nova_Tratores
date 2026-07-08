// Sync do cache de SELIC (tabela `selic_cache`) a partir da API do Banco Central.
// Portado do app externo "Visual Estoque" (src/selic.js). O portal só LIA essa
// tabela (selic.ts / carregarSelicCache); com o app externo desligado, ninguém
// mais a atualizava. Este job traz as taxas diárias novas do BCB.
//
// Fonte: BCB SGS série 11 (SELIC diária, % ao dia). Persistimos:
//   data  = YYYY-MM-DD
//   taxa  = fração ao dia (valor_BCB / 100)   -- ex.: 0.049219% -> 0.00049219
//   fator = 1 + taxa                          -- produtório = SELIC acumulada
// onConflict: 'data'.

import { supabaseVE } from './supabase';

const BCB_SGS_SELIC = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados';

interface BCBRow {
  data: string; // DD/MM/YYYY
  valor: string; // "0,049219" ou "0.049219"
}

interface SelicRow {
  data: string; // YYYY-MM-DD
  taxa: number;
  fator: number;
}

function toBCBDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toISODate(bcb: string): string {
  const [d, m, y] = bcb.split('/');
  return `${y}-${m}-${d}`;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// Busca as taxas SELIC diárias do BCB entre duas datas ISO (inclusive).
async function fetchSelicBCB(deISO: string, ateISO: string): Promise<BCBRow[]> {
  const url = `${BCB_SGS_SELIC}?formato=json&dataInicial=${toBCBDate(deISO)}&dataFinal=${toBCBDate(ateISO)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API BCB retornou ${res.status}`);
  const data = (await res.json()) as BCBRow[];
  return Array.isArray(data) ? data : [];
}

function toSelicRows(taxas: BCBRow[]): SelicRow[] {
  return taxas
    .map(({ data, valor }) => {
      const taxa = parseFloat(String(valor).replace(',', '.')) / 100;
      if (!Number.isFinite(taxa)) return null;
      return { data: toISODate(data), taxa, fator: 1 + taxa };
    })
    .filter((r): r is SelicRow => r !== null);
}

async function upsertSelicCache(rows: SelicRow[]): Promise<number> {
  let gravados = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    const { error } = await supabaseVE.from('selic_cache').upsert(lote, { onConflict: 'data' });
    if (error) throw new Error(error.message);
    gravados += lote.length;
  }
  return gravados;
}

// Última data já presente no cache (YYYY-MM-DD) ou null se vazio.
async function ultimaDataCache(): Promise<string | null> {
  const { data } = await supabaseVE
    .from('selic_cache')
    .select('data')
    .order('data', { ascending: false })
    .limit(1);
  return data && data.length > 0 ? (data[0] as { data: string }).data : null;
}

/**
 * Atualiza o `selic_cache` de forma incremental: busca do BCB desde o dia
 * seguinte à última data cacheada (ou `fallbackDesde` se o cache estiver vazio)
 * até hoje, e faz upsert. Idempotente (onConflict data).
 */
export async function sincronizarSelic(fallbackDesde = '2022-11-01'): Promise<{ ok: boolean; de: string; ate: string; taxas: number; gravados: number; mensagem?: string }> {
  const ate = isoHoje();
  const ultima = await ultimaDataCache();

  let de = fallbackDesde;
  if (ultima) {
    const d = new Date(ultima + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    de = d.toISOString().slice(0, 10);
  }

  // Já está em dia (última data do cache é hoje ou futura).
  if (de > ate) {
    return { ok: true, de, ate, taxas: 0, gravados: 0, mensagem: 'cache já em dia' };
  }

  try {
    const taxas = await fetchSelicBCB(de, ate);
    if (taxas.length === 0) {
      return { ok: true, de, ate, taxas: 0, gravados: 0, mensagem: 'BCB não retornou taxas no período' };
    }
    const rows = toSelicRows(taxas);
    const gravados = await upsertSelicCache(rows);
    console.log(`[selic] sync ${de} -> ${ate}: ${gravados} taxas gravadas`);
    return { ok: true, de, ate, taxas: taxas.length, gravados };
  } catch (e) {
    console.error('[selic] erro no sync:', (e as Error).message);
    return { ok: false, de, ate, taxas: 0, gravados: 0, mensagem: (e as Error).message };
  }
}
