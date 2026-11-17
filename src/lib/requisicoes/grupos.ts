// Regras dos grupos de requisições (José, 16/11/2026: "precisamos conseguir concluir um grupo, não é
// necessário ficar aberto para sempre, mas deixa essa escolha também").
// Ao criar, o grupo fica aberto sempre (padrão) ou conclui sozinho quando TODAS as requisições dele
// chegam ao financeiro. Requisição na lixeira não conta; grupo vazio nunca conclui sozinho.

export const STATUS_FINAL_REQ = "financeiro";

/** "FINANCEIRO" (vindo do AppSheet) = financeiro; vazio = pedido */
const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase() || "pedido";

/** status das requisições do grupo → o grupo já pode concluir sozinho? */
export function grupoProntoParaConcluir(statusDasReqs: (string | null | undefined)[]): boolean {
  const validas = statusDasReqs.map(norm).filter((s) => s !== "lixeira");
  return validas.length > 0 && validas.every((s) => s === STATUS_FINAL_REQ);
}

export type ReqDoGrupo = { id: number; status: string | null; valor_despeza?: string | number | null };

/** ordem das fases na barra do grupo (lixeira fica de fora das contas) */
export const FASES_GRUPO = ['pedido', 'completa', 'aguardando', 'recusada', 'financeiro'] as const;

/** números do grupo para o cartão: quantas, valor somado, quantas por fase e % que já chegou ao financeiro */
export function resumoGrupo(reqs: ReqDoGrupo[], valor: (v: ReqDoGrupo['valor_despeza']) => number) {
  const validas = reqs.filter((r) => norm(r.status) !== 'lixeira');
  const porFase: Record<string, number> = {};
  let total = 0;
  for (const r of validas) {
    const f = norm(r.status);
    porFase[f] = (porFase[f] || 0) + 1;
    const n = valor(r.valor_despeza);
    if (Number.isFinite(n)) total += n;
  }
  const noFinanceiro = porFase[STATUS_FINAL_REQ] || 0;
  return {
    qtd: validas.length,
    naLixeira: reqs.length - validas.length,
    total,
    porFase,
    noFinanceiro,
    pct: validas.length ? Math.round((noFinanceiro / validas.length) * 100) : 0,
    pronto: grupoProntoParaConcluir(validas.map((r) => r.status)),
  };
}
