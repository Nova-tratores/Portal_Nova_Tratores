// PREVISÃO DA PRÓXIMA REVISÃO de cada trator Mahindra (José, 23/10/2026: "fazer uma média de tempo
// que ele usava o trator, entre o tempo que o trator saiu da loja e o horímetro do trator que foram
// fazendo a revisão; com isso você consegue calcular uma média de quando seria a próxima revisão").
// PURO (sem banco): testado em __tests__/previsao-revisao.test.ts. Quem lê o banco é
// previsao-revisao-server.ts; a aba "Revisões" da página de teste do CRM/RFM só desenha.
//
// COMO A MÉDIA É CALCULADA
//  - Cada leitura do horímetro vira um ponto (dias desde a entrega, horas). A entrega é o ponto
//    fixo (dia 0, 0 h). Fontes: revisões anotadas na tabela `tratores` (data + horímetro), cheques
//    de revisão online (`revisao_cheques`: horímetro de verdade), texto das OS do Omie
//    ("Horimetro: 3077,7") e, como APROXIMAÇÃO, o envio do cheque à Mahindra (`revisao_emails`:
//    as horas da revisão na data do envio) e a revisão anotada só com a data (sem horímetro).
//  - Leituras incoerentes saem da conta, com o motivo: data no futuro ou antes da entrega,
//    horímetro que não bate com a revisão (ex.: "300 h" anotada com 3.000 h), uso impossível
//    (> 20 h por dia) e horímetro que volta. Para o "volta" fica a MAIOR sequência coerente de
//    leituras (o ponto fora da curva sai, não todos os que vieram depois dele).
//  - Média h/dia = reta que sai do zero na entrega e passa o mais perto possível de todas as
//    leituras (regressão pela origem: Σ dias×horas ÷ Σ dias²). Com uma leitura só é exatamente
//    horas ÷ dias. Leitura de verdade pesa 1; aproximação (envio do cheque, revisão sem horímetro)
//    pesa 0,35.
//  - Horímetro hoje = última leitura + média × dias desde ela. Sem nenhuma leitura: média padrão
//    (MEDIA_PADRAO_H_DIA) × dias desde a entrega, marcado como "estimada sem leitura".
//
// PRÓXIMA REVISÃO: sequência 50, 300, 600, 900, 1200… de 300 em 300 (a mesma do Tratorilson e do
// controle de revisões). Devida = a seguinte à MAIOR revisão já feita (tabela, cheque ou envio).
// Se o horímetro estimado já passou da devida E da seguinte, o cliente provavelmente parou de fazer
// revisão na loja: oferece a revisão que vem pela frente pelo horímetro de hoje.
import type { Acao } from "./fila";
import type { Tentativa } from "./types";

const DIA = 86_400_000;

/** Média de uso quando o trator não tem nenhuma leitura (h/dia). Mediana das médias reais medida
 *  em 23/10/2026 sobre a tabela `tratores` (ver o relatório do agente). */
export const MEDIA_PADRAO_H_DIA = 1.2;
export const USO_MAXIMO_H_DIA = 20;
export const PASSO_REVISAO = 300;
/** Atrasada há mais que isto (ou pulou uma revisão inteira) = "pode ter parado de fazer na loja". */
export const DIAS_ATRASO_PAROU = 180;
/** Vence em até isto = entra na fila de agora. */
export const DIAS_JANELA = 30;
const PESO_APROX = 0.35;

// ─── leitura dos campos ──────────────────────────────────────────────────────

