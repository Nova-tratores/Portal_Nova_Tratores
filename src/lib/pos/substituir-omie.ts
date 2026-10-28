// SUBSTITUIR a OS ou o pedido de venda que a OS do portal tem no Omie (José, 13/10/2026).
//
// Dois jeitos:
//   • "duplicar" → duplica o documento atual no Omie e usa a cópia;
//   • "outro"    → usa um documento que JÁ existe no Omie (o usuário informa o nº).
// O substituído é SEMPRE cancelado. Depois o cruzamento do "Nº do pedido do
// cliente" é refeito: a OS recebe o(s) nº do(s) pedido(s) e cada pedido recebe o
// nº da OS.
//
// Segurança (escrita REAL no Omie):
//   1) confere tudo ANTES de mexer (não faturado, mesmo cliente, mesma conta);
//   2) cria/acha o novo; 3) cancela o antigo — se o cancelamento falhar e o novo
//      foi duplicado por nós, cancela a cópia (desfaz) e nada muda no portal;
//   4) só então troca o vínculo no portal e refaz o cruzamento (best-effort).
// Documento faturado não é substituído aqui (cancelar a nota é outro fluxo).
import { refPedidoNaOS, refOSNoPedido } from "@/lib/pos/pedido-cliente";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import {
  resolverContaDoPedido, omieNaConta, consultarPedidoOmie, getAccount,
  type OmieAccount, type OmiePedidoConsulta,
} from "@/lib/ppv/omie";
import { registrarLog } from "@/lib/ppv/queries";

export type ModoSubstituir = "duplicar" | "outro";
export interface ResultadoSubstituir {
  ok: boolean;
  erro?: string;
  antigo?: string;
  novo?: string;
  avisos?: string[];
}

const semZeros = (n: unknown) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");
const ETAPA_FATURADO = 50;

interface OsOmie {
  Cabecalho?: { nCodOS?: number; cNumOS?: string; cCodIntOS?: string; nCodCli?: number; cEtapa?: string };
  InfoCadastro?: { cFaturada?: string; cCancelada?: string };
  InformacoesAdicionais?: { cNumPedido?: string };
}

// A OS do portal mora na conta da Nova (é onde o POS cria as OS)
const contaOS = (): OmieAccount => ({ name: "Nova Tratores", ...contaOmie("Nova Tratores") } as OmieAccount);
const osCall = <T>(call: string, param: Record<string, unknown>, endpoint = "/servicos/os/") => omieNaConta<T>(contaOS(), endpoint, call, param);

async function consultarOS(chave: Record<string, unknown>): Promise<OsOmie | null> {
  try { return await osCall<OsOmie>("ConsultarOS", chave); } catch { return null; }
}

async function logOS(idOrdem: string, acao: string, usuario: string) {
  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: idOrdem, Data_Acao: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    UsuEmail: usuario, acao,
  }).then(() => {}, () => {});
}

/** Lê a OS do portal + os PPVs vinculados (com o pedido no Omie). */
async function carregarOS(idOrdem: string) {
  const { data } = await supabase.from(TBL_OS)
    .select("Id_Ordem, Ordem_Omie, omie_ncodos, omie_ccodint, faturado_omie_em, ID_PPV, Os_Cliente")
    .eq("Id_Ordem", idOrdem).maybeSingle();
  if (!data) return null;
  const ppvIds = String(data.ID_PPV || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data: ppvs } = ppvIds.length
    ? await supabase.from("pedidos").select("id_pedido, pedido_omie, omie_empresa, faturado_omie_em, status, Tipo_Pedido").in("id_pedido", ppvIds)
    : { data: [] as Record<string, unknown>[] };
  return { os: data as Record<string, unknown>, ppvs: (ppvs || []) as Record<string, unknown>[] };
}

