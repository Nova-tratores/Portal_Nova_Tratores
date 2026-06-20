// Configuração da regra de detecção de garantia, lida das env vars.
// Mantida isolada para que migrar para uma tabela no banco (futuro) seja trivial.
// Portado de src/config.js.

export interface AjustesConfig {
  cfopsGarantia: string[];
  cfopsGarantiaNorm: Set<string>;
  thresholdCustoBaixo: number;
  lookbackMeses: number;
  cacheTtlSeg: number;
}

/** Normaliza um CFOP para apenas dígitos. "1.949" -> "1949", " 5.949 " -> "5949". */
export function cfopNormalizado(c: unknown): string {
  return String(c == null ? '' : c).replace(/\D/g, '');
}

export function parseListaCfops(env: string | undefined): string[] {
  return String(env || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getConfig(): AjustesConfig {
  const cfopsGarantia = parseListaCfops(process.env.CFOPS_GARANTIA);
  const cfopsGarantiaNorm = new Set(cfopsGarantia.map(cfopNormalizado).filter(Boolean));

  const threshold = parseFloat(process.env.THRESHOLD_CUSTO_BAIXO || '');
  const lookback = parseInt(process.env.LOOKBACK_MESES || '', 10);
  const cacheTtl = parseInt(process.env.CACHE_TTL_SEG || '', 10);

  return {
    cfopsGarantia,
    cfopsGarantiaNorm,
    thresholdCustoBaixo: isFinite(threshold) && threshold > 0 ? threshold : 0.5,
    lookbackMeses: Number.isInteger(lookback) && lookback > 0 ? lookback : 12,
    cacheTtlSeg: Number.isInteger(cacheTtl) && cacheTtl > 0 ? cacheTtl : 600,
  };
}

/** True se o CFOP informado está na lista de CFOPs de garantia configurada. */
export function isCfopGarantia(cfop: unknown, cfg?: AjustesConfig): boolean {
  const c = cfg || getConfig();
  const n = cfopNormalizado(cfop);
  return !!n && c.cfopsGarantiaNorm.has(n);
}
