// "Cancelar nota e refazer" (José, 14–15/10/2026): a OS do portal já faturada
// precisa de outra nota. Mantém a OS do portal e os PPVs (a NF-e das peças fica).
//
// Ordem (escrita REAL):
//   1) confere: OS faturada no portal e no Omie; pega a chave da NFS-e (StatusOS);
//   2) CANCELA A NFS-e NO SISTEMA NACIONAL (evento e101101, certificado da empresa).
//      Se o governo recusar, para aqui — nada muda;
//   3) portal: marca a nota como cancelada e guarda o protocolo no histórico;
//   4) Omie: DuplicarOS (a OS nova) e CancelarOS da antiga SEM mexer na nota
//      (cCancelarNfse=N — ela já foi cancelada no governo). O Omie cancela o
//      título a receber junto. Se o Omie falhar, a nota continua cancelada e a
//      tela diz exatamente o que fazer no Omie;
//   5) portal: liga a OS nova (volta para "Cobrando Cliente"); Pasta Clientes
//      marca a antiga como cancelada.
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import { omie as omiePorta } from "@/lib/omie/porta";
import { cancelarNfseNacional, MOTIVOS_CANCELAMENTO, type MotivoCancelamento } from "@/lib/nfse/nacional";

type Rec = Record<string, unknown>;
interface OsOmie {
  Cabecalho?: { nCodOS?: number; cNumOS?: string; cCodIntOS?: string; nCodCli?: number; cEtapa?: string };
  InfoCadastro?: { cFaturada?: string; cCancelada?: string };
  InformacoesAdicionais?: { cNumPedido?: string };
}
interface StatusOS { cFaturada?: string; cCancelada?: string; ListaRpsNfse?: { cCodVerif?: string; nNfse?: string; cStatusRps?: string }[] }
export interface ResultadoRefaturar {
  ok: boolean; erro?: string; antiga?: string; nova?: string; nfse?: string; avisos?: string[];
  /** a nota foi cancelada no governo mas o Omie não terminou — o que fazer lá */
  pendenteOmie?: string;
}

const semZeros = (n: unknown) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");
const cred = () => { const { key, secret } = contaOmie("Nova Tratores"); return { appKey: key, appSecret: secret, rotulo: "Nova Tratores" }; };
const ler = <T,>(endpoint: string, call: string, param: Rec) => omiePorta<T>(cred(), endpoint, call, param, { prioridade: "pessoa" });
const escrever = <T,>(endpoint: string, call: string, param: Rec) => omiePorta<T>(cred(), endpoint, call, param, { prioridade: "pessoa", gravacao: true, tentativas: 0, timeoutMs: 90_000 });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function logOS(id: string, acao: string, usuario: string) {
  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: id, Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR"),
    UsuEmail: usuario, acao, Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  }).then(() => {}, () => {});
}

