// Corrigir a NF-e de peças (José, 15/10/2026) — mesmo esquema da nota de serviço:
//   1) Cancelar a NF-e: pelo Omie (CancelarPedidoVenda). Segundo a ajuda do Omie,
//      cancelar o pedido faturado cancela a NF-e na SEFAZ, o título a receber e
//      devolve as peças ao estoque. (Cancelar direto na SEFAZ deixaria o estoque
//      e o título do Omie para trás.) A SEFAZ SP só aceita até 24 h depois da emissão.
//   2) Duplicar o pedido: DuplicarPedidoVenda; acha a cópia pela lista do cliente
//      (o retorno nem sempre traz o código), refaz consumo final + CST 60, o
//      vínculo com a OS e liga o PPV do portal à cópia (volta para "Enviado Omie").
import { refPedidoNaOS, refOSNoPedido } from "@/lib/pos/pedido-cliente";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { buscarPPVPorId, registrarLog } from "@/lib/ppv/queries";
import { retirarCardDoDocumentoCancelado } from "@/lib/financeiro/cards-chamado";
import { resolverContaDoPedido, omieNaConta, garantirCst60, type OmieAccount } from "@/lib/ppv/omie";

type Rec = Record<string, unknown>;
export interface ResultadoRefaturarPedido {
  ok: boolean; erro?: string; avisos?: string[];
  nf?: string; antigo?: string; novo?: string; proximo?: "duplicar_pedido";
}
const semZeros = (n: unknown) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MOTIVOS: Record<string, string> = { "1": "Erro na emissão", "2": "Venda não realizada", "9": "Outros" };

interface PedidoOmie {
  cabecalho?: { codigo_pedido?: number; numero_pedido?: string; codigo_cliente?: number; etapa?: string };
  infoCadastro?: { cancelado?: string; faturado?: string };
  total_pedido?: { valor_total_pedido?: number };
}
async function consultar(acc: OmieAccount, codigo: number): Promise<PedidoOmie | null> {
  const r = await omieNaConta<{ pedido_venda_produto?: PedidoOmie }>(acc, "/produtos/pedido/", "ConsultarPedido", { codigo_pedido: codigo });
  return r.pedido_venda_produto || null;
}
async function historicoDe(idPPV: string): Promise<{ lista: Rec[]; temColuna: boolean }> {
  const { data, error } = await supabase.from("pedidos").select("faturamento_anterior").eq("id_pedido", idPPV).limit(1);
  if (error) return { lista: [], temColuna: false };
  const l = (data?.[0] as { faturamento_anterior?: Rec[] } | undefined)?.faturamento_anterior;
  return { lista: Array.isArray(l) ? l : [], temColuna: true };
}