/** "28/02/2019", "2019-02-28", "2026-10-02T16:50:24+00:00" → "2019-02-28" (data local). */
export function dataISO(s: unknown): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return validar(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
  if (m && !m[4]) return validar(+m[1], +m[2], +m[3]);
  if (m) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : null;
  }
  return null;
}
function validar(a: number, mes: number, d: number): string | null {
  if (a < 1990 || a > 2100 || mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${a}-${p(mes)}-${p(d)}`;
}
const tsDia = (iso: string) => Date.parse(`${iso}T12:00:00`);
const diasEntre = (de: string, ate: string) => Math.round((tsDia(ate) - tsDia(de)) / DIA);
const somaDias = (iso: string, n: number) => new Date(tsDia(iso) + Math.round(n) * DIA).toISOString().slice(0, 10);

/** "304,3" · "59.8" · "1.234" · "1.234,5" · "9999H" · "609 h" → número; texto sem número → null. */
export function numeroHorimetro(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v ?? "").trim().replace(/\s*(h|hs|hrs|horas)\.?$/i, "").trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let n: string;
  if (s.includes(",") && s.includes(".")) n = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) n = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  else n = s;
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : null;
}

/** Horímetro escrito no texto da OS: "HORIMETRO 175H", "Horimetro: 3077,7", "HOR: 1234". */
export function horimetroDoTexto(txt: unknown): number | null {
  const m = String(txt ?? "").match(/\b(?:hor[ií]metro|hor)\b\s*[:.\-]?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*h?/i);
  return m ? numeroHorimetro(m[1]) : null;
}

/** Chassi escrito no texto da OS: "CHASSI MBNY…", "Chassis: MDI0…". */
export function chassiDoTexto(txt: unknown): string | null {
  const m = String(txt ?? "").match(/\bchassis?\b\s*[:.\-]?\s*([A-Z0-9]{6,25})/i);
  return m ? m[1].toUpperCase() : null;
}

export const finalChassi = (c: unknown, n = 7) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-n);

/** Nome para casar cliente entre tabelas: sem acento, maiúsculo, sem o que vem entre parênteses. */
export function normNome(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\b(LTDA|ME|EPP|EIRELI|S A|SA)\b/g, " ").replace(/\s+/g, " ").trim();
}

// ─── sequência de revisões ───────────────────────────────────────────────────

/** 50, 300, 600, 900… */
export function revisaoDaSequencia(i: number): number {
  return i <= 0 ? 50 : i * PASSO_REVISAO;
}
/** Menor revisão da sequência estritamente maior que `h`. */
export function revisaoSeguinte(h: number): number {
  if (h < 50) return 50;
  return (Math.floor(h / PASSO_REVISAO) + 1) * PASSO_REVISAO;
}
/** Menor revisão da sequência ≥ `h`. */
export function revisaoAPartirDe(h: number): number {
  if (h <= 50) return 50;
  return Math.ceil(h / PASSO_REVISAO) * PASSO_REVISAO;
}
/** "300h" / "1200 h" / "Revisão 600" → 300 / 1200 / 600. */
export function horasDoRotulo(s: unknown): number | null {
  const m = String(s ?? "").match(/(\d{2,4})/);
  return m ? Number(m[1]) : null;
}

// ─── pontos ──────────────────────────────────────────────────────────────────

export type FontePonto = "revisao" | "cheque" | "os" | "envio" | "revisao_sem_horimetro";
export const ROTULO_FONTE: Record<FontePonto, string> = {
  revisao: "Revisão anotada", cheque: "Cheque de revisão", os: "OS do Omie", envio: "Envio do cheque à Mahindra (aprox.)", revisao_sem_horimetro: "Revisão sem horímetro (aprox.)",
};
const PRIORIDADE: Record<FontePonto, number> = { cheque: 5, revisao: 4, os: 3, envio: 2, revisao_sem_horimetro: 1 };

export interface PontoHorimetro {
  data: string; // ISO YYYY-MM-DD
  horas: number;
  fonte: FontePonto;
  /** "Revisão 300 h", "OS 5339"… */
  rotulo: string;
  /** revisão a que o ponto se refere (300, 600…), se for de revisão */
  revisao?: number | null;
  /** horas aproximadas (não é leitura do horímetro) */
  aprox?: boolean;
}
export interface PontoDescartado extends PontoHorimetro { motivo: string }

/** Linha da tabela `tratores` (colunas com espaço: "300h Data", "300h Horimetro"…). */
export interface TratorBruto {
  ID?: string | number | null;
  Modelo?: string | null;
  Chassis?: string | null;
  Cliente?: string | null;
  Cidade?: string | null;
  Vendedor?: string | null;
  Entrega?: string | null;
  [k: string]: unknown;
}

/** Revisões anotadas na tabela: data + horímetro (ou só a data, como aproximação). */
export function pontosDaTabela(t: TratorBruto): { pontos: PontoHorimetro[]; feitas: number[] } {
  const pontos: PontoHorimetro[] = [];
  const feitas: number[] = [];
  for (const k of Object.keys(t)) {
    const m = k.match(/^(\d{2,4})h Data$/);
    if (!m) continue;
    const rev = Number(m[1]);
    const data = dataISO(t[k]);
    const bruto = t[`${rev}h Horimetro`];
    const h = numeroHorimetro(bruto);
    if (!data && h == null) continue;
    feitas.push(rev);
    if (data && h != null) pontos.push({ data, horas: h, fonte: "revisao", rotulo: `Revisão ${rev} h`, revisao: rev });
    else if (data) pontos.push({ data, horas: rev, fonte: "revisao_sem_horimetro", rotulo: `Revisão ${rev} h (sem horímetro anotado)`, revisao: rev, aprox: true });
  }
  return { pontos, feitas: [...new Set(feitas)].sort((a, b) => a - b) };
}

/** Horímetro coerente com a revisão a que se refere? (feita entre 40% e 2× + 150 h). */
function bateComRevisao(p: PontoHorimetro): boolean {
  if (!p.revisao || p.aprox) return true;
  const r = p.revisao;
  return p.horas >= (r <= 50 ? 0 : r * 0.4) && p.horas <= r * 2 + 150;
}

/**
 * Data de "zero hora" do trator. A `Entrega` da tabela muitas vezes é anotada DEPOIS da entrega de
 * verdade (em 23/10/2026, 149 leituras eram de antes dela — mediana 77 dias). Se a 1ª leitura real
 * (até 400 h) é de antes da entrega ou daria uso impossível, a entrega volta para
 * data da leitura − horas ÷ MEDIA_PADRAO_H_DIA (no máximo 400 dias antes). Senão, fica a anotada.
 */
export function entregaEfetiva(entrega: string | null, pontos: PontoHorimetro[], hoje: string): { data: string | null; ajustada: boolean } {
  if (!entrega) return { data: null, ajustada: false };
  const reais = pontos.filter((p) => !p.aprox && p.data && p.data <= hoje && Number.isFinite(p.horas) && p.horas > 0 && p.horas <= 400 && bateComRevisao(p))
    .sort((a, b) => a.data.localeCompare(b.data));
  const p = reais[0];
  if (!p) return { data: entrega, ajustada: false };
  const d = diasEntre(entrega, p.data);
  if (d > 0 && p.horas / d <= USO_MAXIMO_H_DIA) return { data: entrega, ajustada: false };
  const nova = somaDias(p.data, -Math.max(1, Math.round(p.horas / MEDIA_PADRAO_H_DIA)));
  if (diasEntre(nova, entrega) > 400) return { data: entrega, ajustada: false };
  return { data: nova < entrega ? nova : entrega, ajustada: nova < entrega };
}

/**
 * Tira as leituras incoerentes e as repetidas. Devolve as válidas em ordem de data.
 * 1) Leituras de verdade (tabela, cheque, OS): "volta do horímetro" → fica a MAIOR sequência que só
 *    sobe e com ritmo possível (≤ 20 h/dia entre uma e outra); empate = fontes mais confiáveis.
 * 2) Aproximações (envio do cheque, revisão sem horímetro): se já há leitura de verdade da mesma
 *    revisão, saem como repetidas (a revisão conta como feita); senão só entram se couberem entre as
 *    leituras de verdade vizinhas (±10% + 30 h).
 */
export function limparPontos(entrega: string | null, pontos: PontoHorimetro[], hoje: string): { validos: PontoHorimetro[]; descartados: PontoDescartado[] } {
  const descartados: PontoDescartado[] = [];
  const fora = (p: PontoHorimetro, motivo: string) => descartados.push({ ...p, motivo });
  const cand: PontoHorimetro[] = [];
  for (const p of pontos) {
    if (!p.data || !Number.isFinite(p.horas) || p.horas < 0) { fora(p, "leitura sem data ou sem número"); continue; }
    if (p.data > hoje) { fora(p, "data no futuro"); continue; }
    if (entrega && p.data < entrega) { fora(p, "data antes da entrega"); continue; }
    if (!bateComRevisao(p)) { fora(p, `horímetro (${fmtH(p.horas)}) não bate com a revisão de ${p.revisao} h`); continue; }
    if (entrega) {
      const d = Math.max(1, diasEntre(entrega, p.data));
      if (p.horas / d > USO_MAXIMO_H_DIA) { fora(p, `uso impossível desde a entrega (${(p.horas / d).toFixed(1)} h por dia)`); continue; }
    }
    cand.push(p);
  }
  const ordem = (a: PontoHorimetro, b: PontoHorimetro) => a.data.localeCompare(b.data) || a.horas - b.horas || PRIORIDADE[b.fonte] - PRIORIDADE[a.fonte];

  // 1) leituras de verdade: repetidas (mesma leitura de duas fontes) → fica a mais confiável
  const unicos: PontoHorimetro[] = [];
  for (const p of cand.filter((x) => !x.aprox).sort(ordem)) {
    const igual = unicos.find((u) => Math.abs(diasEntre(u.data, p.data)) <= 3 && Math.abs(u.horas - p.horas) <= Math.max(5, u.horas * 0.03));
    if (!igual) { unicos.push(p); continue; }
    if (PRIORIDADE[p.fonte] > PRIORIDADE[igual.fonte]) { unicos[unicos.indexOf(igual)] = p; fora(igual, `repetida (a mesma leitura veio de: ${ROTULO_FONTE[p.fonte].toLowerCase()})`); }
    else fora(p, `repetida (a mesma leitura veio de: ${ROTULO_FONTE[igual.fonte].toLowerCase()})`);
  }
  const reais = unicos.sort(ordem);
  const n = reais.length;
  const ok = (a: PontoHorimetro, b: PontoHorimetro) => {
    if (b.horas < a.horas - 2) return false;
    const d = Math.max(1, diasEntre(a.data, b.data));
    return (b.horas - a.horas) / d <= USO_MAXIMO_H_DIA;
  };
  const tam = new Array<number>(n).fill(1);
  const peso = reais.map((p) => PRIORIDADE[p.fonte]);
  const ant = new Array<number>(n).fill(-1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < j; i++) {
      if (!ok(reais[i], reais[j])) continue;
      const t = tam[i] + 1, w = peso[i] + PRIORIDADE[reais[j].fonte];
      if (t > tam[j] || (t === tam[j] && w > peso[j])) { tam[j] = t; peso[j] = w; ant[j] = i; }
    }
  }
  let fim = -1;
  for (let j = 0; j < n; j++) if (fim < 0 || tam[j] > tam[fim] || (tam[j] === tam[fim] && peso[j] > peso[fim])) fim = j;
  const fica = new Set<number>();
  for (let j = fim; j >= 0; j = ant[j]) fica.add(j);
  const validos: PontoHorimetro[] = [];
  reais.forEach((p, i) => {
    if (fica.has(i)) { validos.push(p); return; }
    const antes = [...fica].filter((k) => k < i).sort((a, b) => b - a)[0];
    const ref = antes != null ? reais[antes] : null;
    fora(p, ref && p.horas < ref.horas ? `horímetro voltou (${fmtH(ref.horas)} em ${fmtDataBR(ref.data)} e depois ${fmtH(p.horas)})` : "fora da curva das outras leituras (salto impossível)");
  });

  // 2) aproximações
  const aceitas: PontoHorimetro[] = [];
  for (const p of cand.filter((x) => x.aprox).sort(ordem)) {
    const mesma = validos.find((v) => v.revisao != null && v.revisao === p.revisao) || aceitas.find((v) => v.revisao === p.revisao);
    if (mesma) { fora(p, `repetida (a revisão de ${p.revisao} h já tem leitura: ${mesma.rotulo.toLowerCase()})`); continue; }
    const antes = [...validos].reverse().find((v) => v.data <= p.data);
    const depois = validos.find((v) => v.data > p.data);
    const cabe = (!antes || p.horas >= antes.horas * 0.9 - 30) && (!depois || p.horas <= depois.horas * 1.1 + 30);
    if (!cabe) { fora(p, `não bate com as leituras de verdade (${antes ? `${fmtH(antes.horas)} em ${fmtDataBR(antes.data)}` : ""}${antes && depois ? " e " : ""}${depois ? `${fmtH(depois.horas)} em ${fmtDataBR(depois.data)}` : ""})`); continue; }
    aceitas.push(p);
  }
  return { validos: [...validos, ...aceitas].sort(ordem), descartados };
}

/** Média h/dia pela reta que sai do zero na entrega (regressão pela origem, aproximação pesa menos). */
export function mediaUso(entrega: string, validos: PontoHorimetro[]): number | null {
  let num = 0, den = 0;
  for (const p of validos) {
    const t = diasEntre(entrega, p.data);
    if (t <= 0) continue;
    const w = p.aprox ? PESO_APROX : 1;
    num += w * t * p.horas;
    den += w * t * t;
  }
  if (den <= 0) return null;
  return Math.min(USO_MAXIMO_H_DIA, Math.max(0.02, num / den));
}

// ─── previsão ────────────────────────────────────────────────────────────────

export type Situacao = "atrasada" | "vence_30" | "proxima" | "parou" | "sem_entrega";
export type Confianca = "alta" | "media" | "baixa" | "sem_leitura";
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  atrasada: "Atrasada", vence_30: "Vence em até 30 dias", proxima: "Próximas", parou: "Pode ter parado de fazer na loja", sem_entrega: "Sem data de entrega",
};
export const ROTULO_CONFIANCA: Record<Confianca, string> = {
  alta: "Boa (3 ou mais leituras recentes)", media: "Média (2 leituras ou leitura antiga)", baixa: "Baixa (1 leitura só)", sem_leitura: "Estimada sem leitura (média padrão)",
};

export interface Previsao {
  /** entrega usada na conta (a anotada, ou a corrigida — ver entregaEfetiva) */
  entrega: string | null;
  /** entrega como está na tabela */
  entregaAnotada: string | null;
  entregaAjustada: boolean;
  validos: PontoHorimetro[];
  descartados: PontoDescartado[];
  /** h/dia usada na conta */
  mediaHDia: number;
  /** true = sem leitura nenhuma, usou MEDIA_PADRAO_H_DIA */
  mediaPadrao: boolean;
  /** ritmo entre as duas últimas leituras (ou entrega → última), só para mostrar */
  ritmoRecente: number | null;
  ultimaLeitura: PontoHorimetro | null;
  horimetroHoje: number;
  /** maior revisão já feita (tabela, cheque ou envio) — null = nenhuma */
  ultimaRevisaoFeita: number | null;
  /** a seguinte na sequência depois da última feita */
  proximaDevida: number;
  /** a que oferecer agora (= devida; ou a que vem pela frente, se parou) */
  revisaoOferta: number;
  dataPrevista: string | null;
  /** dias até a data prevista (negativo = atrasada) */
  dias: number | null;
  situacao: Situacao;
  confianca: Confianca;
  /** frase curta do porquê da situação */
  explicacao: string;
}

export function preverRevisao(entrada: { entrega: unknown; pontos: PontoHorimetro[]; revisoesFeitas: number[] }, agora: number = Date.now()): Previsao {
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const entregaAnotada = dataISO(entrada.entrega);
  const ef = entregaEfetiva(entregaAnotada, entrada.pontos, hoje);
  const entrega = ef.data;
  const { validos, descartados } = limparPontos(entrega, entrada.pontos, hoje);
  // revisão feita = anotada na tabela / cheque com data (revisoesFeitas) + envio do cheque que bateu
  // com as leituras (válido ou repetido de uma leitura de verdade da mesma revisão)
  const envios = [...validos, ...descartados.filter((d) => d.motivo.startsWith("repetida"))].filter((p) => p.fonte === "envio" && p.revisao).map((p) => p.revisao as number);
  const feitas = [...entrada.revisoesFeitas, ...envios].filter((r) => r > 0);
  const ultimaRevisaoFeita = feitas.length ? Math.max(...feitas) : null;
  const proximaDevida = ultimaRevisaoFeita == null ? 50 : revisaoSeguinte(ultimaRevisaoFeita);
  const reais = validos.filter((p) => !p.aprox);
  const ultimaLeitura = validos.length ? validos[validos.length - 1] : null;

  if (!entrega) {
    return {
      entrega: null, entregaAnotada, entregaAjustada: false, validos, descartados, mediaHDia: MEDIA_PADRAO_H_DIA, mediaPadrao: true, ritmoRecente: null, ultimaLeitura,
      horimetroHoje: ultimaLeitura?.horas ?? 0, ultimaRevisaoFeita, proximaDevida, revisaoOferta: proximaDevida, dataPrevista: null, dias: null,
      situacao: "sem_entrega", confianca: "sem_leitura", explicacao: "sem data de entrega no controle de revisões: não dá para calcular a média",
    };
  }

  const media = mediaUso(entrega, validos);
  const mediaPadrao = media == null;
  const m = media ?? MEDIA_PADRAO_H_DIA;
  const base = ultimaLeitura ?? { data: entrega, horas: 0 };
  const horimetroHoje = Math.round((base.horas + m * Math.max(0, diasEntre(base.data, hoje))) * 10) / 10;

  let ritmoRecente: number | null = null;
  if (validos.length >= 2) {
    const a = validos[validos.length - 2], b = validos[validos.length - 1];
    const d = diasEntre(a.data, b.data);
    if (d > 0) ritmoRecente = Math.round(((b.horas - a.horas) / d) * 100) / 100;
  } else if (ultimaLeitura) {
    const d = diasEntre(entrega, ultimaLeitura.data);
    if (d > 0) ritmoRecente = Math.round((ultimaLeitura.horas / d) * 100) / 100;
  }

  // pulou uma revisão inteira pelo horímetro de hoje → oferece a que vem pela frente
  // (a de 50 h perdida: com 200 h ou mais já não faz sentido oferecer a de 50)
  const pulou = horimetroHoje >= proximaDevida + PASSO_REVISAO || (proximaDevida === 50 && horimetroHoje >= 200);
  const revisaoOferta = pulou ? revisaoAPartirDe(horimetroHoje - 50) : proximaDevida;
  const dataPrevista = somaDias(base.data, (revisaoOferta - base.horas) / m);
  const dias = diasEntre(hoje, dataPrevista);

  const diasUltima = ultimaLeitura ? diasEntre(ultimaLeitura.data, hoje) : null;
  const confianca: Confianca = mediaPadrao ? "sem_leitura"
    : reais.length >= 3 && (diasUltima ?? 9999) <= 400 ? "alta"
    : reais.length >= 2 || (reais.length === 1 && validos.length >= 2) ? "media" : "baixa";

  let situacao: Situacao;
  let explicacao: string;
  const marco = ultimaRevisaoFeita == null ? "nunca fez revisão na loja" : `última revisão feita: ${ultimaRevisaoFeita} h`;
  if (pulou || dias < -DIAS_ATRASO_PAROU) {
    situacao = "parou";
    explicacao = `${marco}; pelo horímetro estimado (${fmtH(horimetroHoje)}) já devia ter feito a de ${proximaDevida} h${pulou ? (proximaDevida === 50 ? "" : " e a seguinte") : ` há ${-dias} dias`}`;
  } else if (dias < 0) {
    situacao = "atrasada";
    explicacao = `a de ${revisaoOferta} h passou há ${-dias} dia(s) pelo horímetro estimado (${fmtH(horimetroHoje)})`;
  } else if (dias <= DIAS_JANELA) {
    situacao = "vence_30";
    explicacao = `a de ${revisaoOferta} h vence em ${dias} dia(s) — horímetro estimado hoje ${fmtH(horimetroHoje)}`;
  } else {
    situacao = "proxima";
    explicacao = `a de ${revisaoOferta} h vence em ${dias} dias (${fmtDataBR(dataPrevista)})`;
  }
  if (mediaPadrao) explicacao += " · estimada sem leitura";

  return {
    entrega, entregaAnotada, entregaAjustada: ef.ajustada, validos, descartados, mediaHDia: Math.round(m * 100) / 100, mediaPadrao, ritmoRecente, ultimaLeitura, horimetroHoje,
    ultimaRevisaoFeita, proximaDevida, revisaoOferta, dataPrevista, dias, situacao, confianca, explicacao,
  };
}

// ─── fila de trabalho ────────────────────────────────────────────────────────

/** Contato com o cliente sobre a revisão (tabela feedback_revisoes_contato, ou só na tela). */
export type StatusContatoRevisao = "aberto" | "agendada" | "nao_quer" | "arquivado";
export interface ContatoRevisao {
  trator_id: string;
  revisao: number | null;
  status: StatusContatoRevisao;
  tentativas: Tentativa[];
  proximo_contato_em: string | null;
  motivo: string | null;
  data_agendada: string | null;
  concluido_em: string | null;
  atualizado_em?: string | null;
}
/** O que a tela manda ao concluir o atendimento de uma revisão. */
export interface DadosConcluirRevisao { status: "agendada" | "nao_quer"; data_agendada: string | null; motivo: string }
export const contatoVazio = (trator_id: string): ContatoRevisao => ({ trator_id, revisao: null, status: "aberto", tentativas: [], proximo_contato_em: null, motivo: null, data_agendada: null, concluido_em: null });

export interface TratorRevisao {
  id: string;
  modelo: string;
  chassi: string;
  cliente: string;
  cidade: string | null;
  vendedor: string | null;
  telefone: string | null;
  codigo_omie: string | null;
  previsao: Previsao;
  /** projeto Omie da máquina (nome "MODELO CHASSI" + empresa), casado pelo final do chassi — opcional */
  projeto?: { nome: string; empresa: string } | null;
}

export interface ItemRevisao {
  trator: TratorRevisao;
  contato: ContatoRevisao;
  pontos: number;
  acao: Acao;
  oQueFazer: string;
  porque: string;
  aPartirDe: string | null;
}

/**
 * O que fazer com o trator agora. Mesmas regras de tentativa da fila do CRM: tentou hoje → amanhã;
 * 3 ligações sem resposta → WhatsApp; retorno combinado → espera. Próxima a mais de 30 dias → espera
 * até 30 dias antes. Ordem: atrasadas (a que acabou de vencer primeiro) → vence em 30 dias (a mais
 * perto primeiro) → parou de fazer na loja (a com leitura mais recente primeiro) → próximas.
 */
export function avaliarRevisao(t: TratorRevisao, contato: ContatoRevisao | null, agora: number = Date.now()): ItemRevisao {
  const c = contato && (contato.revisao == null || contato.revisao === t.previsao.revisaoOferta) ? contato : contatoVazio(t.id);
  const p = t.previsao;
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const tent = Array.isArray(c.tentativas) ? c.tentativas : [];
  const ultimaTent = tent.length ? Math.max(...tent.map((x) => Date.parse(x.data)).filter(Number.isFinite)) : null;
  const tentouHoje = ultimaTent != null && agora - ultimaTent < 20 * 3600_000;
  const item = (x: Omit<ItemRevisao, "trator" | "contato">): ItemRevisao => ({ trator: t, contato: c, ...x });

  if (c.status !== "aberto") {
    const rot = c.status === "agendada" ? `Revisão agendada${c.data_agendada ? ` para ${fmtDataBR(c.data_agendada)}` : ""}` : c.status === "nao_quer" ? "Não quer a revisão agora" : "Arquivado";
    return item({ pontos: -1, acao: "concluido", oQueFazer: rot, porque: c.motivo || "", aPartirDe: null });
  }
  if (c.proximo_contato_em && c.proximo_contato_em > hoje) {
    return item({ pontos: 5, acao: "aguardar", oQueFazer: `Retornar em ${fmtDataBR(c.proximo_contato_em)}`, porque: "o cliente pediu para falar outro dia", aPartirDe: c.proximo_contato_em });
  }

  let pontos = 0;
  const motivos: string[] = [p.explicacao];
  if (p.situacao === "sem_entrega") return item({ pontos: 0, acao: "aguardar", oQueFazer: "Conferir a data de entrega", porque: p.explicacao, aPartirDe: null });
  if (p.situacao === "proxima") {
    const em = p.dataPrevista ? somaDias(p.dataPrevista, -DIAS_JANELA) : null;
    return item({ pontos: 20 - Math.min(19, (p.dias ?? 0) / 30), acao: "aguardar", oQueFazer: em ? `Ligar a partir de ${fmtDataBR(em)}` : "Esperar", porque: p.explicacao, aPartirDe: em });
  }
  if (p.situacao === "atrasada") pontos = 300 - Math.min(DIAS_ATRASO_PAROU, -(p.dias ?? 0)) / 2;
  else if (p.situacao === "vence_30") pontos = 260 - (p.dias ?? 0);
  else {
    const diasUlt = p.ultimaLeitura ? Math.max(0, Math.round((tsDia(hoje) - tsDia(p.ultimaLeitura.data)) / DIA)) : 3650;
    pontos = 150 - Math.min(100, diasUlt / 30);
  }
  if (p.confianca === "alta") pontos += 10;
  if (!t.telefone) { pontos -= 30; motivos.push("sem telefone") }

  if (tentouHoje) return item({ pontos: pontos - 400, acao: "retentar", oQueFazer: "Tentar de novo amanhã", porque: `já tentou hoje (${tent.length} tentativa(s))`, aPartirDe: somaDias(hoje, 1) });
  if (tent.filter((x) => x.canal === "telefone").length >= 3) return item({ pontos: pontos - 20, acao: "whatsapp", oQueFazer: "Mandar mensagem no WhatsApp", porque: `${tent.length} tentativa(s) de ligação sem resposta`, aPartirDe: null });
  if (tent.length) motivos.push(`${tent.length} tentativa(s) antes`);
  const verbo = p.situacao === "parou" ? `Oferecer a revisão de ${p.revisaoOferta} h` : `Ligar oferecendo a revisão de ${p.revisaoOferta} h`;
  return item({ pontos, acao: "ligar", oQueFazer: tent.length ? `Ligar de novo · revisão de ${p.revisaoOferta} h` : verbo, porque: motivos.join(" · "), aPartirDe: null });
}

export function montarFilaRevisoes(tratores: TratorRevisao[], contatos: Record<string, ContatoRevisao>, agora: number = Date.now()): ItemRevisao[] {
  const peso: Record<Acao, number> = { ligar: 0, whatsapp: 0, retentar: 1, aguardar: 2, concluido: 3 };
  return tratores.map((t) => avaliarRevisao(t, contatos[t.id] ?? null, agora)).sort((a, b) => peso[a.acao] - peso[b.acao] || b.pontos - a.pontos);
}

/** Texto pronto para o WhatsApp (o atendente revisa antes de mandar). */
export function mensagemRevisao(t: Pick<TratorRevisao, "cliente" | "modelo"> & { previsao: Pick<Previsao, "revisaoOferta" | "situacao" | "horimetroHoje"> }): string {
  const nome = (t.cliente || "").split(/[\s(/]/)[0];
  const primeiro = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
  const maq = t.modelo ? `seu Mahindra ${t.modelo.trim()}` : "seu trator Mahindra";
  const rev = `${t.previsao.revisaoOferta.toLocaleString("pt-BR")} horas`;
  const ola = `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Nova Tratores.`;
  if (t.previsao.situacao === "parou") return `${ola} Faz um tempo que não fazemos a revisão do ${maq}. Pelas nossas contas ele está perto das ${rev}. Quer que a gente agende a revisão de ${rev}? É só responder esta mensagem.`;
  if (t.previsao.situacao === "atrasada") return `${ola} Pelas nossas contas o ${maq} já passou das ${rev} — a revisão de ${rev} está pendente. Quer que a gente agende? É só responder esta mensagem.`;
  return `${ola} Pelas nossas contas o ${maq} está chegando nas ${rev}, a hora da revisão de ${rev}. Quer que a gente já deixe agendado? É só responder esta mensagem.`;
}

// ─── formatação ──────────────────────────────────────────────────────────────

export const fmtH = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: h >= 100 ? 0 : 1 })} h`;
export function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}
