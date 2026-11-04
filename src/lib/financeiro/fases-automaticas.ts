// Fases automáticas do kanban do Financeiro (Chamado_NF), no SERVIDOR.
//
// Antes (até 29/10/2026) isto rodava no navegador de quem abria o kanban, olhando
// só a data: card vencido ia para "Vencido" mesmo com o cliente já tendo pago no
// Omie, e nada ficava no histórico. Em 29/10 havia 148 cards em Vencido, 125 deles
// RECEBIDOS no Omie (José: "do nada vários cards que já estavam pagos foram para
// vencido"). Agora:
//   1. antes de mover, confere o contas a receber do Omie (tabela contas_receber,
//      sincronizada pelo DRE): tudo RECEBIDO → Pago, inclusive cards já em Vencido;
//   2. o que o Omie mostra ATRASADO vai para Vencido;
//   3. sem título no Omie, valem as regras antigas da data;
//   4. todo movimento grava no audit_log (aparece no histórico do card).
//   5. (29/10) card em Pago há 7 dias ou mais (status_changed_at, gravado pelo trigger de
//      sql/financeiro-status-changed-at.sql) e RECEBIDO no Omie → Concluído. Sem a data, não conclui;
//   6. (29/10) parcelado em Vencido sem parcela ATRASADA no Omie (só recebidas e a vencer) volta
//      para Aguardando cliente — NÃO dá parcela como paga, só tira de Vencido;
//   8. (29/10, José) Gerar boleto vencido NÃO vai mais para Vencido ("cliente que não gerou boleto
//      não tem como recobrar"): fica, e o vigia das 08:00 avisa o Financeiro; Pix/cartão/cheque nunca
//      ficam em Vencido (voltam para Aguardando); Vencido há mais de 180 dias e não recebido ganha a
//      tarefa "Antigo (mais de 6 meses) — sem recobrança" no setor Financeiro (continua Vencido).
//      podeRecobrar(card, hoje) junta essas regras para as telas;
//   7. (29/10) o título vale pelo nome do cliente OU, se o nome no Omie for outro ("OLINTO BOM
//      RETIRO" × "OLINTO RODRIGUES … (FAZ BOM RETIRO)"), pela soma dos títulos = valor do card ± R$ 1.
// Roda pelo agendador (tarefa 'financeiro-fases') e quando alguém abre um kanban
// (POST /api/financeiro/fases-automaticas).
import type { SupabaseClient } from "@supabase/supabase-js";
import { partesBR } from "@/lib/datas/brasil";

export type CardFase = {
  id: number;
  status: string;
  tarefa?: string | null;
  forma_pagamento?: string | null;
  vencimento_boleto?: string | null;
  comprovante_pagamento?: string | null;
  comprovante_pagamento_p1?: string | null;
  grupo_pai_id?: number | null;
  nom_cliente?: string | null;
  num_nf_peca?: string | null;
  num_nf_servico?: string | null;
  omie_empresa?: string | null;
  valor_servico?: string | number | null;
  valor?: string | number | null;
  grupo_valor_original?: string | number | null;
  qtd_parcelas?: string | number | null;
  status_changed_at?: string | null;
  setor?: string | null;
  // anexos do boleto (as colunas reais são anexo_boleto, anexo_boleto2 e anexo_boleto_p1..p5;
  // anexo_boleto_2/_3 são lidas por telas antigas e não existem no banco)
  anexo_boleto?: string | null;
  anexo_boleto2?: string | null;
  anexo_boleto_2?: string | null;
  anexo_boleto_3?: string | null;
  anexo_boleto_p1?: string | null;
  anexo_boleto_p2?: string | null;
  anexo_boleto_p3?: string | null;
  anexo_boleto_p4?: string | null;
  anexo_boleto_p5?: string | null;
};

