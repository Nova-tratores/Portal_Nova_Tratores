// Recobrança do Financeiro → TICKET para o setor (José, 29/10/2026: "se o Financeiro pedir
// para recobrar, gera um ticket para o setor responsável e alguém pega a tarefa; no ticket
// explica de onde veio e o que é para fazer").
//
// Regras PURAS (sem banco; testadas em __tests__/recobranca.test.ts). O banco fica em
// recobranca-server.ts — não juntar (vazaria o supabaseAdmin no bundle do navegador).
import { nfsDoCard, numValor, valorProprio, type CardFase, type Situacao } from "./fases-automaticas";

export type SetorRecobranca = "posvendas" | "pecas";

/** Card de peças (setor_destino 'pecas') vai para Peças; o resto (Oficina) para o Pós-Vendas. */
export function setorDaRecobranca(card: { setor_destino?: string | null }): SetorRecobranca {
  return card?.setor_destino === "pecas" ? "pecas" : "posvendas";
}

export const ROTULO_SETOR: Record<SetorRecobranca, string> = { posvendas: "Pós-Vendas", pecas: "Peças" };

/** Nome do bloco (tickets_quadros) onde caem os tickets de recobrança do setor. */
export const nomeBlocoCobranca = (s: SetorRecobranca) => `Cobranças — ${ROTULO_SETOR[s]}`;

export const COR_BLOCO: Record<SetorRecobranca, string> = { posvendas: "#2563eb", pecas: "#d97706" };

export const COLUNA_INICIAL = "A fazer";

const semAcento = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** financeiro_usu.funcao é do setor? ('Pós Vendas'/'Pós-Vendas'/'Pos vendas' · 'Peças'/'Pecas'). */
export function funcaoDoSetor(funcao: unknown, setor: SetorRecobranca): boolean {
  const f = semAcento(funcao).replace(/[^a-z]/g, "");
  return setor === "pecas" ? f === "pecas" : f === "posvendas";
}

/** funcao 'Financeiro' (pode pedir recobrança mesmo sem o módulo). */
export const ehFuncaoFinanceiro = (funcao: unknown) => semAcento(funcao).trim() === "financeiro";

export type Pessoa = { id: string; nome: string };

/**
 * Rodízio simples: quem tem MENOS tickets abertos no bloco fica com o novo.
 * Empate → ordem alfabética do nome (estável e previsível). Lista vazia → null.
 */
export function escolherResponsavel(pessoas: Pessoa[], abertosPorPessoa: Map<string, number> | Record<string, number>): Pessoa | null {
  if (!pessoas.length) return null;
  const n = (id: string) => (abertosPorPessoa instanceof Map ? abertosPorPessoa.get(id) : abertosPorPessoa[id]) || 0;
  return [...pessoas].sort((a, b) => n(a.id) - n(b.id) || a.nome.localeCompare(b.nome, "pt-BR"))[0];
}

const somaUmDia = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const fimDeSemana = (iso: string) => { const w = new Date(iso + "T12:00:00Z").getUTCDay(); return w === 0 || w === 6; };

/** hoje + n dias ÚTEIS (pula sábado, domingo e feriado). Ex.: quinta + 2 = segunda. */
export function somarDiasUteis(hoje: string, n: number, feriados: Set<string> = new Set()): string {
  let d = hoje.slice(0, 10);
  let falta = n;
  for (let i = 0; falta > 0 && i < 400; i++) {
    d = somaUmDia(d);
    if (!fimDeSemana(d) && !feriados.has(d)) falta--;
  }
  return d;
}

/** Dias corridos de atraso (0 se ainda não venceu ou sem data). */
export function diasDeAtraso(vencimento: string | null | undefined, hoje: string): number {
  if (!vencimento) return 0;
  const ms = Date.parse(hoje.slice(0, 10) + "T12:00:00Z") - Date.parse(vencimento.slice(0, 10) + "T12:00:00Z");
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : 0;
}