/** A OS atual no Omie (pelo nCodOS gravado; senão pelo nº conferido). */
async function osAtualNoOmie(os: Record<string, unknown>): Promise<OsOmie | null> {
  const num = semZeros(os.Ordem_Omie);
  if (os.omie_ncodos) {
    const r = await consultarOS({ nCodOS: Number(os.omie_ncodos) });
    if (r && semZeros(r.Cabecalho?.cNumOS) === num) return r;
  }
  return num ? consultarOS({ cNumOS: num }) : null;
}

/** Refaz o cruzamento do "Nº do pedido do cliente" da OS e dos pedidos (best-effort). */
export async function cruzarNumeros(nCodOS: number, numOS: string, pedidos: { acc: OmieAccount; pedido: OmiePedidoConsulta }[], avisos: string[]) {
  const nums = pedidos.map((p) => refPedidoNaOS(p.pedido.cabecalho?.numero_pedido, p.acc.name)).filter(Boolean).join(", ");
  try {
    await osCall("AlterarOS", { Cabecalho: { nCodOS }, InformacoesAdicionais: { cNumPedido: nums.slice(0, 15) } });
  } catch (e) { avisos.push(`Não gravei o nº do pedido na OS ${numOS}: ${e instanceof Error ? e.message : e}`); }
  for (const { acc, pedido } of pedidos) {
    const cod = pedido.cabecalho?.codigo_pedido;
    if (!cod) continue;
    try {
      await omieNaConta(acc, "/produtos/pedido/", "AlterarPedidoVenda", { cabecalho: { codigo_pedido: cod }, informacoes_adicionais: { numero_pedido_cliente: refOSNoPedido(numOS, acc.name) } });
    } catch (e) { avisos.push(`Não gravei o nº da OS no pedido ${semZeros(pedido.cabecalho?.numero_pedido)}: ${e instanceof Error ? e.message : e}`); }
  }
}

export async function pedidosDaOS(ppvs: Record<string, unknown>[]) {
  const lista: { acc: OmieAccount; pedido: OmiePedidoConsulta }[] = [];
  for (const p of ppvs) {
    if (!p.pedido_omie || p.status === "Cancelada") continue;
    const r = await resolverContaDoPedido(String(p.id_pedido), (p.omie_empresa as string) || null);
    if (r) lista.push(r);
  }
  return lista;
}

