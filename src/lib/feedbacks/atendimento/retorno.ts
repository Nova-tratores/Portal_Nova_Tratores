// Retorno inteligente (Fase 2) — parte PURA. Quantos dias até ligar de novo,
// em função do desfecho e do humor do cliente; sugestões de tag "cliente
// sensível" e de "não contatar" (sempre sugestão, nunca automático).

import { hojeISO, somarDias, type Desfecho } from "./chamada";

export interface ConfigRetorno {
  retorno_dias_padrao: number; // 30
  retorno_dias_humor_baixo: number; // 90
  humor_baixo_max: number; // humor <= isto = baixo (2)
  sugerir_caveira_apos: number; // nº de humores 1 seguidos (2)
}

export const CONFIG_RETORNO_PADRAO: ConfigRetorno = {
  retorno_dias_padrao: 30,
  retorno_dias_humor_baixo: 90,
  humor_baixo_max: 2,
  sugerir_caveira_apos: 2,
};

export const TAG_CLIENTE_SENSIVEL = "Cliente sensível";

export function lerConfigRetorno(parametros: Record<string, unknown> | null | undefined): ConfigRetorno {
  const n = (k: keyof ConfigRetorno) => {
    const v = Number(parametros?.[k]);
    return Number.isFinite(v) && v > 0 ? v : CONFIG_RETORNO_PADRAO[k];
  };
  return { retorno_dias_padrao: n("retorno_dias_padrao"), retorno_dias_humor_baixo: n("retorno_dias_humor_baixo"), humor_baixo_max: n("humor_baixo_max"), sugerir_caveira_apos: n("sugerir_caveira_apos") };
}

export const HUMORES: { valor: number; emoji: string; rotulo: string }[] = [
  { valor: 1, emoji: "😡", rotulo: "Irritado" },
  { valor: 2, emoji: "😕", rotulo: "Chateado" },
  { valor: 3, emoji: "😐", rotulo: "Neutro" },
  { valor: 4, emoji: "🙂", rotulo: "Bem" },
  { valor: 5, emoji: "😄", rotulo: "Ótimo" },
];
export const QUALIDADES: { valor: number; emoji: string; rotulo: string }[] = [
  { valor: 1, emoji: "1", rotulo: "Ruim" },
  { valor: 2, emoji: "2", rotulo: "Fraca" },
  { valor: 3, emoji: "3", rotulo: "Ok" },
  { valor: 4, emoji: "4", rotulo: "Boa" },
  { valor: 5, emoji: "5", rotulo: "Excelente" },
];

export function emojiHumor(h: number | null | undefined): string {
  return HUMORES.find((x) => x.valor === h)?.emoji ?? "";
}

export interface SugestaoRetorno {
  dias: number | null; // null = desfecho não tem retorno
  data: string | null; // YYYY-MM-DD
  motivo: string; // explicação de balcão
  humor_baixo: boolean;
}

/**
 * retornar → o usuário escolhe (sugere +7 d); sem_resposta → padrão (30 d),
 * ou dias de humor baixo se humor ≤ teto; demais desfechos → sem retorno.
 * Humor baixo em desfecho concluído não gera retorno (o registro fecha), mas
 * `humor_baixo` vai true para a UI sugerir a tag.
 */
export function sugerirRetorno(desfecho: Desfecho, humor: number | null | undefined, cfg: ConfigRetorno = CONFIG_RETORNO_PADRAO, agora: Date = new Date()): SugestaoRetorno {
  const hoje = hojeISO(agora);
  const baixo = humor != null && humor <= cfg.humor_baixo_max;
  if (desfecho === "sem_resposta") {
    const dias = cfg.retorno_dias_padrao;
    return { dias, data: somarDias(hoje, dias), motivo: `não atendeu: ligar de novo em ${dias} dias`, humor_baixo: baixo };
  }
  if (desfecho === "retornar") {
    if (baixo) {
      const dias = cfg.retorno_dias_humor_baixo;
      return { dias, data: somarDias(hoje, dias), motivo: `cliente chateado: dar um tempo maior (${dias} dias)`, humor_baixo: true };
    }
    return { dias: 7, data: somarDias(hoje, 7), motivo: "sugestão: uma semana (ajuste se combinou outra data)", humor_baixo: false };
  }
  return { dias: null, data: null, motivo: "", humor_baixo: baixo };
}

/** Humores das últimas ligações (mais recente primeiro) → sugerir "não contatar"? */
export function sugerirCaveira(humoresRecentes: (number | null | undefined)[], humorAtual: number | null | undefined, cfg: ConfigRetorno = CONFIG_RETORNO_PADRAO): boolean {
  const seq = [humorAtual, ...humoresRecentes].filter((h): h is number => typeof h === "number");
  if (seq.length < cfg.sugerir_caveira_apos) return false;
  return seq.slice(0, cfg.sugerir_caveira_apos).every((h) => h === 1);
}