/** "2026-10-29" → "29/10" (curta) ou "29/10/2026". */
export function dataBR(iso: string | null | undefined, curta = false): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return curta ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/** 1234.5 → "1.234,50" (sem o "R$"). */
export function moedaBR(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type CardRecobranca = CardFase & {
  setor_destino?: string | null;
  cnpj_cliente?: string | null;
  recombrancas_qtd?: number | null;
};

/** Valor a cobrar: o próprio do card (filho de grupo usa o original) ou o total. */
export const valorDoCard = (c: CardRecobranca) => valorProprio(c) ?? numValor(c.valor_servico) ?? numValor(c.valor);

/** Link que ABRE o card na home do setor (home-posvendas / home-pecas leem ?id=&tipo=boleto). */
export function linkDoCard(c: CardRecobranca): string {
  const home = setorDaRecobranca(c) === "pecas" ? "home-pecas" : "home-posvendas";
  return `/financeiro/${home}?id=${c.id}&tipo=boleto`;
}

/** Título do ticket: "Recobrar <cliente> — R$ <valor> (venceu dd/mm)". Cabe em 200 caracteres. */
export function tituloRecobranca(c: CardRecobranca): string {
  const cliente = String(c.nom_cliente || "cliente sem nome").trim().slice(0, 120);
  const v = valorDoCard(c);
  const venc = c.vencimento_boleto ? ` (venceu ${dataBR(c.vencimento_boleto, true)})` : "";
  return `Recobrar ${cliente} — R$ ${moedaBR(v)}${venc}`;
}

const SITUACAO_TEXTO: Record<Situacao, string> = {
  atrasado: "ATRASADO (o Omie dá o título como vencido e não pago)",
  aberto: "em aberto, ainda a vencer no Omie",
  recebido: "RECEBIDO no Omie — confira antes de cobrar, o cliente pode já ter pago",
  sem_titulo: "título não encontrado no Omie",
};

export type DadosDescricao = {
  card: CardRecobranca;
  solicitanteNome: string;
  hoje: string;
  /** Nº desta recobrança (recombrancas_qtd depois de somar 1). */
  numero: number;
  /** Situação no Omie (null = não deu para consultar). */
  situacao?: Situacao | null;
  /** Títulos do Omie casados com o card (para mostrar quantos e quanto). */
  titulos?: { status_titulo: string; valor_documento?: number | string | null; data_vencimento?: string | null }[];
  /** URL do card (relativa; a tela do ticket mostra como texto). */
  link: string;
};

/** Descrição em texto claro: de onde veio, os dados e o que fazer. */
export function descricaoRecobranca(d: DadosDescricao): string {
  const c = d.card;
  const nfs = nfsDoCard(c);
  const atraso = diasDeAtraso(c.vencimento_boleto, d.hoje);
  const linhas: string[] = [
    "De onde veio:",
    `Pedido de recobrança do Financeiro por ${d.solicitanteNome} em ${dataBR(d.hoje)} — card #${c.id} do Financeiro, ${d.numero}ª recobrança.`,
    "",
    "Dados da cobrança:",
    `• Cliente: ${String(c.nom_cliente || "—").trim()}`,
    `• CNPJ/CPF: ${String(c.cnpj_cliente || "").trim() || "—"}`,
    `• NF: ${nfs.length ? nfs.join(", ") : "—"}`,
    `• Valor: R$ ${moedaBR(valorDoCard(c))}`,
    `• Forma de pagamento: ${String(c.forma_pagamento || "").trim() || "—"}`,
    `• Vencimento: ${dataBR(c.vencimento_boleto)}${atraso ? ` (${atraso} dia${atraso === 1 ? "" : "s"} de atraso)` : ""}`,
  ];
  if (d.situacao) {
    const abertos = (d.titulos || []).filter((t) => t.status_titulo !== "RECEBIDO");
    const soma = abertos.reduce((a, t) => a + (numValor(t.valor_documento) || 0), 0);
    const extra = d.situacao !== "sem_titulo" && abertos.length
      ? ` — ${abertos.length} título${abertos.length === 1 ? "" : "s"} em aberto, R$ ${moedaBR(soma)}`
      : "";
    linhas.push(`• Situação no Omie: ${SITUACAO_TEXTO[d.situacao]}${extra}`);
  }
  linhas.push(
    "",
    "O que fazer:",
    "1. Contatar o cliente (telefone/WhatsApp) e lembrar do boleto vencido;",
    "2. Se o cliente já pagou, pedir o comprovante e anexar no card;",
    "3. Se vai pagar, combinar a data e anotar aqui;",
    "4. Ao terminar, marcar como resolvido.",
    "",
    `Card no Financeiro: ${d.link}`,
  );
  return linhas.join("\n");
}
