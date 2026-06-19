// ============================================================================
// Multi-conta Omie do módulo Ajustes (NOVA / CASTRO).
// Portado de omie-api.js (CONTAS_OMIE + getCredentials + getContasOmie + labelConta).
//
// Decisão de arquitetura (igual ao módulo estoque): threading EXPLÍCITO de
// `conta` em vez de AsyncLocalStorage. Toda função de lib/rota recebe `conta`
// como argumento.
//   - undefined  => "Todas" (sem filtro por conta_omie)
//   - 'NOVA' / 'CASTRO' => isolada
//
// Diferente do app original (que usava ids minúsculos 'nova'/'castro' + label
// 'NOVA'/'CASTRO'), aqui unificamos com o estoque: Conta JÁ é 'NOVA'/'CASTRO'
// (= valor gravado em conta_omie). labelConta(conta) retorna a própria conta.
// ============================================================================

export type Conta = 'NOVA' | 'CASTRO';
/** undefined = "Todas" (sem filtro por conta_omie). */
export type ContaFiltro = Conta | undefined;

export const CONTA_DEFAULT: Conta = 'NOVA';

interface ContaConfig {
  nome: string;
  appKey?: string;
  appSecret?: string;
}

const CONTAS: Record<Conta, ContaConfig> = {
  NOVA: {
    nome: 'Nova',
    // Fallback de retrocompatibilidade: se as env novas não existirem, usa as antigas como NOVA.
    appKey: process.env.OMIE_APP_KEY_NOVA ?? process.env.OMIE_APP_KEY,
    appSecret: process.env.OMIE_APP_SECRET_NOVA ?? process.env.OMIE_APP_SECRET,
  },
  CASTRO: {
    nome: 'Castro',
    appKey: process.env.OMIE_APP_KEY_CASTRO,
    appSecret: process.env.OMIE_APP_SECRET_CASTRO,
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
export function getContasOmie(): Array<{ id: Conta; nome: string; label: Conta }> {
  return (Object.keys(CONTAS) as Conta[])
    .filter((c) => CONTAS[c].appKey && CONTAS[c].appSecret)
    .map((c) => ({ id: c, nome: CONTAS[c].nome, label: c }));
}

/** Label gravado em conta_omie no Supabase. Aqui é a própria conta (uppercase). */
export function labelConta(conta: Conta): Conta {
  return conta;
}