export type TituloOmie = {
  conta_omie: string;
  numero_documento_fiscal: string;
  numero_parcela?: string | null;
  data_emissao?: string | null;
  data_pagamento?: string | null;
  data_vencimento?: string | null;
  valor_documento?: number | string | null;
  status_titulo: string;
  nome_cliente?: string | null;
};

/** Colunas do contas_receber que as regras usam (robô, lembrete, cobrança, conferência). */
export const COLUNAS_TITULO = "conta_omie, numero_documento_fiscal, numero_parcela, data_emissao, data_pagamento, data_vencimento, valor_documento, status_titulo, nome_cliente";

/** de === para = só troca a tarefa (e o setor), sem mudar de fase (ex.: vencido antigo). */
export type Movimento = { id: number; de: string; para: string; tarefa: string; motivo: string; setor?: string };

// todas as fases abertas: recebido no Omie → Pago vale em qualquer uma; as regras da DATA só
// valem em gerar_boleto e aguardando_vencimento. Pago (→ Concluído) é tratado à parte.
const FASES_OLHADAS = ["gerar_boleto", "enviar_cliente", "aguardando_vencimento", "sem_boleto", "vencido"];
const FASES_DA_DATA = ["gerar_boleto", "aguardando_vencimento"];

/** "Nova Tratores" → "NOVA", "Castro Pecas" → "CASTRO" (como o contas_receber grava). */
export const contaDaEmpresa = (e: unknown) => {
  const t = String(e ?? "").toUpperCase();
  return t.includes("CASTRO") ? "CASTRO" : t.includes("NOVA") ? "NOVA" : "";
};

/** Só os dígitos, sem zeros à esquerda ("00009404" → "9404"). */
export const numeroNF = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");

export const nfsDoCard = (c: CardFase) =>
  [c.num_nf_peca, c.num_nf_servico].flatMap((s) => String(s ?? "").split(/[,/;\s]+/)).map(numeroNF).filter(Boolean);

const PALAVRAS_VAZIAS = new Set(["LTDA", "DOS", "DAS", "DE", "DO", "DA", "OUTRO", "OUTROS", "OUTRA", "OUTRAS", "E", "ME", "EPP"]);
const palavras = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w));

/** Mesmo cliente: a 1ª palavra bate e pelo menos 2 palavras em comum (ou todas, se o nome é curto). */
export function mesmoCliente(a: unknown, b: unknown): boolean {
  const confere = (x: string[], y: Set<string>) =>
    x.length > 0 && y.has(x[0]) && x.filter((w) => y.has(w)).length >= Math.min(2, x.length);
  const A = palavras(a), B = palavras(b);
  return confere(A, new Set(B)) || confere(B, new Set(A));
}

