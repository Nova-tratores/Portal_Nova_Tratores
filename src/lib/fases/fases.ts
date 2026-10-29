// Fases do POS e do PPV — UMA lista só (José, 29/10/2026: "tem que ter a mesma quantidade de fases que tem
// no pos no ppv, com o mesmo nome, se alterar no pos altera no ppv; o pedido de venda fica na mesma fase que
// o pos se encontra"). Regras puras (testadas em __tests__/fases.test.ts).
//
// - As colunas do PPV são as do POS, na mesma ordem.
// - PPV ligado a uma OS aparece na coluna da fase ATUAL da OS (lida na hora). A fase gravada no PPV continua
//   servindo à lógica dele (enviar/faturar/cancelar), mas não decide a coluna. PPV cancelado fica em Cancelada.
// - PPV de balcão (sem OS) usa a fase dele; a única que não existe no POS é "Enviado Omie" → "Enviado Para Omie".
// - O nome mostrado vem de fases_rotulos (lápis do pós-vendas); sem nome salvo, a própria fase.
import { PHASES } from "@/lib/pos/constants";
import { normalizarStatus } from "@/lib/ppv/utils";

export const FASES: readonly string[] = PHASES;

/** PPV grava "Enviado Omie"; no POS a fase equivalente é "Enviado Para Omie". */
const PPV_PARA_POS: Record<string, string> = { "Enviado Omie": "Enviado Para Omie" };
/** E o caminho de volta, quando alguém arrasta um PPV de balcão para uma coluna. */
const POS_PARA_PPV: Record<string, string> = { "Enviado Para Omie": "Enviado Omie" };

export function ehFase(f: string): boolean {
  return FASES.includes(f);
}

/** Coluna em que o PPV aparece no quadro. */
export function faseDoPPVNaTela(ppv: { status?: string | null; osId?: string | null }, faseDaOS?: string | null): string {
  const propria = normalizarStatus(ppv.status);
  if (propria === "Cancelada") return "Cancelada";
  if (ppv.osId && faseDaOS && ehFase(faseDaOS)) return faseDaOS;
  return PPV_PARA_POS[propria] || propria;
}

/** Fase a gravar no PPV de balcão quando ele é solto numa coluna. */
export function faseParaGravarNoPPV(coluna: string): string {
  return POS_PARA_PPV[coluna] || coluna;
}

/** Nome mostrado: o salvo pelo pós-vendas ou a própria fase. */
export function rotuloDaFase(chave: string, rotulos: Record<string, string> | null | undefined): string {
  const r = rotulos?.[chave];
  return r && r.trim() ? r.trim() : chave;
}

/** Valida o nome novo; devolve a mensagem de erro ou null. */
export function validarRotulo(chave: string, rotulo: string): string | null {
  if (!ehFase(chave)) return "Fase desconhecida.";
  const r = rotulo.trim();
  if (!r) return "Escreva o nome da fase.";
  if (r.length > 60) return "Use no máximo 60 letras.";
  return null;
}

/** Quem pode renomear: pós-vendas (categoria ou módulo pos dado à pessoa), admin ou dev. */
export function podeRenomearFases(p: { isAdmin?: boolean; categoria?: string | null; modulos?: string[] | null }): boolean {
  if (p.isAdmin) return true;
  if (String(p.categoria || "").trim().toLowerCase() === "pós vendas") return true;
  return (p.modulos || []).includes("pos");
}