// ───────────────────────── ORDEM DE SERVIÇO ─────────────────────────
export async function substituirOS(idOrdem: string, opts: { modo: ModoSubstituir; numeroNovo?: string; motivo: string; usuario: string }): Promise<ResultadoSubstituir> {
  const motivo = String(opts.motivo || "").trim();
  if (!motivo) return { ok: false, erro: "Informe o motivo da substituição." };
  const dados = await carregarOS(idOrdem);
  if (!dados) return { ok: false, erro: "OS não encontrada no portal." };
  const { os, ppvs } = dados;
  if (!os.Ordem_Omie) return { ok: false, erro: "Esta OS ainda não foi enviada ao Omie." };
  if (os.faturado_omie_em) return { ok: false, erro: "Esta OS já foi faturada. Para trocar, primeiro cancele a nota (NFS-e)." };

  const antiga = await osAtualNoOmie(os);
  const nAntiga = Number(antiga?.Cabecalho?.nCodOS || 0);
  if (!antiga || !nAntiga) return { ok: false, erro: `Não achei a OS ${semZeros(os.Ordem_Omie)} no Omie.` };
  if (antiga.InfoCadastro?.cFaturada === "S") return { ok: false, erro: `A OS ${semZeros(os.Ordem_Omie)} já está faturada no Omie. Cancele a nota antes.` };
  if (antiga.InfoCadastro?.cCancelada === "S") return { ok: false, erro: `A OS ${semZeros(os.Ordem_Omie)} já está cancelada no Omie — use "Escolher outra" para ligar a OS certa.` };

  // 1) a NOVA OS
  let nova: OsOmie | null = null;
  let duplicadaPorNos = false;
  if (opts.modo === "duplicar") {
    try {
      const r = await osCall<{ nCodOS?: number }>("DuplicarOS", { nCodOS: nAntiga }, "/servicos/osp/");
      if (!r?.nCodOS || r.nCodOS === nAntiga) return { ok: false, erro: "O Omie não devolveu a OS duplicada." };
      nova = await consultarOS({ nCodOS: r.nCodOS });
      duplicadaPorNos = true;
    } catch (e) { return { ok: false, erro: `O Omie recusou duplicar a OS: ${e instanceof Error ? e.message : e}` }; }
    if (!nova) return { ok: false, erro: "Dupliquei a OS mas não consegui consultá-la no Omie — confira lá antes de tentar de novo." };
  } else {
    const num = semZeros(opts.numeroNovo);
    if (!num) return { ok: false, erro: "Informe o nº da OS no Omie que vai substituir." };
    if (num === semZeros(os.Ordem_Omie)) return { ok: false, erro: "Esse é o nº da OS atual." };
    nova = await consultarOS({ cNumOS: num });
    if (!nova?.Cabecalho?.nCodOS) return { ok: false, erro: `Não achei a OS ${num} no Omie (conta Nova Tratores).` };
    if (nova.InfoCadastro?.cCancelada === "S") return { ok: false, erro: `A OS ${num} está cancelada no Omie.` };
    if (nova.InfoCadastro?.cFaturada === "S") return { ok: false, erro: `A OS ${num} já está faturada no Omie.` };
    if (Number(nova.Cabecalho.nCodCli) !== Number(antiga.Cabecalho?.nCodCli)) return { ok: false, erro: `A OS ${num} é de outro cliente no Omie.` };
    const { data: jaUsada } = await supabase.from(TBL_OS).select("Id_Ordem").eq("omie_ncodos", nova.Cabecalho.nCodOS).neq("Id_Ordem", idOrdem).limit(1);
    if (jaUsada?.length) return { ok: false, erro: `A OS ${num} do Omie já está ligada à ${jaUsada[0].Id_Ordem} no portal.` };
  }
  const nNova = Number(nova.Cabecalho?.nCodOS);
  const numNova = semZeros(nova.Cabecalho?.cNumOS);

  // 2) cancela a ANTIGA (sem mexer em NFS-e — ela não foi faturada)
  try {
    await osCall("CancelarOS", { nCodOS: nAntiga, cCancelarNfse: "N" }, "/servicos/osp/");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (duplicadaPorNos) {
      try { await osCall("CancelarOS", { nCodOS: nNova, cCancelarNfse: "N" }, "/servicos/osp/"); }
      catch { return { ok: false, erro: `O Omie recusou cancelar a OS ${semZeros(os.Ordem_Omie)} (${msg}) e a cópia ${numNova} NÃO pôde ser cancelada — cancele a ${numNova} no Omie.` }; }
    }
    return { ok: false, erro: `O Omie recusou cancelar a OS ${semZeros(os.Ordem_Omie)}: ${msg}. Nada foi trocado.` };
  }

  // 3) troca o vínculo no portal
  const { error } = await supabase.from(TBL_OS).update({
    Ordem_Omie: numNova, id_omie: numNova, omie_ncodos: nNova, omie_ccodint: String(nova.Cabecalho?.cCodIntOS || ""),
  }).eq("Id_Ordem", idOrdem);
  if (error) return { ok: false, erro: `A OS ${semZeros(os.Ordem_Omie)} foi cancelada e a ${numNova} é a nova no Omie, mas o portal não gravou (${error.message}). Avise o T.I.` };

  // 4) cruzamento dos números
  const avisos: string[] = [];
  await cruzarNumeros(nNova, numNova, await pedidosDaOS(ppvs), avisos);
  await logOS(idOrdem, `OS do Omie substituída: ${semZeros(os.Ordem_Omie)} (cancelada) → ${numNova} (${opts.modo === "duplicar" ? "duplicada" : "escolhida"}) — motivo: ${motivo}`, opts.usuario);
  return { ok: true, antigo: semZeros(os.Ordem_Omie), novo: numNova, avisos };
}

