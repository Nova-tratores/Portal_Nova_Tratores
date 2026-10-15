// Baixas do DRE: gravar SÓ o que mudou (funções PURAS, testáveis).
//
// pg_stat_statements (15/10/2026): o sync do DRE fazia 1,46 milhão de UPDATEs
// em contas_pagar/contas_receber (um por título pago nos últimos 24 meses, a
// cada rodada, ~8x/dia) mesmo quando data_pagamento e valor_pago já estavam
// iguais. Cada UPDATE vira WAL que o Realtime ainda decodifica. Aqui: compara
// o que a Omie devolveu com o que o espelho já tem e devolve só as diferenças.

/** Data em 'YYYY-MM-DD' a partir de Date, ISO, timestamp ou DD/MM/YYYY; null se vazia. */
function normData(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : s;
}

/** Valor com 2 casas (centavos); null se vazio/inválido. */
function normValor(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Separa as baixas da Omie em alteradas (precisam de UPDATE) e iguais (já
 * estão assim no espelho). Título que o espelho não tem também vai em
 * `alteradas` (o UPDATE não acha linha e o próximo sync de títulos cria).
 * @param {{codigo_lancamento:number|string, data_pagamento:any, valor_pago:any}[]} rows baixas da Omie
 * @param {{codigo_lancamento:number|string, data_pagamento:any, valor_pago:any}[]} atuais linhas do espelho
 */
function filtrarBaixasAlteradas(rows, atuais) {
  const mapa = new Map();
  for (const a of atuais || []) mapa.set(String(a.codigo_lancamento), a);
  const alteradas = [];
  let iguais = 0;
  let semEspelho = 0;
  for (const r of rows || []) {
    const atual = mapa.get(String(r.codigo_lancamento));
    if (!atual) { semEspelho++; alteradas.push(r); continue; }
    if (normData(atual.data_pagamento) === normData(r.data_pagamento) && normValor(atual.valor_pago) === normValor(r.valor_pago)) iguais++;
    else alteradas.push(r);
  }
  return { alteradas, iguais, semEspelho };
}

/** Divide uma lista em fatias de `n` (para os `.in()` do PostgREST). */
function fatias(lista, n) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

module.exports = { normData, normValor, filtrarBaixasAlteradas, fatias };
