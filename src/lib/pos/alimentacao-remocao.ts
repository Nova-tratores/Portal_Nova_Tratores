// Remoção de alimentação da OS com MOTIVO obrigatório (25/11/2026).
// A tela pede o motivo ao clicar na lixeira de um dia já salvo; o servidor grava
// no Histórico da OS (logs_ppo) quem removeu, quando e por quê. Regras puras.

export interface AlimentacaoBasica {
  data: string;
  valor: number;
  tecnicos?: string[];
  foto?: string | null;
}

export interface RemocaoAlimentacao {
  data: string;
  valor: number;
  tecnicos: string[];
  motivo: string;
}

export const MOTIVO_MIN = 5;

/** Motivo válido: texto com pelo menos MOTIVO_MIN letras/números úteis. */
export function motivoValido(m: unknown): boolean {
  return String(m ?? "").replace(/\s+/g, " ").trim().length >= MOTIVO_MIN;
}

const chave = (a: AlimentacaoBasica) => `${String(a.data || "").slice(0, 10)}|${Math.round((Number(a.valor) || 0) * 100)}`;

/** Itens que estavam salvos e não estão mais (conta repetidos: dois dias iguais, tira um). */
export function alimentacoesRemovidas(antes: AlimentacaoBasica[], depois: AlimentacaoBasica[]): AlimentacaoBasica[] {
  const resta = new Map<string, number>();
  for (const a of depois) resta.set(chave(a), (resta.get(chave(a)) || 0) + 1);
  const fora: AlimentacaoBasica[] = [];
  for (const a of antes) {
    const k = chave(a);
    const n = resta.get(k) || 0;
    if (n > 0) resta.set(k, n - 1);
    else fora.push(a);
  }
  return fora;
}

/** Limpa o que veio da tela (nunca confiar no formato). */
export function normalizarRemocoes(raw: unknown): RemocaoAlimentacao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 60)
    .map((r) => ({
      data: typeof r?.data === "string" ? r.data.slice(0, 10) : "",
      valor: Number(r?.valor) || 0,
      tecnicos: Array.isArray(r?.tecnicos) ? r.tecnicos.filter((t: unknown) => typeof t === "string" && t).slice(0, 2) : [],
      motivo: String(r?.motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    }))
    .filter((r) => motivoValido(r.motivo));
}

const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "sem data");
const reais = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;

/** Texto da linha do Histórico. */
export function textoRemocao(item: { data: string; valor: number; tecnicos?: string[] }, motivo: string | null): string {
  const tec = (item.tecnicos || []).filter(Boolean).join(" e ");
  const base = `Alimentação removida — ${dataBR(item.data)} · ${reais(item.valor)}${tec ? ` · ${tec}` : ""}`;
  return motivo ? `${base} — motivo: ${motivo}` : `${base} — sem motivo informado`;
}

/**
 * Linhas do Histórico para gravar ao salvar: casa cada item removido com o motivo
 * que a tela mandou (pela data+valor; senão, na ordem). Removido sem motivo
 * (janela antiga, outro caminho) também entra, marcado "sem motivo informado".
 */
export function linhasHistoricoRemocao(antes: AlimentacaoBasica[], depois: AlimentacaoBasica[], remocoes: RemocaoAlimentacao[]): string[] {
  const removidos = alimentacoesRemovidas(antes, depois);
  if (removidos.length === 0) return [];
  const livres = [...remocoes];
  return removidos.map((item) => {
    let i = livres.findIndex((r) => chave(r) === chave(item));
    if (i < 0) i = livres.length ? 0 : -1;
    const motivo = i >= 0 ? livres.splice(i, 1)[0].motivo : null;
    return textoRemocao({ data: item.data, valor: item.valor, tecnicos: item.tecnicos }, motivo);
  });
}
