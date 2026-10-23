// OS do portal no FORMATO da OS do Omie (José, 13/10/2026). O que o Omie tem e o
// portal não tinha fica em Ordem_Servico.Omie_Espelho (jsonb): departamentos,
// informações adicionais, parcelas, e-mail e serviços incluídos à mão.
// Hora/KM "não cobrar" NÃO mora aqui: vira Desconto_Hora/Desconto_KM = valor cheio
// (já vão ao Omie como desconto da linha e já entram no Valor_Total).
// Regras puras (client e server).

export const CONTA_INTERNO = 2041409931;
/** OS interna: nada vai para o cliente — o recibo vai para o pós-vendas (como nas internas feitas no Omie) */
export const EMAIL_INTERNO = "posvendas.novatratores@gmail.com";
export const CONTA_PADRAO = 1969919780; // Banco do Brasil
export const DEPTO_SERVICOS_TRATORES = "2061368211";
export const DEPTO_GARANTIAS = "2061368571";

// Parcelas IGUAL ao PPV: condição → dias; vencimento = Previsão de Faturamento + dias
export const COND_PARCELAS: Record<string, number[]> = {
  "30 dias": [30],
  "30/60 dias": [30, 60],
  "30/60/90 dias": [30, 60, 90],
  "À vista (PIX ou Cartão)": [0],
};

// Códigos internos do "Nº do Contrato de Venda" (planilha do José, 13/10/2026)
export const CODIGOS_INTERNOS: { codigo: string; quando: string }[] = [
  { codigo: "Interno", quando: "Máquina ainda é da loja e precisou de serviço" },
  { codigo: "Entrega Tecnica", quando: "Entrega técnica" },
  { codigo: "Revisao Pre Entrega", quando: "Revisão pré-entrega" },
  { codigo: "Cortesia Oficina", quando: "A oficina presenteia o cliente e assume o valor" },
  { codigo: "Cortesia Comercial", quando: "O comercial (Fernando) presenteia o cliente e assume o valor" },
  { codigo: "GarantiaNT", quando: "A fábrica não cobriu e a NT assumiu a garantia" },
  { codigo: "Mahindra-pgo", quando: "Mahindra paga a garantia / PDI" },
  { codigo: "Kuhn-pgo", quando: "Kuhn paga a garantia" },
  { codigo: "Ventura-pgo", quando: "Ventura paga a garantia" },
  { codigo: "Montagem Implementos", quando: "Montagem de implemento" },
  { codigo: "Montagem Grade", quando: "Montagem de grade" },
  { codigo: "Montagem Carreta", quando: "Carreta montada para o cliente" },
  { codigo: "Montagem Quadriciclo", quando: "Montagem / entrega técnica do quadriciclo Suzuki" },
  { codigo: "Montagem Desligament", quando: "Automação de desligamento de seções (plantadeiras)" },
  { codigo: "Montagem Piloto", quando: "Montagem de piloto" },
  { codigo: "Montagem Monitor", quando: "Montagem de monitor" },
  { codigo: "Demonstracao", quando: "Demonstração" },
  { codigo: "Frota", quando: "Veículo da própria empresa" },
];

export interface ParcelaEspelho { n: number; dias: number; venc: string; valor: number }
export interface ServicoExtra { id: string; codigo: string; nome: string; descricao: string; qtde: number; unit: number; cobrar: boolean }

export interface OmieEspelho {
  info: { categoria: string; conta: number; contrato: string; contato: string; cidade: string; dadosNF: string; competencia: string; obra: string; cei: string;
    /** contatos do NovaZap escolhidos (o texto "contato" que vai pro Omie é montado deles); ausente = usa os vinculados ao CNPJ */
    contatos?: ContatoOS[] };
  deptos: Record<string, number>;
  /** condição de pagamento do Omie (código, ex.: "A30", "999") — antigas guardavam "30 dias" */
  condicao: string;
  condicaoNome?: string;
  /** só na "999 = Informar o número de parcelas" */
  condicaoQtd?: number;
  /** vazio = calculadas pela condição + previsão; preenchido = editadas à mão */
  parcelas: ParcelaEspelho[];
  email: { para: string; recibo: boolean; link: boolean };
  extras: ServicoExtra[];
  /** hora/km marcados "não cobrar" → o drawer mantém Desconto_Hora/Desconto_KM = valor cheio */
  naoCobrar: { hr: boolean; km: boolean };
  /** Observações no PDF da OS (José, 23/10/2026): sai só se marcado; grifar = fundo amarelo no texto todo */
  obsPdf?: { mostrar: boolean; grifar: boolean };
}

export function espelhoPadrao(opts: { interna?: boolean; garantia?: boolean; email?: string } = {}): OmieEspelho {
  return {
    info: { categoria: "1.01.02", conta: opts.interna ? CONTA_INTERNO : CONTA_PADRAO, contrato: opts.interna ? "Interno" : "", contato: "", cidade: "PIRAJU (SP)", dadosNF: "", competencia: "", obra: "", cei: "" },
    deptos: { [opts.garantia ? DEPTO_GARANTIAS : DEPTO_SERVICOS_TRATORES]: 100 },
    condicao: "A30",
    condicaoNome: "Para 30 dias (C)",
    parcelas: [],
    email: { para: opts.interna ? EMAIL_INTERNO : (opts.email || ""), recibo: !!opts.interna, link: false },
    extras: [],
    naoCobrar: { hr: false, km: false },
  };
}

