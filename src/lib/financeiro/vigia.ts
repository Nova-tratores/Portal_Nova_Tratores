// Regras PURAS do vigia de card parado do Financeiro (tarefa 'financeiro-vigia', 08:00 dias úteis,
// 29/10/2026). Um resumo por setor no sino:
//   Financeiro  → Gerar boleto parado há mais de 1 dia útil (+ o que o robô de fases moveu nas
//                 últimas 24 h + o total a receber na semana);
//   Pós-Vendas / Peças (pelo setor_destino do card: 'pecas' = Peças, o resto = Pós-Vendas) →
//                 Enviar ao cliente > 2 dias úteis, Sem boleto > 7, Vencido sem recobrança > 3.
// "Parado desde" = status_changed_at (trigger de sql/financeiro-status-changed-at.sql); sem ele, a
// data mais próxima disponível (último movimento/criação no audit_log; no Vencido, também a última
// cobrança/lembrete por e-mail). Sem nenhuma data, o card não entra (não dá para dizer há quanto tempo).
import { diaDoInstante } from "@/lib/financeiro/fases-automaticas";

export type SetorVigia = "financeiro" | "posvendas" | "pecas";

/** Dias úteis (seg–sex) que o card pode ficar em cada fase antes de aparecer no vigia. */
export const LIMITE_DIAS_UTEIS: Record<string, number> = { gerar_boleto: 1, enviar_cliente: 2, sem_boleto: 7, vencido: 3 };

export const ROTULO_FASE: Record<string, string> = {
  gerar_boleto: "Gerar boleto", enviar_cliente: "Enviar ao cliente", sem_boleto: "Sem boleto", vencido: "Vencido sem recobrança",
};

export const FASES_VIGIADAS = Object.keys(LIMITE_DIAS_UTEIS);

// Regras do José (29/10): Gerar boleto com vencimento passado fica em Gerar boleto e entra em
// DESTAQUE ("venceu sem boleto gerado"), mesmo sem data de fase; Vencido que não se recobra
// (podeRecobrar: sem boleto, Pix/cartão/cheque, mais de 180 dias) não entra em "sem recobrança".
export type CardVigia = {
  id: number; status: string; setor_destino?: string | null; nom_cliente?: string | null; desde: string | null;
  /** Gerar boleto com vencimento já passado */
  venceuSemBoleto?: boolean;
  /** resultado de podeRecobrar (só vale no Vencido); false = fora do aviso */
  recobravel?: boolean;
};
export type ItemParado = { id: number; status: string; cliente: string; diasUteis: number; venceuSemBoleto?: boolean };

/** Dias úteis (seg–sex) depois de `a` até `b`, contando `b` (datas ISO "AAAA-MM-DD"). Sem feriados. */
export function diasUteisEntre(a: string, b: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  let n = 0;
  for (let t = d(a) + 86_400_000; t <= d(b); t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Setor que cuida do card naquela fase. */
export function setorDoCard(c: { status: string; setor_destino?: string | null }): SetorVigia {
  if (c.status === "gerar_boleto") return "financeiro";
  return c.setor_destino === "pecas" ? "pecas" : "posvendas";
}

/** A data mais recente entre várias (instantes ISO ou datas); null se nenhuma. */
export function maisRecente(...datas: (string | null | undefined)[]): string | null {
  const ok = datas.filter((x): x is string => !!x && !Number.isNaN(new Date(x).getTime()));
  if (!ok.length) return null;
  return ok.reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a));
}

