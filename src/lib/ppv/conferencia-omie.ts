// PPV do portal × Pedido de Venda do Omie, antes de faturar (José, 14/10/2026).
// conferirPPV = só leitura (ConsultarPedido). alinharPPV = AlterarPedidoVenda com
// o det INTEIRO (o Omie apaga o item que não vier) e confere de novo.
import { buscarPPVPorId } from "@/lib/ppv/queries";
import {
  resolverContaDoPedido, omieNaConta, contaCorrenteDoPedido, departamentosDoPedido,
  buscarCodigoProdutoOmie, montarParcelasOmie, isoParaBR, type OmieAccount, type OmieDetItem,
} from "@/lib/ppv/omie";
import {
  compararItens, compararCampo, compararDepartamentos, compararParcelas, diferente,
  type Divergencia, type ItemComparavel, type ResultadoConferencia,
} from "@/lib/omie/conferencia";

type Rec = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

interface PedidoOmie {
  cabecalho?: { codigo_pedido?: number; numero_pedido?: string; etapa?: string; data_previsao?: string; codigo_parcela?: string; qtde_parcelas?: number };
  informacoes_adicionais?: { codigo_categoria?: string; codigo_conta_corrente?: number };
  lista_parcelas?: { parcela?: { data_vencimento?: string; valor?: number }[] };
  departamentos?: { cCodDepto?: string; nPerc?: number }[];
  det?: (OmieDetItem & { produto?: OmieDetItem["produto"] & { valor_desconto?: number; percentual_desconto?: number; tipo_desconto?: string } })[];
}

/** itens do portal: saldo (saídas − devoluções) por código, com o desconto % do pedido */
function itensDoPortal(d: NonNullable<Awaited<ReturnType<typeof buscarPPVPorId>>>) {
  const m = new Map<string, { qtde: number; preco: number; descricao: string }>();
  for (const p of d.produtos) {
    const x = m.get(p.codigo) || { qtde: 0, preco: p.preco, descricao: p.descricao };
    x.qtde += n(p.quantidade); m.set(p.codigo, x);
  }
  for (const v of d.devolucoes) { const x = m.get(v.codigo); if (x) x.qtde -= n(v.quantidade); }
  const perc = n(d.desconto);
  return Array.from(m.entries()).filter(([, x]) => x.qtde > 0.0005).map(([codigo, x]) => ({
    codigo, descricao: x.descricao, qtde: x.qtde, preco: n(x.preco), perc,
    desconto: r2(x.qtde * n(x.preco) * perc / 100),
  }));
}

const descontoDet = (p: NonNullable<PedidoOmie["det"]>[number]["produto"]) => {
  if (!p) return 0;
  if (n(p.valor_desconto) > 0) return n(p.valor_desconto);
  return p.tipo_desconto === "P" ? r2(n(p.quantidade) * n(p.valor_unitario) * n(p.percentual_desconto) / 100) : 0;
};