/** 1º passo: cancela a NF-e (cancelando o pedido faturado no Omie). */
export async function cancelarNotaPedido(idPPV: string, opts: { motivo: string; texto: string; usuario: string }): Promise<ResultadoRefaturarPedido> {
  const texto = String(opts.texto || "").replace(/\s+/g, " ").trim();
  if (!MOTIVOS[opts.motivo]) return { ok: false, erro: "Escolha o motivo do cancelamento." };
  if (texto.length < 15) return { ok: false, erro: "Explique o motivo com pelo menos 15 letras." };
  const { lista: historico, temColuna } = await historicoDe(idPPV);
  if (!temColuna) return { ok: false, erro: "Falta rodar o sql/ppv-refaturar.sql no Supabase. Nada foi cancelado." };
  const d = await buscarPPVPorId(idPPV);
  if (!d) return { ok: false, erro: "Pedido não encontrado no portal." };
  if (!d.pedidoOmie) return { ok: false, erro: "Este pedido não está no Omie." };
  if (d.tipoPedido === "Remessa") return { ok: false, erro: "Remessa não tem NF-e de venda para cancelar por aqui." };
  const achado = await resolverContaDoPedido(idPPV, d.omieEmpresa || null).catch(() => null);
  if (!achado) return { ok: false, erro: "Não achei o pedido no Omie." };
  const { acc } = achado;
  const ped = achado.pedido as unknown as PedidoOmie;
  const cod = Number(ped.cabecalho?.codigo_pedido || 0);
  const num = semZeros(ped.cabecalho?.numero_pedido || d.pedidoOmie);
  if (Number(ped.cabecalho?.etapa || 0) < 60 && !d.faturadoOmieEm) return { ok: false, erro: `O pedido ${num} não está faturado — não há NF-e para cancelar.` };
  const nf = semZeros((d as unknown as { nfNumero?: string }).nfNumero || "");

  // O Omie recusa NO CORPO (cCodStatus ≠ "0" + cDescStatus), sem faultstring — igual ao FaturarPedidoVenda.
  // Antes a resposta era ignorada e o motivo da recusa se perdia (PPV-0359, 23/10/2026). Agora vai pro histórico.
  let resp: { cCodStatus?: string; cDescStatus?: string } | null = null;
  try { resp = await omieNaConta<{ cCodStatus?: string; cDescStatus?: string }>(acc, "/produtos/pedidovendafat/", "CancelarPedidoVenda", { nCodPed: cod }); }
  catch (e) { return { ok: false, erro: `O Omie não cancelou o pedido ${num} (e a NF-e${nf ? ` ${nf}` : ""}): ${e instanceof Error ? e.message : e}. Nada mudou.` }; }
  await registrarLog(idPPV, `Pedido de cancelamento da NF-e${nf ? ` ${nf}` : ""} ao Omie (pedido ${num}) — resposta: ${resp?.cCodStatus ?? "?"} ${resp?.cDescStatus || ""}`.trim(), opts.usuario).catch(() => {});
  if (resp?.cCodStatus && resp.cCodStatus !== "0") return { ok: false, erro: `O Omie recusou cancelar o pedido ${num} (e a NF-e${nf ? ` ${nf}` : ""}): ${resp.cDescStatus || `código ${resp.cCodStatus}`}. Nada mudou.` };
  const avisos: string[] = [];
  // Só registra o cancelamento quando o Omie MOSTRA o pedido cancelado (José, 23/10/2026: "não pode dar notícia
  // falsa"). PPV-0359: o Omie aceitou o pedido de cancelamento, a SEFAZ não cancelou a NF-e 8457 (deu certo depois, feito à mão pelo Omie
  // — "fora de prazo") e o portal marcou cancelada, tirou o título do financeiro e deixou duplicar.
  let cancelado = false;
  for (const ms of [3000, 7000, 15000, 30000]) {
    await espera(ms);
    try { if ((await consultar(acc, cod))?.infoCadastro?.cancelado === "S") { cancelado = true; break; } } catch { /* tenta de novo */ }
  }
  if (!cancelado) return { ok: false, erro: `A NF-e${nf ? ` ${nf}` : ""} NÃO foi cancelada: o Omie respondeu "${resp?.cDescStatus || "ok"}", mas depois de 1 minuto o pedido ${num} continua faturado. Nada foi mudado no portal. Tente pelo Omie (pedido → NF-e → Cancelamento da NF-e): depois de 24 h a SEFAZ-SP ainda aceita como "fora de prazo" (NF-e 8457, 23/10/2026).` };

  const anterior: Rec = {
    pedidoOmie: num, codigoPedido: cod, empresa: acc.name, nf: nf || null, faturadoEm: d.faturadoOmieEm || null,
    canceladaEm: new Date().toISOString(), canceladaPor: opts.usuario,
    motivo: `${opts.motivo} - ${MOTIVOS[opts.motivo]}: ${texto}`, pendenteDuplicar: true,
  };
  await supabase.from("pedidos").update({ faturamento_anterior: [...historico, anterior] }).eq("id_pedido", idPPV);
  // Pasta Clientes e financeiro do portal na hora (o sync confirma depois)
  await supabase.from("portal_nt_clientes_pv").update({ cancelado: true }).eq("cod_pedido", cod).then(() => {}, () => {});
  await supabase.from("contas_receber").update({ status_titulo: "CANCELADO" }).eq("raw->>nCodPedido", String(cod)).then(() => {}, () => {});
  const empCard = /castro/i.test(acc.name) ? "Castro Pecas" : "Nova Tratores";
  const cards = await retirarCardDoDocumentoCancelado(supabase, { numPedido: num, empresa: empCard }, `NF-e${nf ? ` ${nf}` : ""} do pedido ${num} cancelada para refazer`).catch(() => [] as number[]);
  await registrarLog(idPPV, `NF-e${nf ? ` ${nf}` : ""} cancelada (pedido ${num} cancelado no Omie). Motivo: ${anterior.motivo}${cards.length ? `. Card do financeiro #${cards.join(", #")} excluído` : ""}`, opts.usuario).catch(() => {});
  return { ok: true, nf, antigo: num, avisos, proximo: "duplicar_pedido" };
}

/** cópia do pedido já criada no Omie: mesmo cliente, código maior, aberta, não ligada a outro PPV */
async function acharCopiaPedido(acc: OmieAccount, codAntigo: number, codCli: number, idPPV: string): Promise<PedidoOmie | null> {
  const achados: PedidoOmie[] = [];
  for (let pag = 1; pag <= 3; pag++) {
    const r = await omieNaConta<{ pedido_venda_produto?: PedidoOmie[]; total_de_paginas?: number }>(acc, "/produtos/pedido/", "ListarPedidos",
      { pagina: pag, registros_por_pagina: 100, apenas_importado_api: "N", filtrar_por_cliente: codCli });
    achados.push(...(r.pedido_venda_produto || []));
    if (pag >= Number(r.total_de_paginas || 1)) break;
  }
  const cands = achados.filter((p) => Number(p.cabecalho?.codigo_pedido) > codAntigo && p.infoCadastro?.cancelado !== "S" && Number(p.cabecalho?.etapa || 0) < 50)
    .sort((a, b) => Number(b.cabecalho?.codigo_pedido) - Number(a.cabecalho?.codigo_pedido));
  for (const p of cands) {
    const num = String(p.cabecalho?.numero_pedido || "").padStart(15, "0");
    const { data } = await supabase.from("pedidos").select("id_pedido").eq("pedido_omie", num).neq("id_pedido", idPPV).limit(1);
    if (!data?.length) return p;
  }
  return null;
}

/** 2º passo: duplica o pedido no Omie e liga o PPV à cópia. */
export async function duplicarPedidoCancelado(idPPV: string, usuario: string): Promise<ResultadoRefaturarPedido> {
  const { lista: historico } = await historicoDe(idPPV);
  const i = historico.length - 1;
  const ult = historico[i];
  if (!ult?.pendenteDuplicar) return { ok: false, erro: "A NF-e deste pedido não foi cancelada pelo portal — use \"Cancelar a NF-e\" antes." };
  const codAntigo = Number(ult.codigoPedido);
  const d = await buscarPPVPorId(idPPV);
  if (!d) return { ok: false, erro: "Pedido não encontrado no portal." };
  const achado = await resolverContaDoPedido(idPPV, (ult.empresa as string) || d.omieEmpresa || null).catch(() => null);
  if (!achado) return { ok: false, erro: "Não achei o pedido antigo no Omie." };
  const { acc } = achado;
  const codCli = Number((achado.pedido as unknown as PedidoOmie).cabecalho?.codigo_cliente || 0);
  // só duplica se o pedido antigo está MESMO cancelado no Omie (senão saem duas NF-e das mesmas peças)
  const antigo = await consultar(acc, codAntigo).catch(() => null);
  if (antigo?.infoCadastro?.cancelado !== "S") return { ok: false, erro: `O pedido ${ult.pedidoOmie} NÃO está cancelado no Omie — a NF-e${ult.nf ? ` ${ult.nf}` : ""} continua valendo. Não dá para duplicar: sairiam duas notas das mesmas peças.` };

  let copia: PedidoOmie | null = null;
  try { copia = await acharCopiaPedido(acc, codAntigo, codCli, idPPV); } catch { /* duplica */ }
  if (!copia) {
    try { await omieNaConta(acc, "/produtos/pedidovendafat/", "DuplicarPedidoVenda", { nCodPed: codAntigo }); }
    catch (e) { return { ok: false, erro: `O Omie recusou duplicar o pedido ${ult.pedidoOmie}: ${e instanceof Error ? e.message : e}` }; }
    await espera(2500);
    try { copia = await acharCopiaPedido(acc, codAntigo, codCli, idPPV); } catch { /* abaixo */ }
    if (!copia) return { ok: false, erro: `Pedi ao Omie para duplicar o pedido ${ult.pedidoOmie}, mas não achei a cópia. Confira no Omie e tente de novo (o portal reaproveita a cópia).` };
  }
  const codNovo = Number(copia.cabecalho?.codigo_pedido);
  const numNovo = semZeros(copia.cabecalho?.numero_pedido);
  const avisos: string[] = [];

  // OS do portal (para o vínculo cruzado)
  const { data: osRow } = d.osId ? await supabase.from(TBL_OS).select("Id_Ordem, Ordem_Omie, omie_ncodos, Pedido_Venda").eq("Id_Ordem", d.osId).limit(1) : { data: null };
  const os = osRow?.[0] as Rec | undefined;
  const numOS = semZeros(os?.Ordem_Omie);
  try {
    await omieNaConta(acc, "/produtos/pedido/", "AlterarPedidoVenda", { cabecalho: { codigo_pedido: codNovo }, informacoes_adicionais: { consumidor_final: "S", ...(numOS ? { numero_pedido_cliente: refOSNoPedido(numOS, acc.name) } : {}) } });
  } catch (e) { avisos.push(`Não gravei consumo final / nº da OS no pedido ${numNovo}: ${e instanceof Error ? e.message : e}`); }
  const cst = await garantirCst60(acc, { codigo_pedido: codNovo }).catch((e) => ({ trocados: 0, erro: e instanceof Error ? e.message : String(e) }));
  if (cst.erro) avisos.push(`CST 60 no pedido ${numNovo}: ${cst.erro}`);
  if (os?.omie_ncodos) {
    try {
      const { omie: omiePorta } = await import("@/lib/omie/porta");
      const { contaOmie } = await import("@/lib/omie/contas");
      const { key, secret } = contaOmie("Nova Tratores");
      await omiePorta({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, "/servicos/os/", "AlterarOS",
        { Cabecalho: { nCodOS: Number(os.omie_ncodos) }, InformacoesAdicionais: { cNumPedido: refPedidoNaOS(numNovo, acc.name) } }, { gravacao: true, tentativas: 0 });
    } catch (e) { avisos.push(`Não gravei o pedido ${numNovo} na OS ${numOS} (OS faturada não aceita alteração): ${e instanceof Error ? e.message : e}`); }
  }

  // portal: PPV ligado à cópia, de volta para "Enviado Omie"
  historico[i] = { ...ult, pendenteDuplicar: false, novoPedido: numNovo };
  const { error } = await supabase.from("pedidos").update({
    pedido_omie: String(numNovo).padStart(15, "0"), omie_empresa: acc.name,
    faturado_omie_em: null, nf_numero: null, nf_sefaz: null, status: "Enviado Omie",
    faturamento_anterior: historico,
  }).eq("id_pedido", idPPV);
  if (error) return { ok: false, antigo: String(ult.pedidoOmie), novo: numNovo, erro: `O pedido novo ${numNovo} está no Omie, mas o portal não ligou (${error.message}). Avise o T.I.` };
  if (os) {
    const pv = String(os.Pedido_Venda || "").split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith(`${idPPV}:`));
    await supabase.from(TBL_OS).update({ Pedido_Venda: [...pv, `${idPPV}:${String(numNovo).padStart(15, "0")}`].join(", ") }).eq("Id_Ordem", String(os.Id_Ordem)).then(() => {}, () => {});
  }
  await registrarLog(idPPV, `Pedido refeito no Omie: ${ult.pedidoOmie} (cancelado) → ${numNovo}. Voltou para "Enviado Omie".`, usuario).catch(() => {});
  return { ok: true, antigo: String(ult.pedidoOmie), novo: numNovo, avisos };
}
