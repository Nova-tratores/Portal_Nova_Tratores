// Contas a pagar recorrentes que não foram lançadas no Omie (José, 03/11/2026 — opção 1).
// Fonte: contas_pagar (espelho Omie). Recorrente = mesmo fornecedor + categoria em 5 dos 6 meses
// anteriores, até 3 títulos por mês, em categoria de despesa fixa (compra, frete, posto etc. ficam fora).
// O aviso respeita o atraso costumeiro de cada conta: 55% das fixas entram no Omie DEPOIS do vencimento,
// então só falta quando passou vencimento esperado + atraso costumeiro + FOLGA_DIAS.

/** Responsável pelos avisos de conta recorrente (José, 03/11/2026). Também entra na tela mesmo sem ser Financeiro. */
export const RESPONSAVEL_RECORRENTES = { id: "3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa", nome: "Mariano" };

export const FOLGA_DIAS = 7;
export const MESES_BASE = 6;
export const MIN_MESES = 5;
export const MESES_AVALIADOS = 3; // mês atual e os 2 anteriores

/** Categorias que não são conta fixa (compra solta, frete, imposto de operação, despesa eventual). */
export const CATEGORIA_FORA = /compra|frete|combust|manuten|entradas? de pe|recebimento de pe|sa[ií]das de pe|envio de pe|brinde|material|almoxar|limpeza|rescis|adiantamento|devolu|iof|juros|tarifa|multa|hospedagem|viage|ped[aá]gio|passage|doa[çc]|documenta|contratos|ferramenta|equipamento|uniforme|^ve[ií]culos$|im[oó]veis|m[oó]veis|13º|f[eé]rias|bonifica|folheto|demonstra|ipva/i;

export const COLUNAS_RECORRENTES =
  "id,conta_omie,codigo_cliente_fornecedor,nome_fornecedor,codigo_categoria,descricao_categoria,data_vencimento,data_inclusao,valor_documento,numero_parcela,status_titulo,incluido_por";

export type TituloRec = {
  id: number; conta_omie: string; codigo_cliente_fornecedor: number; nome_fornecedor: string | null;
  codigo_categoria: string | null; descricao_categoria: string | null; data_vencimento: string;
  data_inclusao: string | null; valor_documento: number | string; numero_parcela: string | null;
  status_titulo: string | null; incluido_por: string | null;
};

export type Decisao = {
  id: number; empresa: string; fornecedor_codigo: number; categoria: string | null;
  tipo: "nao_recorrente" | "pular_mes" | "ja_lancei"; mes: string | null;
  criado_por_nome: string | null; criado_em: string;
};

export type Situacao = "faltando" | "aguardando" | "lancada" | "vizinho" | "marcada";

export type ItemRec = {
  chave: string; empresa: string; fornecedor_codigo: number; fornecedor: string; categoria: string;
  codigo_categoria: string | null; mes: string; situacao: Situacao;
  valor_costumeiro: number; variacao: number; dia: number; vencimento_esperado: string;
  atraso_costumeiro: number; prazo: string; dias_passados: number; meses_com_conta: number;
  quem_lanca: string | null; decisao: Decisao | null;
  historico: { mes: string; qtd: number; valor: number }[];
  titulos_mes: { id: number; vencimento: string; valor: number; parcela: string | null; status: string | null }[];
};