/** Data de hoje em Brasília, "AAAA-MM-DD". */
export function hojeBR(d: Date = new Date()): string {
  const p = partesBR(d);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

const ehPixCartaoCheque = (f: string) => /pix|cart[aã]o|cheque/i.test(f);
const ehBoleto30 = (f: string) => /^boleto\s*30\s*dias$/i.test(f.trim());
const ehParcelado = (f: string) => /parcelado/i.test(f);

export type Situacao = "recebido" | "atrasado" | "aberto" | "sem_titulo";

/** "1.234,56" / "1234.56" / 1234.56 → número (null se vazio ou não interpretável). */
export function numValor(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/[R$\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor PRÓPRIO do card (o que as NFs dele devem somar no Omie). Filho de grupo guarda o seu em
 * grupo_valor_original (o pai carrega o total do grupo); o pai desconta os filhos.
 */
export function valorProprio(c: CardFase, filhos: CardFase[] = []): number | null {
  if (c.grupo_pai_id) return numValor(c.grupo_valor_original);
  const total = numValor(c.valor_servico) || numValor(c.valor);
  if (!total) return null;
  const dosFilhos = filhos.reduce((a, f) => a + (numValor(f.grupo_valor_original) || 0), 0);
  return Math.round((total - dosFilhos) * 100) / 100;
}

/** Diferença de valor aceita entre card e Omie (arredondamento). */
export const TOLERANCIA_VALOR = 1;

/**
 * Títulos do Omie que são DESTE card: mesma empresa (conta_omie), mesma NF, emitidos até 1 ano
 * antes do vencimento, não cancelados — E do mesmo cliente pelo nome OU, se o nome no Omie for
 * outro (José, 29/10: "JAPY GOLF & HOTEL" × "HOTEL RESORT OLINTO"), a soma desses títulos bate
 * com o valor do card (± R$ 1).
 */
export function titulosDoCard(c: CardFase, titulos: TituloOmie[], venc?: string | null, valorRef?: number | null): TituloOmie[] {
  const nfs = new Set(nfsDoCard(c));
  if (!nfs.size) return [];
  const v = venc === undefined ? c.vencimento_boleto : venc;
  const desde = v ? `${Number(v.slice(0, 4)) - 1}${v.slice(4, 10)}` : "0000";
  const conta = contaDaEmpresa(c.omie_empresa); // a mesma NF existe na Nova e na Castro
  const candidatos = titulos.filter((t) =>
    nfs.has(numeroNF(t.numero_documento_fiscal)) &&
    (!conta || String(t.conta_omie).toUpperCase() === conta) &&
    String(t.data_emissao || "9999") >= desde &&
    t.status_titulo !== "CANCELADO");
  const peloNome = candidatos.filter((t) => mesmoCliente(c.nom_cliente, t.nome_cliente));
  if (peloNome.length) return peloNome;
  const ref = valorRef === undefined ? valorProprio(c) : valorRef;
  if (!candidatos.length || !ref) return [];
  const soma = candidatos.reduce((a, t) => a + (numValor(t.valor_documento) || 0), 0);
  return Math.abs(soma - ref) <= TOLERANCIA_VALOR ? candidatos : [];
}

/** Situação de uma lista de títulos já casados com o card. */
export function situacaoDosTitulos(meus: TituloOmie[]): Situacao {
  if (!meus.length) return "sem_titulo";
  if (meus.every((t) => t.status_titulo === "RECEBIDO")) return "recebido";
  if (meus.some((t) => t.status_titulo === "ATRASADO")) return "atrasado";
  return "aberto";
}

/**
 * Situação no Omie do card e dos cards agrupados nele (boleto único): só é "recebido"
 * se TODAS as notas do grupo foram recebidas; filho sem NF (cobrança de requisição) não conta.
 */
export function situacaoOmie(c: CardFase, titulos: TituloOmie[], filhos: CardFase[] = []): Situacao {
  const comNF = [c, ...filhos].filter((x) => nfsDoCard(x).length);
  if (!comNF.length) return "sem_titulo";
  const sits = comNF.map((x) => situacaoDosTitulos(
    titulosDoCard(x, titulos, c.vencimento_boleto, x === c ? valorProprio(c, filhos) : valorProprio(x))));
  if (sits.some((x) => x === "atrasado")) return "atrasado";
  if (sits.every((x) => x === "recebido")) return "recebido";
  if (sits.some((x) => x === "sem_titulo")) return "sem_titulo";
  return "aberto";
}

/** "AAAA-MM-DD" + n dias (data pura, sem fuso). */
export function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia (em Brasília) de um instante do banco (timestamptz). */
export const diaDoInstante = (ts: string) => hojeBR(new Date(ts));

/** Dias que um card fica em Pago antes de o robô concluí-lo (se o Omie confirmar). */
export const DIAS_PAGO_ATE_CONCLUIR = 7;

/** Vencido há mais que isto (dias, pelo vencimento do card) não é mais recobrado (José, 29/10/2026). */
export const DIAS_SEM_RECOBRANCA = 180;
export const TAREFA_ANTIGO = "Antigo (mais de 6 meses) — sem recobrança";

/** Dias desde o vencimento de referência do card (vencimento_boleto); 0 sem vencimento ou não vencido. */
export function diasDeAtraso(c: CardFase, hoje: string): number {
  const v = String(c.vencimento_boleto || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v >= hoje) return 0;
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(hoje) - d(v)) / 86_400_000);
}

/** O card tem algum boleto anexado? */
export const temBoletoAnexado = (c: CardFase) =>
  [c.anexo_boleto, c.anexo_boleto2, c.anexo_boleto_2, c.anexo_boleto_3, c.anexo_boleto_p1, c.anexo_boleto_p2, c.anexo_boleto_p3, c.anexo_boleto_p4, c.anexo_boleto_p5]
    .some((x) => String(x || "").trim() !== "");

/**
 * Dá para recobrar este card? (puro; usado pelo robô, pelo vigia e pelas telas). Não quando: não
 * houve boleto gerado (tarefa "sem boleto" ou nenhum anexo de boleto), a forma é Pix/cartão/cheque,
 * ou o atraso passa de DIAS_SEM_RECOBRANCA (180) dias.
 */
export function podeRecobrar(card: CardFase, hoje: string): { ok: boolean; motivo?: string } {
  if (/sem boleto/i.test(String(card.tarefa || "")) || !temBoletoAnexado(card)) return { ok: false, motivo: "Sem boleto gerado" };
  if (ehPixCartaoCheque(String(card.forma_pagamento || ""))) return { ok: false, motivo: "Pix/cartão/cheque não vence" };
  const atraso = diasDeAtraso(card, hoje);
  if (atraso > DIAS_SEM_RECOBRANCA) return { ok: false, motivo: `Antigo: vencido há ${atraso} dias (mais de ${DIAS_SEM_RECOBRANCA})` };
  return { ok: true };
}

const ehParceladoCard = (c: CardFase) => (Number(c.qtd_parcelas) || 1) > 1 || ehParcelado(String(c.forma_pagamento || ""));

/** Para onde o card vai (ou null = fica onde está). Puro: sem banco. */
export function decidirFase(c: CardFase, titulos: TituloOmie[], hoje: string, filhos: CardFase[] = []): Movimento | null {
  if (c.grupo_pai_id) return null; // filho de grupo segue o pai

  // Pago há 7+ dias e recebido no Omie → Concluído. Sem a data da fase, não conclui.
  if (c.status === "pago") {
    if (!c.status_changed_at) return null;
    if (diaDoInstante(c.status_changed_at) > somaDias(hoje, -DIAS_PAGO_ATE_CONCLUIR)) return null;
    if (situacaoOmie(c, titulos, filhos) !== "recebido") return null;
    return { id: c.id, de: c.status, para: "concluido", tarefa: "Pagamento concluído", motivo: `Pago há ${DIAS_PAGO_ATE_CONCLUIR}+ dias e recebido no Omie` };
  }

  if (!FASES_OLHADAS.includes(c.status)) return null;
  const forma = String(c.forma_pagamento || "");
  const venceu = !!c.vencimento_boleto && c.vencimento_boleto.slice(0, 10) < hoje;
  const omie = situacaoOmie(c, titulos, filhos);

  if (omie === "recebido")
    return { id: c.id, de: c.status, para: "pago", tarefa: "Pagamento Confirmado", motivo: "Recebido no Omie" };
  // Pix/cartão/cheque não vencem (José, 15/10 e 29/10): se está em Vencido, volta para Aguardando.
  if (c.status === "vencido" && ehPixCartaoCheque(forma))
    return { id: c.id, de: c.status, para: "aguardando_vencimento", tarefa: "Aguardando Cliente", motivo: "Pix/cartão não vence" };
  // Parcelado em Vencido que o Omie não dá mais como atrasado (as vencidas pagas, as outras a vencer):
  // volta a esperar o cliente. NÃO marca parcela nenhuma como paga. "Vencido sem boleto" fica.
  if (c.status === "vencido" && omie === "aberto" && ehParceladoCard(c) && !/sem boleto/i.test(String(c.tarefa || "")))
    return { id: c.id, de: c.status, para: "aguardando_vencimento", tarefa: "Aguardando Cliente", motivo: "Parcelas vencidas pagas no Omie" };
  // Antigo não se recobra: Vencido há mais de 180 dias fica em Vencido, com a tarefa no Financeiro.
  if (c.status === "vencido" && diasDeAtraso(c, hoje) > DIAS_SEM_RECOBRANCA && c.tarefa !== TAREFA_ANTIGO)
    return { id: c.id, de: c.status, para: c.status, tarefa: TAREFA_ANTIGO, setor: "Financeiro", motivo: `Vencido há mais de ${DIAS_SEM_RECOBRANCA} dias — sem recobrança` };
  // Vencido, Enviar ao cliente e Sem boleto só saem daqui quando o Omie confirmar
  if (!FASES_DA_DATA.includes(c.status) || !venceu) return null;
  if (ehPixCartaoCheque(forma)) return null; // PIX/cartão/cheque não vencem (José, 15/10/2026)

  // Gerar boleto vencido fica em Gerar boleto (José, 29/10: sem boleto não há o que recobrar);
  // o vigia das 08:00 destaca "venceu sem boleto gerado" para o Financeiro.
  if (c.status === "gerar_boleto") return null;

  // aguardando_vencimento
  if (omie === "atrasado")
    return { id: c.id, de: c.status, para: "vencido", tarefa: "Cobrar Cliente (Vencido)", motivo: "Atrasado no Omie" };
  if (omie === "aberto") return null; // o Omie ainda não deu o título como atrasado
  if (ehBoleto30(forma))
    return { id: c.id, de: c.status, para: "pago", tarefa: "Pagamento Confirmado", motivo: "Boleto 30 dias venceu (sem título no Omie)" };
  if (ehParcelado(forma) || c.comprovante_pagamento || c.comprovante_pagamento_p1) return null;
  return { id: c.id, de: c.status, para: "vencido", tarefa: "Cobrar Cliente (Vencido)", motivo: "Venceu sem comprovante" };
}

export const COLUNAS_CARD = "id, status, tarefa, setor, forma_pagamento, vencimento_boleto, comprovante_pagamento, comprovante_pagamento_p1, grupo_pai_id, nom_cliente, num_nf_peca, num_nf_servico, omie_empresa, valor_servico, grupo_valor_original, qtd_parcelas, anexo_boleto, anexo_boleto2, anexo_boleto_p1, anexo_boleto_p2, anexo_boleto_p3, anexo_boleto_p4, anexo_boleto_p5";

/** Erro de coluna que não existe (a migration ainda não rodou). */
export const colunaFaltando = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42703" || /column .* does not exist/i.test(String(e.message || "")));

/** Títulos do Omie (contas_receber) das NFs desses cards (o número vem com 8 ou 9 dígitos, com zeros). */
export async function buscarTitulos(sb: SupabaseClient, cards: CardFase[]): Promise<TituloOmie[]> {
  const nums = [...new Set(cards.flatMap(nfsDoCard))];
  const variantes = [...new Set(nums.flatMap((n) => [n, n.padStart(8, "0"), n.padStart(9, "0")]))];
  const titulos: TituloOmie[] = [];
  for (let i = 0; i < variantes.length; i += 150) {
    const { data, error: e } = await sb.from("contas_receber").select(COLUNAS_TITULO)
      .in("numero_documento_fiscal", variantes.slice(i, i + 150));
    if (e) throw new Error(`contas_receber: ${e.message}`);
    titulos.push(...((data || []) as TituloOmie[]));
  }
  return titulos;
}

/** Nome do robô no audit_log (o vigia das 08:00 conta o que ele moveu). */
export const ROBO_FASES_NOME = "Robô (fases do financeiro)";

/** Lê os cards, confere o Omie, move e registra. */
export async function aplicarFasesAutomaticas(sb: SupabaseClient, hoje = hojeBR()): Promise<{ olhados: number; movidos: Movimento[]; erros: string[] }> {
  const { data: cards, error } = await sb.from("Chamado_NF").select(COLUNAS_CARD).in("status", FASES_OLHADAS);
  if (error) throw new Error(`Chamado_NF: ${error.message}`);
  const todos = (cards || []) as CardFase[];
  // Pago há 7+ dias: precisa da coluna status_changed_at (sql/financeiro-status-changed-at.sql).
  // Sem ela (42703) segue sem concluir nada.
  const { data: pagos, error: ePago } = await sb.from("Chamado_NF").select(`${COLUNAS_CARD}, status_changed_at`)
    .eq("status", "pago").not("status_changed_at", "is", null)
    .lte("status_changed_at", `${somaDias(hoje, -DIAS_PAGO_ATE_CONCLUIR)}T23:59:59-03:00`);
  if (ePago && !colunaFaltando(ePago)) throw new Error(`Chamado_NF (pagos): ${ePago.message}`);
  for (const p of (pagos || []) as CardFase[]) if (!todos.some((x) => x.id === p.id)) todos.push(p);
  // filhos dos pais em Pago (podem ter mudado de fase em outra data)
  const paisPagos = ((pagos || []) as CardFase[]).filter((c) => !c.grupo_pai_id).map((c) => c.id);
  for (let i = 0; i < paisPagos.length; i += 200) {
    const { data: fs } = await sb.from("Chamado_NF").select(COLUNAS_CARD).in("grupo_pai_id", paisPagos.slice(i, i + 200));
    for (const f of (fs || []) as CardFase[]) if (!todos.some((x) => x.id === f.id)) todos.push(f);
  }
  const lista = todos.filter((c) => !c.grupo_pai_id);
  const filhosDe = new Map<number, CardFase[]>();
  for (const f of todos) if (f.grupo_pai_id) filhosDe.set(f.grupo_pai_id, [...(filhosDe.get(f.grupo_pai_id) || []), f]);

  const titulos = await buscarTitulos(sb, todos);

  const movidos: Movimento[] = [];
  const erros: string[] = [];
  for (const c of lista) {
    const m = decidirFase(c, titulos, hoje, filhosDe.get(c.id));
    if (!m) continue;
    // .eq('status', de): se alguém mexeu no card nesse meio-tempo, não sobrescreve
    const patch: Record<string, string> = { status: m.para, tarefa: m.tarefa, ...(m.setor ? { setor: m.setor } : {}) };
    const { error: e, count } = await sb.from("Chamado_NF").update(patch, { count: "exact" })
      .eq("id", c.id).eq("status", m.de);
    if (e) { erros.push(`#${c.id}: ${e.message}`); continue; }
    if (!count) continue;
    // filhos agrupados acompanham o pai
    await sb.from("Chamado_NF").update(patch).eq("grupo_pai_id", c.id);
    movidos.push(m);
    await sb.from("audit_log").insert({
      user_id: "00000000-0000-0000-0000-000000000000", user_nome: ROBO_FASES_NOME,
      sistema: "financeiro", acao: "mover_status", entidade: "Chamado_NF", entidade_id: String(c.id),
      entidade_label: `NF #${c.id} - ${c.nom_cliente || ""}`,
      detalhes: { de: m.de, para: m.para, acao_desc: m.motivo, automatico: true },
    });
  }
  return { olhados: lista.length, movidos, erros };
}

export function resumoFases(r: { olhados: number; movidos: Movimento[]; erros: string[] }): string {
  const por: Record<string, number> = {};
  for (const m of r.movidos) por[`${m.de}→${m.para}`] = (por[`${m.de}→${m.para}`] || 0) + 1;
  const partes = Object.entries(por).map(([k, n]) => `${n} ${k}`);
  return `${r.olhados} olhados · ${partes.join(" · ") || "nada movido"}${r.erros.length ? ` · ${r.erros.length} erros` : ""}`;
}
