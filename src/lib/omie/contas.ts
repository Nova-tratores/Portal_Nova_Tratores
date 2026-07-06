// Credenciais das contas Omie. Valores vêm SÓ de variáveis de ambiente
// (Railway / .env.local) — nunca hardcoded no código.
export type OmieConta = { key: string; secret: string };

export const OMIE_ACCOUNTS: Record<string, OmieConta> = {
  "Nova Tratores": {
    key: process.env.OMIE_APP_KEY || "",
    secret: process.env.OMIE_APP_SECRET || "",
  },
  "Castro Peças": {
    key: process.env.OMIE_APP_KEY_CASTRO || "",
    secret: process.env.OMIE_APP_SECRET_CASTRO || "",
  },
};

// Aliases para variações de escrita do nome da empresa
OMIE_ACCOUNTS["Castro Pecas"] = OMIE_ACCOUNTS["Castro Peças"];

export function contaOmie(empresa?: string | null): OmieConta {
  const nome = String(empresa || "Nova Tratores").trim();
  return OMIE_ACCOUNTS[nome] || OMIE_ACCOUNTS["Nova Tratores"];
}