/** Hoje no fuso de Brasília, 'AAAA-MM-DD'. */
export const hojeBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const mesDe = (d: string) => d.slice(0, 7);
const mediana = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function somarMeses(mes: string, n: number): string {
  let [y, m] = mes.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

function diaNoMes(mes: string, dia: number): string {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Primeiro dia de vencimento que a API precisa ler (base de 6 meses do mês mais antigo avaliado + 1 mês de folga). */
export function inicioLeitura(hoje: string): string {
  return `${somarMeses(mesDe(hoje), -(MESES_AVALIADOS - 1) - MESES_BASE - 1)}-01`;
}

export function detectarRecorrentes(
  titulosTodos: TituloRec[], hoje: string, decisoes: Decisao[], nomes: Record<string, string>,
): ItemRec[] {
  const titulos = titulosTodos.filter((t) => t.status_titulo !== "CANCELADO" && t.data_vencimento);
  const grupos = new Map<string, TituloRec[]>();
  for (const t of titulos) {
    if (CATEGORIA_FORA.test(t.descricao_categoria || "")) continue;
    const k = `${t.conta_omie}|${t.codigo_cliente_fornecedor}|${t.codigo_categoria || ""}`;
    const g = grupos.get(k);
    if (g) g.push(t); else grupos.set(k, [t]);
  }

  const mesHoje = mesDe(hoje);
  const out: ItemRec[] = [];
  for (const [chave, itens] of grupos) {
    const porMes = new Map<string, TituloRec[]>();
    for (const t of itens) { const m = mesDe(t.data_vencimento); const l = porMes.get(m); if (l) l.push(t); else porMes.set(m, [t]); }
    const qtdMes = (m: string) => porMes.get(m)?.length || 0;
    const atraso = Math.max(0, mediana(itens.filter((t) => t.data_inclusao)
      .map((t) => diasEntre(t.data_vencimento, t.data_inclusao!.slice(0, 10)))));
    const contagem: Record<string, number> = {};
    for (const t of itens) if (t.incluido_por) contagem[t.incluido_por] = (contagem[t.incluido_por] || 0) + 1;
    const quem = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const [empresa, fornCod] = chave.split("|");
    const ref = itens[itens.length - 1];

    for (let i = MESES_AVALIADOS - 1; i >= 0; i--) {
      const mes = somarMeses(mesHoje, -i);
      const base = Array.from({ length: MESES_BASE }, (_, j) => somarMeses(mes, -MESES_BASE + j));
      const comConta = base.filter((m) => qtdMes(m) > 0);
      if (comConta.length < MIN_MESES) continue;
      const qtdTipica = mediana(comConta.map(qtdMes));
      if (qtdTipica > 3) continue;
      // Parcelamento que terminou: a última parcela vista na base é N/N.
      const ultimo = base.flatMap((m) => porMes.get(m) || []).sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento))[0];
      const [pa, pt] = String(ultimo?.numero_parcela || "").split("/").map(Number);
      if (pt > 1 && pa === pt && !qtdMes(mes)) continue;

      const valores = comConta.map((m) => porMes.get(m)!.reduce((s, t) => s + Number(t.valor_documento || 0), 0));
      const vm = mediana(valores);
      const variacao = vm ? Math.sqrt(valores.reduce((s, v) => s + (v - vm) ** 2, 0) / valores.length) / vm : 0;
      const dia = mediana(comConta.flatMap((m) => porMes.get(m)!.map((t) => Number(t.data_vencimento.slice(8, 10)))));
      const venc = diaNoMes(mes, dia);
      const prazo = somarDias(venc, atraso + FOLGA_DIAS);

      const doMes = porMes.get(mes) || [];
      const decisao = decisoes.find((d) => d.empresa === empresa && String(d.fornecedor_codigo) === fornCod
        && (d.categoria || "") === (ref.codigo_categoria || "")
        && (d.tipo === "nao_recorrente" || d.mes === mes)) || null;
      if (decisao?.tipo === "nao_recorrente") continue;

      let situacao: Situacao;
      if (doMes.length) situacao = "lancada";
      // Lançada com vencimento no mês vizinho (ex.: Sabesp com 2 contas em agosto e nenhuma em setembro).
      else if (qtdMes(somarMeses(mes, -1)) > qtdTipica || qtdMes(somarMeses(mes, 1)) > qtdTipica) situacao = "vizinho";
      else if (decisao) situacao = "marcada";
      else situacao = hoje > prazo ? "faltando" : "aguardando";

      out.push({
        chave: `${chave}|${mes}`, empresa, fornecedor_codigo: Number(fornCod), fornecedor: ref.nome_fornecedor || "—",
        categoria: ref.descricao_categoria || "—", codigo_categoria: ref.codigo_categoria, mes, situacao,
        valor_costumeiro: Math.round(vm * 100) / 100, variacao: Math.round(variacao * 100), dia, vencimento_esperado: venc,
        atraso_costumeiro: atraso, prazo, dias_passados: diasEntre(prazo, hoje), meses_com_conta: comConta.length,
        quem_lanca: quem ? nomes[quem] || quem : null, decisao,
        historico: [...base, mes].map((m) => ({ mes: m, qtd: qtdMes(m), valor: (porMes.get(m) || []).reduce((s, t) => s + Number(t.valor_documento || 0), 0) })),
        titulos_mes: doMes.map((t) => ({ id: t.id, vencimento: t.data_vencimento, valor: Number(t.valor_documento || 0), parcela: t.numero_parcela, status: t.status_titulo })),
      });
    }
  }
  const ordem: Record<Situacao, number> = { faltando: 0, aguardando: 1, marcada: 2, vizinho: 3, lancada: 4 };
  return out.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.prazo.localeCompare(b.prazo));
}