/** junta o que veio do banco com o padrão (campos novos não quebram OS antigas) */
export function normalizarEspelho(v: unknown, padrao: OmieEspelho): OmieEspelho {
  const o = (v && typeof v === "object" ? v : {}) as Partial<OmieEspelho>;
  return {
    info: { ...padrao.info, ...(o.info || {}) },
    deptos: o.deptos && Object.keys(o.deptos).length ? o.deptos : padrao.deptos,
    condicao: o.condicao || padrao.condicao,
    condicaoNome: o.condicao ? o.condicaoNome : padrao.condicaoNome,
    condicaoQtd: o.condicaoQtd,
    parcelas: Array.isArray(o.parcelas) ? o.parcelas : [],
    email: { ...padrao.email, ...(o.email || {}) },
    extras: Array.isArray(o.extras) ? o.extras : [],
    naoCobrar: { hr: !!o.naoCobrar?.hr, km: !!o.naoCobrar?.km },
    obsPdf: { mostrar: !!o.obsPdf?.mostrar, grifar: !!o.obsPdf?.grifar },
  };
}

/** marcar/desmarcar OS interna: conta INTERNO + recibo + código interno (como o Omie faz) */
export function aplicarInterna(e: OmieEspelho, interna: boolean): OmieEspelho {
  return {
    ...e,
    info: { ...e.info, conta: interna ? CONTA_INTERNO : (e.info.conta === CONTA_INTERNO ? CONTA_PADRAO : e.info.conta), contrato: interna ? (e.info.contrato || "Interno") : "" },
    email: { ...e.email, recibo: interna, para: interna ? EMAIL_INTERNO : (e.email.para === EMAIL_INTERNO ? "" : e.email.para) },
  };
}

function somaDias(iso: string, d: number): string {
  const base = iso ? new Date(iso + "T12:00:00") : new Date(Date.now() - 3 * 3600_000);
  base.setDate(base.getDate() + d);
  return base.toISOString().slice(0, 10);
}

/** parcelas calculadas (mesma regra do PPV: última absorve o resto) */
/** dias de cada parcela a partir do NOME da condição do Omie:
 *  "A Vista" → [0] · "Para 30 dias" → [30] · "1/30/60" → [1,30,60] · "3 Parcelas" → [30,60,90] · 999 → qtd informada */
export function diasDaCondicao(codigo: string, nome: string, qtd?: number): number[] {
  const c = String(codigo || "").trim(), t = String(nome || "").trim();
  if (COND_PARCELAS[c]) return COND_PARCELAS[c]; // condição antiga do portal ("30 dias"…)
  if (c === "000" || /vista/i.test(t)) return [0];
  const serie = (n: number) => Array.from({ length: Math.max(1, Math.min(60, n)) }, (_, i) => 30 * (i + 1));
  if (c === "999") return serie(qtd || 1);
  const para = t.match(/para\s+(\d+)\s+dia/i);
  if (para) return [Number(para[1])];
  if (/^\d+(\s*\/\s*\d+)+$/.test(t)) return t.split("/").map((x) => Number(x.trim()));
  const parc = t.match(/(\d+)\s+parcela/i);
  if (parc) return serie(Number(parc[1]));
  return [30];
}
export function diasDoEspelho(e: OmieEspelho): number[] {
  return diasDaCondicao(e.condicao, e.condicaoNome || "", e.condicaoQtd);
}

/** parcelas calculadas pelos dias (mesma regra do PPV: última absorve o resto) */
export function calcularParcelas(dias: number[], previsaoISO: string, total: number): ParcelaEspelho[] {
  const ds = dias.length ? dias : [30];
  const v = Math.floor((total / ds.length) * 100) / 100;
  return ds.map((dias, k) => ({ n: k + 1, dias, venc: somaDias(previsaoISO, dias), valor: k === ds.length - 1 ? Math.round((total - v * (ds.length - 1)) * 100) / 100 : v }));
}

export function totalExtras(e: OmieEspelho): number {
  return e.extras.reduce((t, x) => t + (x.cobrar ? x.qtde * x.unit : 0), 0);
}

// Serviço de REVISÃO que o envio ao Omie põe na OS (mesma regra de buscarServicoRevisao
// em lib/pos/omie.ts): horas do "Revisão de N horas", modelo achado na revisão/projeto,
// sem modelo = "2025". Devolve o código do cadastro (ex.: "rev5050.600").
const MODELOS_REVISAO = ["86-110", "9500", "9200", "8000", "6075", "6065", "6060", "5050"];
export function codigoRevisao(revisao: string, projeto: string): string | null {
  const horas = String(revisao || "").match(/(\d+)\s*horas/i)?.[1];
  if (!horas) return null;
  const texto = `${revisao} ${projeto}`.toLowerCase();
  const modelo = MODELOS_REVISAO.find((m) => texto.includes(m.toLowerCase())) || "2025";
  return `rev${modelo.replace("-", "")}.${horas}`;
}

/** "Dados Adicionais para a Nota Fiscal" que o portal monta quando ninguém escreveu à mão */
export function dadosAdicionaisAuto(o: { ppv?: unknown; projeto?: unknown; idReq?: unknown; oficina?: unknown }): string {
  const partes: string[] = [];
  if (o.ppv) partes.push(`PPV: ${o.ppv}`);
  if (o.projeto) partes.push(`Chassis/Projeto: ${o.projeto}`);
  if (o.idReq) partes.push(`Req: ${o.idReq}`);
  if (o.oficina) partes.push("Serviço realizado na oficina Nova Tratores (Piraju-SP)");
  return partes.join(" | ").substring(0, 500);
}

export interface ContatoOS { id: number; nome: string; cargo?: string | null; telefone?: string | null; thumbnail?: string | null }
/** texto do campo Contato do Omie a partir dos contatos escolhidos */
export function textoContatos(l: ContatoOS[]): string {
  return l.map((c) => [c.nome, c.telefone].filter(Boolean).join(" - ")).join("; ").slice(0, 120);
}