// ───────────────────────── PEDIDO DE VENDA ─────────────────────────
export async function substituirPedido(idOrdem: string, idPPV: string, opts: { modo: ModoSubstituir; numeroNovo?: string; motivo: string; usuario: string }): Promise<ResultadoSubstituir> {
  const motivo = String(opts.motivo || "").trim();
  if (!motivo) return { ok: false, erro: "Informe o motivo da substituição." };
  const dados = await carregarOS(idOrdem);
  if (!dados) return { ok: false, erro: "OS não encontrada no portal." };
  const ppv = dados.ppvs.find((p) => p.id_pedido === idPPV);
  if (!ppv) return { ok: false, erro: `O ${idPPV} não está vinculado a esta OS.` };
  if (!ppv.pedido_omie) return { ok: false, erro: `O ${idPPV} ainda não foi enviado ao Omie.` };
  if (ppv.faturado_omie_em) return { ok: false, erro: `O pedido ${semZeros(ppv.pedido_omie)} já foi faturado. Para trocar, primeiro cancele a NF-e.` };

  const achado = await resolverContaDoPedido(idPPV, (ppv.omie_empresa as string) || null);
  if (!achado?.pedido.cabecalho?.codigo_pedido) return { ok: false, erro: `Não achei o pedido ${semZeros(ppv.pedido_omie)} no Omie.` };
  const { acc } = achado;
  const antigo = achado.pedido;
  const nAntigo = Number(antigo.cabecalho!.codigo_pedido);
  const numAntigo = semZeros(antigo.cabecalho?.numero_pedido);
  if (Number(antigo.cabecalho?.etapa || 0) >= ETAPA_FATURADO) return { ok: false, erro: `O pedido ${numAntigo} está na etapa de faturamento no Omie. Cancele a NF-e antes.` };

  // 1) o NOVO pedido
  let novo: OmiePedidoConsulta | null = null;
  let duplicadoPorNos = false;
  if (opts.modo === "duplicar") {
    try {
      const r = await omieNaConta<{ nCodPed?: number }>(acc, "/produtos/pedidovendafat/", "DuplicarPedidoVenda", { nCodPed: nAntigo, ...(antigo.cabecalho?.codigo_pedido_integracao ? { cCodIntPed: String(antigo.cabecalho.codigo_pedido_integracao) } : {}) });
      if (!r?.nCodPed || r.nCodPed === nAntigo) return { ok: false, erro: "O Omie não devolveu o pedido duplicado." };
      novo = await consultarPedidoOmie({ codigo_pedido: r.nCodPed }, acc);
      duplicadoPorNos = true;
    } catch (e) { return { ok: false, erro: `O Omie recusou duplicar o pedido: ${e instanceof Error ? e.message : e}` }; }
    if (!novo) return { ok: false, erro: "Dupliquei o pedido mas não consegui consultá-lo no Omie — confira lá antes de tentar de novo." };
  } else {
    const num = semZeros(opts.numeroNovo);
    if (!num) return { ok: false, erro: "Informe o nº do pedido no Omie que vai substituir." };
    if (num === numAntigo) return { ok: false, erro: "Esse é o nº do pedido atual." };
    novo = await consultarPedidoOmie({ numero_pedido: num }, acc);
    if (!novo?.cabecalho?.codigo_pedido) return { ok: false, erro: `Não achei o pedido ${num} no Omie (${acc.name}).` };
    if (Number(novo.cabecalho.etapa || 0) >= ETAPA_FATURADO) return { ok: false, erro: `O pedido ${num} já está faturado/em faturamento no Omie.` };
    if (Number(novo.cabecalho.codigo_cliente) !== Number(antigo.cabecalho?.codigo_cliente)) return { ok: false, erro: `O pedido ${num} é de outro cliente no Omie.` };
    const { data: jaUsado } = await supabase.from("pedidos").select("id_pedido").eq("pedido_omie", num).eq("omie_empresa", acc.name).neq("id_pedido", idPPV).limit(1);
    if (jaUsado?.length) return { ok: false, erro: `O pedido ${num} já está ligado ao ${jaUsado[0].id_pedido} no portal.` };
  }
  const nNovo = Number(novo.cabecalho!.codigo_pedido);
  const numNovo = semZeros(novo.cabecalho?.numero_pedido);

  // 2) cancela o ANTIGO
  try {
    await omieNaConta(acc, "/produtos/pedidovendafat/", "CancelarPedidoVenda", { nCodPed: nAntigo, ...(antigo.cabecalho?.codigo_pedido_integracao ? { cCodIntPed: String(antigo.cabecalho.codigo_pedido_integracao) } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (duplicadoPorNos) {
      try { await omieNaConta(acc, "/produtos/pedidovendafat/", "CancelarPedidoVenda", { nCodPed: nNovo, ...(novo.cabecalho?.codigo_pedido_integracao ? { cCodIntPed: String(novo.cabecalho.codigo_pedido_integracao) } : {}) }); }
      catch { return { ok: false, erro: `O Omie recusou cancelar o pedido ${numAntigo} (${msg}) e a cópia ${numNovo} NÃO pôde ser cancelada — cancele o ${numNovo} no Omie.` }; }
    }
    return { ok: false, erro: `O Omie recusou cancelar o pedido ${numAntigo}: ${msg}. Nada foi trocado.` };
  }

  // 3) troca o vínculo no portal (o PPV passa a apontar pro pedido novo)
  const { error } = await supabase.from("pedidos").update({ pedido_omie: numNovo, omie_empresa: acc.name }).eq("id_pedido", idPPV);
  if (error) return { ok: false, erro: `O pedido ${numAntigo} foi cancelado e o ${numNovo} é o novo no Omie, mas o portal não gravou (${error.message}). Avise o T.I.` };
  await registrarLog(idPPV, `Pedido do Omie substituído: ${numAntigo} (cancelado) → ${numNovo} — motivo: ${motivo}`, opts.usuario);

  // a OS guarda "PPV:nº" em Pedido_Venda (a cobrança lê de lá) — refaz com o nº novo
  const avisos: string[] = [];
  const pv = dados.ppvs.filter((p) => p.pedido_omie && p.status !== "Cancelada")
    .map((p) => `${p.id_pedido}:${p.id_pedido === idPPV ? numNovo : semZeros(p.pedido_omie)}`).join(", ");
  const { error: ePv } = await supabase.from(TBL_OS).update({ Pedido_Venda: pv }).eq("Id_Ordem", idOrdem);
  if (ePv) avisos.push(`Não atualizei o nº do pedido na OS do portal (${ePv.message}).`);

  // 4) cruzamento: OS ganha a lista nova de pedidos; o novo pedido ganha o nº da OS
  const os = dados.os;
  const nOS = Number(os.omie_ncodos || 0) || Number((await osAtualNoOmie(os))?.Cabecalho?.nCodOS || 0);
  const outros = await pedidosDaOS(dados.ppvs.filter((p) => p.id_pedido !== idPPV));
  const todos = [...outros, { acc, pedido: novo }];
  if (nOS) await cruzarNumeros(nOS, semZeros(os.Ordem_Omie), todos, avisos);
  else avisos.push("Não achei a OS no Omie para atualizar o nº do pedido do cliente.");
  await logOS(idOrdem, `Pedido de venda do ${idPPV} substituído no Omie: ${numAntigo} (cancelado) → ${numNovo} (${opts.modo === "duplicar" ? "duplicado" : "escolhido"}) — motivo: ${motivo}`, opts.usuario);
  return { ok: true, antigo: numAntigo, novo: numNovo, avisos };
}

export { getAccount };