export async function cancelarERefazerOS(idOrdem: string, opts: { motivo: MotivoCancelamento; texto: string; usuario: string }): Promise<ResultadoRefaturar> {
  const texto = String(opts.texto || "").replace(/\s+/g, " ").trim();
  if (!MOTIVOS_CANCELAMENTO[opts.motivo]) return { ok: false, erro: "Escolha o motivo do cancelamento." };
  if (texto.length < 15) return { ok: false, erro: "Explique o motivo com pelo menos 15 letras (vai para o sistema nacional)." };
  const { data: rows, error: e0 } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOrdem).limit(1);
  if (e0) return { ok: false, erro: e0.message };
  const os = rows?.[0] as Rec | undefined;
  if (!os) return { ok: false, erro: "OS não encontrada." };
  if (!("faturamento_anterior" in os)) return { ok: false, erro: "Falta rodar o sql/pos-refaturar.sql no Supabase. Nada foi cancelado." };
  if (!os.faturado_omie_em) return { ok: false, erro: "Esta OS não está faturada pelo portal." };
  const nAntiga = Number(os.omie_ncodos || 0);
  if (!nAntiga) return { ok: false, erro: "A OS não tem o código do Omie gravado — confira no Omie antes." };
  const numAntiga = semZeros(os.Ordem_Omie);

  // 1) a nota no Omie: chave de acesso da NFS-e
  let st: StatusOS;
  try { st = await ler<StatusOS>("/servicos/os/", "StatusOS", { nCodOS: nAntiga }); }
  catch (e) { return { ok: false, erro: `Não consegui ler a OS no Omie: ${e instanceof Error ? e.message : e}` }; }
  const rps = (st.ListaRpsNfse || []).find((r) => /^\d{50}$/.test(String(r.cCodVerif || "")));
  if (!rps) return { ok: false, erro: `Não achei a chave da NFS-e da OS ${numAntiga} no Omie. Nada foi cancelado.` };
  const chave = String(rps.cCodVerif);
  const nfse = semZeros(rps.nNfse) || String(os.nfse_numero || "");

  // 2) cancela no sistema nacional
  const canc = await cancelarNfseNacional({ chave, motivo: opts.motivo, texto });
  if (!canc.ok && !canc.jaCancelada) {
    return { ok: false, erro: `O sistema nacional não cancelou a NFS-e ${nfse}: ${canc.erro}. Nada foi alterado.` };
  }

  // 3) portal: nota cancelada + histórico (antes de mexer no Omie — fica registrado mesmo se o Omie falhar)
  const historico = Array.isArray(os.faturamento_anterior) ? os.faturamento_anterior as Rec[] : [];
  const anterior: Rec = {
    ordemOmie: numAntiga, nCodOS: nAntiga, nfse, chave, nfseLink: os.nfse_link || null,
    faturadoEm: os.faturado_omie_em, faturadoPor: os.faturado_por || null, forma: os.forma_pagamento || null,
    canceladaEm: new Date().toISOString(), canceladaPor: opts.usuario,
    motivo: `${opts.motivo} - ${MOTIVOS_CANCELAMENTO[opts.motivo]}: ${texto}`,
    protocoloXml: canc.eventoXml || (canc.jaCancelada ? "já estava cancelada no sistema nacional" : null),
  };
  const { error: e1 } = await supabase.from(TBL_OS).update({
    faturamento_status: "nfse_cancelada", faturamento_erro: null, faturamento_anterior: [...historico, anterior],
  }).eq("Id_Ordem", idOrdem);
  if (e1) return { ok: false, nfse, erro: `A NFS-e ${nfse} FOI CANCELADA no sistema nacional, mas o portal não gravou (${e1.message}). Avise o T.I. — não tente de novo.` };
  await supabase.from("portal_nt_clientes_os").update({ cancelada: true, status: "Cancelada" }).eq("cod_os", nAntiga).then(() => {}, () => {});
  await logOS(idOrdem, `NFS-e ${nfse} cancelada no sistema nacional (OS ${numAntiga}). Motivo: ${anterior.motivo}`, opts.usuario);

  // 4) Omie: OS nova (cópia) + cancela a antiga sem mexer na nota
  const avisos: string[] = [];
  const pendente = (oQue: string) => ({ ok: false, nfse, antiga: numAntiga, pendenteOmie: oQue,
    erro: `A NFS-e ${nfse} foi cancelada no sistema nacional, mas o Omie não terminou: ${oQue}` });
  let nova: OsOmie;
  try {
    const r = await escrever<{ nCodOS?: number }>("/servicos/osp/", "DuplicarOS", { nCodOS: nAntiga });
    if (!r?.nCodOS || r.nCodOS === nAntiga) return pendente(`no Omie, duplique a OS ${numAntiga} e cancele a ${numAntiga} SEM cancelar a nota (ela já foi cancelada).`);
    await espera(1500);
    nova = await ler<OsOmie>("/servicos/os/", "ConsultarOS", { nCodOS: r.nCodOS });
  } catch (e) {
    return pendente(`o Omie recusou duplicar (${e instanceof Error ? e.message : e}). No Omie, duplique a OS ${numAntiga} e cancele a ${numAntiga} SEM cancelar a nota.`);
  }
  const nNova = Number(nova.Cabecalho?.nCodOS || 0);
  const numNova = semZeros(nova.Cabecalho?.cNumOS);
  try {
    await escrever("/servicos/osp/", "CancelarOS", { nCodOS: nAntiga, cCancelarNfse: "N" });
  } catch (e) {
    avisos.push(`O Omie não cancelou a OS ${numAntiga} (${e instanceof Error ? e.message : e}). Cancele no Omie SEM cancelar a nota — o título a receber dela também precisa sair.`);
  }
  const pedidos = String(os.Pedido_Venda || "").split(",").map((x) => semZeros(String(x.split(":").pop() || ""))).filter(Boolean).join(", ").slice(0, 15);
  if (pedidos && semZeros(nova.InformacoesAdicionais?.cNumPedido) !== pedidos) {
    try { await escrever("/servicos/os/", "AlterarOS", { Cabecalho: { nCodOS: nNova }, InformacoesAdicionais: { cNumPedido: pedidos } }); }
    catch { avisos.push(`Não gravei o nº do pedido (${pedidos}) na OS ${numNova} — preencha no Omie.`); }
  }

  // 5) portal: liga a OS nova (a trava libera porque a nota está cancelada)
  const { error: e2 } = await supabase.from(TBL_OS).update({
    Ordem_Omie: numNova, id_omie: numNova, omie_ncodos: nNova, omie_ccodint: String(nova.Cabecalho?.cCodIntOS || ""),
    faturado_omie_em: null, faturado_por: null, nfse_numero: null, nfse_link: null,
    faturamento_status: null, faturamento_erro: null, faturando_desde: null,
    Status: "Cobrando Cliente",
  }).eq("Id_Ordem", idOrdem);
  if (e2) return { ok: false, nfse, antiga: numAntiga, nova: numNova, erro: `Nota cancelada e OS nova ${numNova} criada no Omie, mas o portal não ligou a OS nova (${e2.message}). Avise o T.I.` };
  const { data: depois } = await supabase.from(TBL_OS).select("Ordem_Omie").eq("Id_Ordem", idOrdem).limit(1);
  if (semZeros(depois?.[0]?.Ordem_Omie) !== numNova) avisos.push(`O portal não trocou o nº do Omie para ${numNova} (trava do banco). Avise o T.I.`);

  await logOS(idOrdem, `OS refeita no Omie: ${numAntiga} (cancelada) → ${numNova}. A OS voltou para Cobrando Cliente.`, opts.usuario);
  return { ok: true, nfse, antiga: numAntiga, nova: numNova, avisos };
}