export async function conferirPPV(idPPV: string): Promise<ResultadoConferencia & { _ctx?: { acc: OmieAccount; pedido: PedidoOmie } }> {
  const base = { doc: idPPV, tipo: "Pedido de venda", numeroOmie: "", divergencias: [] as Divergencia[] };
  const d = await buscarPPVPorId(idPPV);
  if (!d) return { ...base, erro: "Pedido não encontrado no portal." };
  if (!d.pedidoOmie) return { ...base, pulado: "ainda não foi enviado ao Omie" };
  if (d.tipoPedido === "Remessa") return { ...base, numeroOmie: String(d.pedidoOmie).replace(/^0+/, ""), pulado: "é remessa (não fatura)" };
  if (d.faturadoOmieEm) return { ...base, numeroOmie: String(d.pedidoOmie).replace(/^0+/, ""), pulado: "já está faturado" };
  const achado = await resolverContaDoPedido(idPPV, d.omieEmpresa || null).catch(() => null);
  if (!achado) return { ...base, numeroOmie: String(d.pedidoOmie).replace(/^0+/, ""), erro: "Não achei este pedido no Omie." };
  const { acc } = achado;
  const pedido = achado.pedido as unknown as PedidoOmie;
  const num = String(pedido.cabecalho?.numero_pedido || d.pedidoOmie).replace(/^0+/, "");
  // 50 = "Faturar" (ainda não emitiu); faturado é 60
  if (n(pedido.cabecalho?.etapa) >= 60) return { ...base, numeroOmie: num, pulado: "já está faturado no Omie" };

  const portal = itensDoPortal(d);
  const pItens: ItemComparavel[] = portal.map((x) => ({ chave: x.codigo.trim().toUpperCase(), rotulo: x.codigo, qtde: x.qtde, unit: x.preco, desconto: x.desconto }));
  const oItens: ItemComparavel[] = (pedido.det || []).map((it) => ({
    chave: String(it.produto?.codigo || "").trim().toUpperCase(), rotulo: String(it.produto?.codigo || "?"),
    qtde: n(it.produto?.quantidade), unit: n(it.produto?.valor_unitario), desconto: descontoDet(it.produto),
  }));
  const div: Divergencia[] = compararItens(idPPV, pItens, oItens, "Peça");
  const add = (x: Divergencia | null) => { if (x) div.push(x); };
  const ia = pedido.informacoes_adicionais || {};
  add(compararCampo(idPPV, "categoria", "Categoria", d.categoriaPedido, ia.codigo_categoria));
  if (d.contaCorrente) {
    const cc = await contaCorrenteDoPedido(acc, d.contaCorrente).catch(() => ({ codigo: undefined }));
    add(compararCampo(idPPV, "conta", "Conta corrente", cc.codigo ? String(cc.codigo) : "", ia.codigo_conta_corrente ? String(ia.codigo_conta_corrente) : ""));
  }
  if (d.previsaoFaturamento) add(compararCampo(idPPV, "previsao", "Previsão de faturamento", isoParaBR(d.previsaoFaturamento), pedido.cabecalho?.data_previsao));
  // parcelas sobre o total com desconto
  const total = portal.reduce((s, x) => s + x.qtde * x.preco - x.desconto, 0);
  if (d.numParcelas) {
    const parc = montarParcelasOmie(d.numParcelas, d.previsaoFaturamento || "", r2(total));
    const omieParc = (pedido.lista_parcelas?.parcela || []).map((p) => ({ venc: String(p.data_vencimento || ""), valor: n(p.valor) }));
    if (parc.codigo_parcela === "000") add(compararCampo(idPPV, "parcelas", "Parcelas", "000", pedido.cabecalho?.codigo_parcela, { exibirPortal: "à vista", exibirOmie: pedido.cabecalho?.codigo_parcela === "000" ? "à vista" : `${omieParc.length} parcela(s)` }));
    else add(compararParcelas(idPPV, (parc.lista_parcelas?.parcela || []).map((p) => ({ venc: String(p.data_vencimento), valor: n(p.valor) })), omieParc));
  }
  if (d.departamentos?.length) {
    const dep = await departamentosDoPedido(acc, d.departamentos.map((x) => ({ codigo: String(x.codigo), perc: n(x.perc) }))).catch(() => ({ deps: [] as { codigo: string; perc: number }[] }));
    const pDep: Record<string, number> = {}; for (const x of dep.deps) pDep[x.codigo] = x.perc;
    const oDep: Record<string, number> = {}; for (const x of pedido.departamentos || []) oDep[String(x.cCodDepto)] = n(x.nPerc);
    add(compararDepartamentos(idPPV, pDep, oDep, (c) => c));
  }
  return { ...base, numeroOmie: num, divergencias: div, _ctx: { acc, pedido } };
}

