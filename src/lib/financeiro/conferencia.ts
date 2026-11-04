// Conferência diária card × Omie (tarefa 'financeiro-conferencia', 05:45, 29/10/2026) — regras PURAS.
// Só gera aviso no sino do Financeiro; não mexe em nada. Olha os títulos do contas_receber dos
// últimos 60 dias (NF-e/NFS-e, não cancelados) e aponta:
//   1. título A RECEBER sem card no Chamado_NF (nenhum card, de nenhuma fase, tem aquela NF);
//   2. NF que existe num card mas não casa (nome do cliente e valor diferentes);
//   (venda de trator/implemento e devolução ficam fora: não viram card no Financeiro)
//   3. card aberto com valor diferente da soma dos títulos (tolerância R$ 1) ou vencimento diferente.
// O casamento card × título é o do robô de fases (titulosDoCard).
import {
  contaDaEmpresa, nfsDoCard, numeroNF, numValor, titulosDoCard, valorProprio, TOLERANCIA_VALOR,
  type CardFase, type TituloOmie,
} from "@/lib/financeiro/fases-automaticas";

export type CardConf = CardFase & { setor_destino?: string | null; datas_parcelas?: string | null };
export type TituloConf = TituloOmie & { descricao_categoria?: string | null };

/** Venda de máquina (trator/implemento) e devolução não viram card no Financeiro: ficam fora. */
const FORA_DO_CHAMADO = /venda de (tratores|implementos|m[aá]quinas)|devolu/i;
export const entraNaConferencia = (t: TituloConf) => !FORA_DO_CHAMADO.test(String(t.descricao_categoria || ""));

export type Achado =
  | { tipo: "sem_card"; conta: string; nf: string; cliente: string; valor: number; vencimento: string | null }
  | { tipo: "nao_casa"; conta: string; nf: string; cliente: string; cardIds: number[]; cardCliente: string }
  | { tipo: "valor"; cardId: number; cliente: string; card: number; omie: number }
  | { tipo: "vencimento"; cardId: number; cliente: string; card: string; omie: string };

/** Fases em que o card ainda está "vivo" (vale conferir valor/vencimento). */
const FASES_FECHADAS = new Set(["pago", "concluido", "excluido"]);

const chaveTitulo = (t: TituloOmie) => `${String(t.conta_omie).toUpperCase()}|${numeroNF(t.numero_documento_fiscal)}|${t.numero_parcela || ""}|${t.data_vencimento || ""}`;
const aReceber = (t: TituloOmie) => t.status_titulo !== "RECEBIDO" && t.status_titulo !== "CANCELADO";
const arred = (n: number) => Math.round(n * 100) / 100;

