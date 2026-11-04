// Regras PURAS dos e-mails automáticos de vencimento do Financeiro (29/10/2026):
//  - LEMBRETE antes de vencer (rota /api/financeiro/cron/lembrete-vencimento): antes só pegava o
//    vencimento EXATAMENTE em hoje+5 — se o cron falhasse naquele dia, o lembrete nunca saía. Agora é
//    uma janela "vence nos próximos 0–5 dias e ainda sem lembrete daquele vencimento", e pula o título
//    que o contas_receber do Omie já dá como RECEBIDO;
//  - COBRANÇA depois de vencer (D+1 e D+7), só para título ATRASADO no Omie e só para card cujo
//    boleto foi enviado por e-mail (lib/financeiro/emails-vencimento-server.ts).
// O casamento card × título é o mesmo do robô de fases (lib/financeiro/fases-automaticas.ts).
import {
  situacaoDosTitulos, somaDias, titulosDoCard, valorProprio,
  type CardFase, type Situacao, type TituloOmie,
} from "@/lib/financeiro/fases-automaticas";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CardEmail = CardFase & Record<string, any>;

/** Dias a partir de hoje em que o lembrete pode sair (0 = vence hoje … 5 = daqui a 5 dias). */
export const JANELA_LEMBRETE_DIAS = 5;

/** Datas de vencimento CRUAS (ISO) por parcela: 1ª = vencimento_boleto, demais = datas_parcelas
 *  (registros antigos repetem a 1ª dentro de datas_parcelas — mesma correção dos kanbans). */
export function vencimentosISO(card: CardEmail): { n: number; iso: string }[] {
  const qtd = parseInt(String(card.qtd_parcelas)) || 1;
  const raw = String(card.datas_parcelas || "").split(/[\s,]+/).map((s) => s.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  if (raw.length > 0 && raw[0] === card.vencimento_boleto) raw.shift();
  const datas = [String(card.vencimento_boleto || "").slice(0, 10), ...raw.map((d) => d.slice(0, 10))];
  return Array.from({ length: qtd }, (_, i) => ({ n: i + 1, iso: datas[i] || "" })).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.iso));
}

/** Parcela com comprovante anexado no card. */
export function parcelaPaga(card: CardEmail, n: number): boolean {
  if (n === 1) return !!(card.comprovante_pagamento_p1 || card.comprovante_pagamento);
  return !!card[`comprovante_pagamento_p${n}`];
}

/** Diferença em dias entre duas datas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(b) - d(a)) / 86_400_000);
}

/** Títulos do Omie do card e dos filhos do grupo (boleto único), já casados. */
export function titulosDoGrupo(card: CardEmail, titulos: TituloOmie[], filhos: CardEmail[] = []): TituloOmie[] {
  return [
    ...titulosDoCard(card, titulos, card.vencimento_boleto, valorProprio(card, filhos)),
    ...filhos.flatMap((f) => titulosDoCard(f, titulos, card.vencimento_boleto, valorProprio(f))),
  ];
}

/**
 * Situação no Omie de UMA parcela do card: títulos com o mesmo vencimento; senão pelo número da
 * parcela ("002/003"); à vista, todos os títulos do card. Sem título = "sem_titulo".
 */
export function situacaoDaParcela(card: CardEmail, titulos: TituloOmie[], filhos: CardEmail[], n: number, iso: string): Situacao {
  const meus = titulosDoGrupo(card, titulos, filhos);
  if (!meus.length) return "sem_titulo";
  const porData = meus.filter((t) => String(t.data_vencimento || "").slice(0, 10) === iso);
  if (porData.length) return situacaoDosTitulos(porData);
  const qtd = parseInt(String(card.qtd_parcelas)) || 1;
  if (qtd <= 1) return situacaoDosTitulos(meus);
  const porNum = meus.filter((t) => parseInt(String(t.numero_parcela || "").split("/")[0], 10) === n);
  return porNum.length ? situacaoDosTitulos(porNum) : "sem_titulo";
}

/**
 * Parcelas que pedem LEMBRETE hoje: vencem de hoje a hoje+5, sem comprovante, ainda sem lembrete
 * daquele vencimento e não recebidas no Omie. Ordenadas pela mais próxima.
 */
