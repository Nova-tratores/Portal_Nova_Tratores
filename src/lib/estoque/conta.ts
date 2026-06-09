// ============================================================================
// Multi-conta Omie do módulo Estoque (NOVA / CASTRO).
// Portado do monolito server.js (CONTAS_OMIE + getCredentials + getContasOmie).
//
// Decisão de arquitetura: threading EXPLÍCITO de `conta` em vez de
// AsyncLocalStorage. Toda função de lib/rota recebe `conta` como argumento.
//   - undefined  => leitura "Todas" (sem filtro por conta_omie)
//   - 'NOVA' / 'CASTRO' => isolada
// ============================================================================

export type Conta = 'NOVA' | 'CASTRO';
/** undefined = "Todas" (sem filtro por conta_omie). */
export type ContaFiltro = Conta | undefined;

export const CONTA_DEFAULT: Conta = 'NOVA';

interface ContaConfig {
  nome: string;
  appKey?: string;
  appSecret?: string;
  dataInicio: { mes: number; ano: number };
}

const CONTAS: Record<Conta, ContaConfig> = {
  NOVA: {
    nome: 'Nova',
    // Fallback de retrocompatibilidade: se as env novas não existirem, usa as antigas como NOVA.
    appKey: process.env.OMIE_APP_KEY_NOVA ?? process.env.OMIE_APP_KEY,
    appSecret: process.env.OMIE_APP_SECRET_NOVA ?? process.env.OMIE_APP_SECRET,
    dataInicio: { mes: 11, ano: 2022 },
  },
  CASTRO: {
    nome: 'Castro',
    appKey: process.env.OMIE_APP_KEY_CASTRO,
    appSecret: process.env.OMIE_APP_SECRET_CASTRO,
    dataInicio: { mes: 11, ano: 2022 },
  },
};

/** Valida `?conta=` de uma rota. Retorna undefined para "Todas" ou valor inválido. */
export function parseConta(raw: string | null | undefined): ContaFiltro {
  if (raw === 'NOVA' || raw === 'CASTRO') return raw;
  return undefined;
}

/** Credenciais Omie da conta (default NOVA). Lança se não configuradas. */
export function getCredentials(conta: Conta = CONTA_DEFAULT): { appKey: string; appSecret: string } {
  const cfg = CONTAS[conta];
  if (!cfg) throw new Error('Conta Omie desconhecida: ' + conta);
  if (!cfg.appKey || !cfg.appSecret) {
    throw new Error('Credenciais Omie não configuradas para conta: ' + conta);
  }
  return { appKey: cfg.appKey, appSecret: cfg.appSecret };
}

/** Lista as contas com credenciais configuradas (para o seletor de conta). */
export function getContasOmie(): Array<{ id: Conta; nome: string }> {
  return (Object.keys(CONTAS) as Conta[])
    .filter((c) => CONTAS[c].appKey && CONTAS[c].appSecret)
    .map((c) => ({ id: c, nome: CONTAS[c].nome }));
}

export function getDataInicio(conta: Conta = CONTA_DEFAULT): { mes: number; ano: number } {
  return CONTAS[conta].dataInicio;
}

/**
 * Gera lista de meses esperados para uma conta, do dataInicio até o mês
 * anterior ao atual (exclusive). Portado de gerarMesesEsperados (server.js).
 */
export function gerarMesesEsperados(conta: Conta = CONTA_DEFAULT): Array<{ mes: number; ano: number }> {
  const inicio = getDataInicio(conta);
  const now = new Date();
  const mesAtualNum = now.getMonth() + 1;
  const anoAtualNum = now.getFullYear();
  const meses: Array<{ mes: number; ano: number }> = [];
  let mes = inicio.mes;
  let ano = inicio.ano;
  while (ano < anoAtualNum || (ano === anoAtualNum && mes < mesAtualNum)) {
    meses.push({ mes, ano });
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}
