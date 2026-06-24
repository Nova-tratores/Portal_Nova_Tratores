// ════════════════════════════════════════════════════════════════════
// Motor de cronograma (CPM + calendário de recurso).
// Importado tanto pelo front (preview otimista) quanto pela API Route
// de recálculo autoritativo. TS puro, sem dependências de ambiente.
// ════════════════════════════════════════════════════════════════════

export { calcular } from './calcular';
export * from './tipos';
export {
  ehDiaUtil,
  proximoDiaUtil,
  diaUtilAnterior,
  diasUteisEntre,
  // somaDiasUteis (spec) = avançar N dias úteis a partir de uma data
  deslocarDiasUteis as somaDiasUteis,
  fimPorDuracao,
  inicioPorDuracao,
} from './calendario';