export function parcelasParaLembrete(
  card: CardEmail, hoje: string, jaLembrados: Set<string>, titulos: TituloOmie[], filhos: CardEmail[] = [],
): { n: number; iso: string; dias: number }[] {
  const ate = somaDias(hoje, JANELA_LEMBRETE_DIAS);
  return vencimentosISO(card)
    .filter((v) => v.iso >= hoje && v.iso <= ate && !parcelaPaga(card, v.n) && !jaLembrados.has(v.iso))
    .filter((v) => situacaoDaParcela(card, titulos, filhos, v.n, v.iso) !== "recebido")
    .map((v) => ({ ...v, dias: diasEntre(hoje, v.iso) }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/** "vence hoje" / "vence amanhã" / "vence em 3 dias". */
export function quandoVence(dias: number): string {
  if (dias <= 0) return "vence <strong>hoje</strong>";
  if (dias === 1) return "vence <strong>amanhã</strong>";
  return `vence em <strong>${dias} dias</strong>`;
}

/**
 * Qual cobrança cabe hoje para um vencimento (D+1 = etapa 1, D+7 = etapa 2), dadas as cobranças já
 * enviadas daquele vencimento (criado_em). Vencido há mais de 13 dias não recebe e-mail automático
 * (evita disparar cobrança velha quando o robô for ligado). null = nada a enviar.
 */
export function etapaCobranca(vencISO: string, hoje: string, enviadasEm: string[]): 1 | 2 | null {
  const dias = diasEntre(vencISO, hoje);
  if (dias >= 1 && dias <= 6) return enviadasEm.length === 0 ? 1 : null;
  if (dias >= 7 && dias <= 13) {
    const d7 = somaDias(vencISO, 7);
    return enviadasEm.some((t) => String(t).slice(0, 10) >= d7) ? null : 2;
  }
  return null;
}

/**
 * Parcela que pede COBRANÇA hoje: vencida, sem comprovante, ATRASADA no Omie e com etapa cabível.
 * Devolve a mais antiga (uma por card por rodada) ou null.
 */
export function parcelaParaCobranca(
  card: CardEmail, hoje: string, enviadasPorVenc: Map<string, string[]>, titulos: TituloOmie[], filhos: CardEmail[] = [],
): { n: number; iso: string; etapa: 1 | 2; dias: number } | null {
  for (const v of vencimentosISO(card).sort((a, b) => a.iso.localeCompare(b.iso))) {
    if (v.iso >= hoje || parcelaPaga(card, v.n)) continue;
    const etapa = etapaCobranca(v.iso, hoje, enviadasPorVenc.get(v.iso) || []);
    if (!etapa) continue;
    if (situacaoDaParcela(card, titulos, filhos, v.n, v.iso) !== "atrasado") continue;
    return { n: v.n, iso: v.iso, etapa, dias: diasEntre(v.iso, hoje) };
  }
  return null;
}

/** Texto da cobrança (HTML). Educado: pode ter sido pago e o Omie ainda não baixou. */
export function htmlCobranca(p: { saudacao: string; cliente: string; etapa: 1 | 2; vencBR: string; valor?: string; parcela?: number; nf?: string }): string {
  const oque = p.parcela ? `a <strong>${p.parcela}ª parcela</strong>` : "o boleto";
  const ref = p.nf ? ` referente à NF ${p.nf}` : "";
  const valor = p.valor ? `<br>Valor: <strong>${p.valor}</strong>` : "";
  const abertura = p.etapa === 1
    ? `<p>Notamos que ${oque}${ref}, com vencimento em <strong>${p.vencBR}</strong>, ainda aparece em aberto em nosso sistema.</p>`
    : `<p>Retomando nosso contato: ${oque}${ref}, com vencimento em <strong>${p.vencBR}</strong>, segue em aberto em nosso sistema.</p>`;
  return `
<p>${p.saudacao}${p.cliente ? `, <strong>${p.cliente}</strong>` : ""}.</p>
${abertura}
<p>Vencimento: <strong>${p.vencBR}</strong>${valor}</p>
<p>Se o pagamento já foi feito, por favor desconsidere esta mensagem — às vezes a baixa leva alguns dias para aparecer — e, se puder, responda com o comprovante para conferirmos.</p>
<p>Se precisar de uma segunda via do boleto ou de outra forma de pagamento, é só responder este e-mail que ajudamos.</p>
<p>Obrigado pela parceria!</p>
<p>Nova Tratores<br>&nbsp;&nbsp;&nbsp;Financeiro / Pós-Vendas</p>`;
}
