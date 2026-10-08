// Regras PURAS de "em que mês cai cada pedido" no espelho vendas_itens.
//
// O ListarPedidos da Omie devolve o pedido INCLUÍDO **ou ALTERADO** na janela
// pedida. O sync antigo gravava em `mes/ano` a janela consultada: pedido
// alterado depois de faturado (ajuste de NF, cancelamento…) era regravado no mês
// da alteração e ficava DUPLICADO — uma cópia no mês do faturamento e outra no
// mês da alteração (auditoria de 08/10/2026: 29 pares, R$ 14,9 mil a mais).
//
// Regra (a mesma do arquivo mensal Mahindra): o mês de um pedido é o mês do
// FATURAMENTO (`infoCadastro.dFat`); sem dFat, cai na previsão e depois na
// inclusão (= `data_pedido`, que continua com o significado de sempre). Cada
// pedido vive em exatamente um mês: ao regravar, apaga-se o pedido INTEIRO
// (por número, em qualquer mês) antes de inserir.

export interface PedidoRef {
  numero_pedido: string;
  data_pedido: string;            // previsão || inclusão (DD/MM/AAAA)
  data_faturamento?: string | null; // dFat (DD/MM/AAAA)
}

export interface MesAnoRef { mes: number; ano: number }

/** 'DD/MM/AAAA' → {dia, mes, ano}; null se não for uma data válida. */
export function lerDataBR(s: string | null | undefined): { dia: number; mes: number; ano: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { dia, mes, ano };
}

/** Data que decide o mês do pedido: faturamento → previsão/inclusão. */
export function dataReferencia(p: Pick<PedidoRef, 'data_pedido' | 'data_faturamento'>): string | null {
  if (lerDataBR(p.data_faturamento)) return String(p.data_faturamento).trim();
  if (lerDataBR(p.data_pedido)) return String(p.data_pedido).trim();
  return null;
}

export function mesReferencia(p: Pick<PedidoRef, 'data_pedido' | 'data_faturamento'>): MesAnoRef | null {
  const d = lerDataBR(dataReferencia(p));
  return d ? { mes: d.mes, ano: d.ano } : null;
}

export const chaveMes = (m: MesAnoRef): string => m.ano + '-' + String(m.mes).padStart(2, '0');

/**
 * Plano de gravação de um lote vindo da Omie.
 * - `escopo` = meses que este sync pode preencher (null = qualquer mês, caso do
 *   delta: pedido faturado no mês passado e alterado hoje volta pro mês dele).
 * - `numerosApagar` = pedidos cujas linhas saem do espelho em QUALQUER mês antes
 *   do insert: os que serão regravados + os descartados (cancelados / fora das
 *   etapas faturadas) — assim pedido cancelado depois de faturado também sai.
 *   Pedido fora do escopo NÃO é apagado (a cópia dele no mês certo fica).
 * - `porMes` = linhas a inserir, já no mês de referência.
 */
export function planejarGravacao<T extends PedidoRef>(
  pedidos: T[],
  descartados: Iterable<string>,
  escopo: MesAnoRef[] | null,
): { numerosApagar: Set<string>; porMes: Map<string, { mes: number; ano: number; itens: T[] }>; foraDoEscopo: number } {
  const permitidos = escopo ? new Set(escopo.map(chaveMes)) : null;
  const numerosApagar = new Set<string>();
  const porMes = new Map<string, { mes: number; ano: number; itens: T[] }>();
  let foraDoEscopo = 0;
  for (const p of pedidos) {
    const ref = mesReferencia(p);
    if (!ref) { foraDoEscopo++; continue; }
    const k = chaveMes(ref);
    if (permitidos && !permitidos.has(k)) { foraDoEscopo++; continue; }
    if (p.numero_pedido) numerosApagar.add(p.numero_pedido);
    let g = porMes.get(k);
    if (!g) { g = { mes: ref.mes, ano: ref.ano, itens: [] }; porMes.set(k, g); }
    g.itens.push(p);
  }
  for (const n of descartados) if (n) numerosApagar.add(n);
  return { numerosApagar, porMes, foraDoEscopo };
}