export function conferir(cards: CardConf[], titulos: TituloConf[]): Achado[] {
  const validos = titulos.filter((t) => t.status_titulo !== "CANCELADO" && entraNaConferencia(t));
  const filhosDe = new Map<number, CardConf[]>();
  for (const c of cards) if (c.grupo_pai_id) filhosDe.set(c.grupo_pai_id, [...(filhosDe.get(c.grupo_pai_id) || []), c]);

  // NF → cards que a citam (qualquer fase), por conta
  const cardsDaNF = new Map<string, CardConf[]>();
  for (const c of cards) for (const nf of nfsDoCard(c)) cardsDaNF.set(nf, [...(cardsDaNF.get(nf) || []), c]);

  const achados: Achado[] = [];
  const cobertos = new Set<string>();
  for (const c of cards) {
    const ref = c.grupo_pai_id ? valorProprio(c) : valorProprio(c, filhosDe.get(c.id) || []);
    for (const t of titulosDoCard(c, validos, c.vencimento_boleto || null, ref)) cobertos.add(chaveTitulo(t));
  }

  // 1 e 2: títulos a receber que nenhum card cobre (agrupados por conta+NF)
  const soltos = new Map<string, TituloConf[]>();
  for (const t of validos) {
    if (!aReceber(t) || cobertos.has(chaveTitulo(t))) continue;
    const k = `${String(t.conta_omie).toUpperCase()}|${numeroNF(t.numero_documento_fiscal)}`;
    soltos.set(k, [...(soltos.get(k) || []), t]);
  }
  for (const [k, ts] of soltos) {
    const [conta, nf] = k.split("|");
    const t0 = ts[0];
    const mesmos = (cardsDaNF.get(nf) || []).filter((c) => { const cc = contaDaEmpresa(c.omie_empresa); return !cc || cc === conta; });
    if (mesmos.length) {
      achados.push({ tipo: "nao_casa", conta, nf, cliente: String(t0.nome_cliente || ""), cardIds: mesmos.map((c) => c.id), cardCliente: String(mesmos[0].nom_cliente || "") });
    } else {
      const venc = ts.map((t) => String(t.data_vencimento || "")).filter(Boolean).sort()[0] || null;
      achados.push({ tipo: "sem_card", conta, nf, cliente: String(t0.nome_cliente || ""), valor: arred(ts.reduce((a, t) => a + (numValor(t.valor_documento) || 0), 0)), vencimento: venc });
    }
  }

  // 3: card aberto × títulos casados
  for (const c of cards) {
    if (c.grupo_pai_id || FASES_FECHADAS.has(c.status)) continue;
    const filhos = filhosDe.get(c.id) || [];
    const meus = [
      ...titulosDoCard(c, validos, c.vencimento_boleto || null, valorProprio(c, filhos)),
      ...filhos.flatMap((f) => titulosDoCard(f, validos, c.vencimento_boleto || null, valorProprio(f))),
    ];
    if (!meus.length) continue;
    const omie = arred(meus.reduce((a, t) => a + (numValor(t.valor_documento) || 0), 0));
    const doCard = numValor(c.valor_servico) || numValor(c.valor);
    if (doCard && Math.abs(doCard - omie) > TOLERANCIA_VALOR)
      achados.push({ tipo: "valor", cardId: c.id, cliente: String(c.nom_cliente || ""), card: arred(doCard), omie });
    // vencimento: 1ª parcela do Omie × vencimento do card (grupo pode juntar NFs de datas diferentes: não confere)
    const primeiro = meus.map((t) => String(t.data_vencimento || "").slice(0, 10)).filter(Boolean).sort()[0];
    const venc = String(c.vencimento_boleto || "").slice(0, 10);
    if (!filhos.length && primeiro && venc && primeiro !== venc)
      achados.push({ tipo: "vencimento", cardId: c.id, cliente: String(c.nom_cliente || ""), card: venc, omie: primeiro });
  }
  return achados;
}

/** Teto de itens por tipo no aviso (o resto vira "e mais N"). */
export const TETO_CONFERENCIA = 8;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const curto = (s: string) => s.trim().slice(0, 26);

/** Texto do aviso: um bloco por tipo, com teto. Vazio se não achou nada. */
export function textoConferencia(achados: Achado[], teto = TETO_CONFERENCIA): string {
  const blocos: string[] = [];
  const bloco = <T extends Achado>(tipo: T["tipo"], titulo: string, fmt: (a: T) => string) => {
    const lista = achados.filter((a) => a.tipo === tipo) as T[];
    if (!lista.length) return;
    const itens = lista.slice(0, teto).map(fmt).join("; ");
    blocos.push(`${titulo} (${lista.length}): ${itens}${lista.length > teto ? `; e mais ${lista.length - teto}` : ""}`);
  };
  bloco<Extract<Achado, { tipo: "sem_card" }>>("sem_card", "A receber no Omie sem card",
    (a) => `${a.conta} NF ${a.nf} ${curto(a.cliente)} ${brl(a.valor)} venc. ${br(a.vencimento)}`);
  bloco<Extract<Achado, { tipo: "nao_casa" }>>("nao_casa", "NF em card com cliente/valor diferente",
    (a) => `${a.conta} NF ${a.nf} Omie "${curto(a.cliente)}" × card #${a.cardIds.join("/#")} "${curto(a.cardCliente)}"`);
  bloco<Extract<Achado, { tipo: "valor" }>>("valor", "Valor do card ≠ Omie",
    (a) => `#${a.cardId} ${curto(a.cliente)} card ${brl(a.card)} × Omie ${brl(a.omie)}`);
  bloco<Extract<Achado, { tipo: "vencimento" }>>("vencimento", "Vencimento do card ≠ Omie",
    (a) => `#${a.cardId} ${curto(a.cliente)} card ${br(a.card)} × Omie ${br(a.omie)}`);
  return blocos.join("\n");
}