/** Cards parados além do limite, agrupados por setor. Itens mais parados primeiro. */
export function cardsParados(cards: CardVigia[], hoje: string): { porSetor: Record<SetorVigia, ItemParado[]>; semData: number } {
  const porSetor: Record<SetorVigia, ItemParado[]> = { financeiro: [], posvendas: [], pecas: [] };
  let semData = 0;
  for (const c of cards) {
    const limite = LIMITE_DIAS_UTEIS[c.status];
    if (limite == null) continue;
    if (c.status === "vencido" && c.recobravel === false) continue; // não se recobra: fora do aviso
    const du = c.desde ? diasUteisEntre(/^\d{4}-\d{2}-\d{2}$/.test(c.desde) ? c.desde : diaDoInstante(c.desde), hoje) : 0;
    if (c.status === "gerar_boleto" && c.venceuSemBoleto) {
      porSetor.financeiro.push({ id: c.id, status: c.status, cliente: String(c.nom_cliente || "").trim(), diasUteis: du, venceuSemBoleto: true });
      continue;
    }
    if (!c.desde) { semData++; continue; }
    if (du <= limite) continue;
    porSetor[setorDoCard(c)].push({ id: c.id, status: c.status, cliente: String(c.nom_cliente || "").trim(), diasUteis: du });
  }
  for (const k of Object.keys(porSetor) as SetorVigia[]) porSetor[k].sort((a, b) => b.diasUteis - a.diasUteis);
  return { porSetor, semData };
}

/** Teto de cards listados por fase no aviso (o resto vira "e mais N"). */
export const TETO_POR_FASE = 6;

/** Linhas do aviso: uma por fase, com os cards mais parados. */
export function linhasParados(itens: ItemParado[], teto = TETO_POR_FASE): string[] {
  const linhas: string[] = [];
  // destaque primeiro: Gerar boleto que já venceu (não vai mais para Vencido; José, 29/10)
  const semBoleto = itens.filter((i) => i.venceuSemBoleto);
  if (semBoleto.length) {
    const nomes = semBoleto.slice(0, teto).map((i) => `#${i.id} ${i.cliente.slice(0, 28)}`).join(", ");
    linhas.push(`⚠ VENCEU SEM BOLETO GERADO: ${semBoleto.length} — ${nomes}${semBoleto.length > teto ? ` e mais ${semBoleto.length - teto}` : ""}`);
  }
  const porFase = new Map<string, ItemParado[]>();
  for (const i of itens) if (!i.venceuSemBoleto) porFase.set(i.status, [...(porFase.get(i.status) || []), i]);
  for (const f of FASES_VIGIADAS.filter((x) => porFase.has(x))) {
    const lista = porFase.get(f)!;
    const nomes = lista.slice(0, teto).map((i) => `#${i.id} ${i.cliente.slice(0, 28)} (${i.diasUteis} d.ú.)`).join(", ");
    const resto = lista.length > teto ? ` e mais ${lista.length - teto}` : "";
    linhas.push(`${ROTULO_FASE[f]} (+${LIMITE_DIAS_UTEIS[f]} d.ú.): ${lista.length} — ${nomes}${resto}`);
  }
  return linhas;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O que o robô de fases moveu (de→para) nas últimas 24 h, numa linha. */
export function linhaRobo(movimentos: { de: string; para: string }[]): string {
  if (!movimentos.length) return "Robô de fases (24 h): nada movido";
  const por = new Map<string, number>();
  for (const m of movimentos) por.set(`${m.de}→${m.para}`, (por.get(`${m.de}→${m.para}`) || 0) + 1);
  return `Robô de fases (24 h): ${movimentos.length} card(s) — ${[...por].map(([k, n]) => `${n} ${k}`).join(", ")}`;
}

/** Total a receber nos próximos 7 dias (títulos não recebidos/cancelados do contas_receber), por empresa. */
export function linhaSemana(titulos: { conta_omie: string; valor_documento: number | string | null; status_titulo: string }[]): string {
  const por = new Map<string, number>();
  let total = 0;
  for (const t of titulos) {
    if (t.status_titulo === "RECEBIDO" || t.status_titulo === "CANCELADO") continue;
    const v = Number(t.valor_documento) || 0;
    total += v;
    por.set(t.conta_omie, (por.get(t.conta_omie) || 0) + v);
  }
  const partes = [...por].sort().map(([c, v]) => `${c === "NOVA" ? "Nova" : c === "CASTRO" ? "Castro" : c} ${brl(v)}`);
  return `A receber nos próximos 7 dias: ${brl(total)}${partes.length > 1 ? ` (${partes.join(" · ")})` : ""}`;
}