/** Deixa o pedido do Omie igual ao portal e confere de novo. */
export async function alinharPPV(idPPV: string): Promise<ResultadoConferencia> {
  const conf = await conferirPPV(idPPV);
  if (conf.erro || conf.pulado || !conf._ctx || !conf.divergencias.length) return limpar(conf);
  const d = (await buscarPPVPorId(idPPV))!;
  const { acc, pedido } = conf._ctx;
  const portal = itensDoPortal(d);
  const det = pedido.det || [];

  const detNovo: Rec[] = [];
  let seq = det.length;
  for (const x of portal) {
    const o = det.find((it) => String(it.produto?.codigo || "").trim().toUpperCase() === x.codigo.trim().toUpperCase());
    const produto: Rec = { quantidade: x.qtde, valor_unitario: x.preco, tipo_desconto: "P", percentual_desconto: x.perc };
    if (o) {
      produto.codigo_produto = o.produto?.codigo_produto;
      if (o.produto?.cfop) produto.cfop = o.produto.cfop;
      const igual = !diferente(n(o.produto?.quantidade), x.qtde, 0.0005) && !diferente(n(o.produto?.valor_unitario), x.preco) && !diferente(descontoDet(o.produto), x.desconto);
      detNovo.push({
        ide: { codigo_item: o.ide?.codigo_item, codigo_item_integracao: o.ide?.codigo_item_integracao || undefined },
        produto,
        // imposto cru só no item que não mudou (com quantidade/valor novos o Omie recalcula pelo cenário)
        ...(igual && o.imposto ? { imposto: o.imposto } : {}),
      });
    } else {
      produto.codigo_produto = await buscarCodigoProdutoOmie(x.codigo, acc);
      detNovo.push({ ide: { codigo_item_integracao: `${idPPV}-${++seq}` }, produto });
    }
  }
  if (!detNovo.length) return { ...limpar(conf), erro: "O pedido do portal está sem itens — não dá para deixar o Omie igual." };

  const total = r2(portal.reduce((s, x) => s + x.qtde * x.preco - x.desconto, 0));
  const cabecalho: Rec = { codigo_pedido: pedido.cabecalho?.codigo_pedido };
  const info: Rec = {};
  if (d.categoriaPedido) info.codigo_categoria = d.categoriaPedido;
  if (d.contaCorrente) { const cc = await contaCorrenteDoPedido(acc, d.contaCorrente).catch(() => ({ codigo: undefined })); if (cc.codigo) info.codigo_conta_corrente = cc.codigo; }
  if (d.previsaoFaturamento) cabecalho.data_previsao = isoParaBR(d.previsaoFaturamento);
  const param: Rec = { cabecalho, det: detNovo };
  if (Object.keys(info).length) param.informacoes_adicionais = info;
  if (d.numParcelas) {
    const parc = montarParcelasOmie(d.numParcelas, d.previsaoFaturamento || "", total);
    cabecalho.codigo_parcela = parc.codigo_parcela; cabecalho.qtde_parcelas = parc.qtde_parcelas;
    if (parc.lista_parcelas) param.lista_parcelas = parc.lista_parcelas;
  }
  if (d.departamentos?.length) {
    const dep = await departamentosDoPedido(acc, d.departamentos.map((x) => ({ codigo: String(x.codigo), perc: n(x.perc) }))).catch(() => ({ deps: [] as { codigo: string; perc: number }[] }));
    if (dep.deps.length) param.departamentos = dep.deps.map((x) => ({ cCodDepto: x.codigo, nPerc: x.perc, nValor: r2(total * x.perc / 100), nValorFixo: "N" }));
  }
  try { await omieNaConta(acc, "/produtos/pedido/", "AlterarPedidoVenda", param); }
  catch (e) {
    return { ...limpar(await conferirPPV(idPPV)), erro: `O Omie recusou a atualização: ${e instanceof Error ? e.message : e}` };
  }
  return limpar(await conferirPPV(idPPV));
}

function limpar(r: ResultadoConferencia & { _ctx?: unknown }): ResultadoConferencia {
  const { _ctx, ...resto } = r; void _ctx;
  return resto;
}
export const conferirPPVPublico = async (id: string) => limpar(await conferirPPV(id));
