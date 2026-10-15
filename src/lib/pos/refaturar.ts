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
import { cruzarNumeros, pedidosDaOS } from "@/lib/pos/substituir-omie";

type Rec = Record<string, unknown>;
interface OsOmie {
  Cabecalho?: { nCodOS?: number; cNumOS?: string; cCodIntOS?: string; nCodCli?: number; cEtapa?: string };
  InfoCadastro?: { cFaturada?: string; cCancelada?: string };
  InformacoesAdicionais?: { cNumPedido?: string };
}
interface StatusOS { cFaturada?: string; cCancelada?: string; ListaRpsNfse?: { cCodVerif?: string; nNfse?: string; cStatusRps?: string }[] }
export interface ResultadoRefaturar {
  ok: boolean; erro?: string; antiga?: string; nova?: string; nfse?: string; avisos?: string[];
  /** depois de cancelar: o próximo passo que a tela oferece */
  proximo?: "duplicar_os";
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

export async function cancelarNotaOS(idOrdem: string, opts: { motivo: MotivoCancelamento; texto: string; usuario: string }): Promise<ResultadoRefaturar> {
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
  // financeiro do portal: o título da OS antiga sai na hora (o sync com o Omie confirma depois)
  await supabase.from("contas_receber").update({ status_titulo: "CANCELADO" }).eq("conta_omie", "NOVA").eq("raw->>nCodOS", String(nAntiga)).then(() => {}, () => {});
  await logOS(idOrdem, `NFS-e ${nfse} cancelada no sistema nacional (OS ${numAntiga}). Motivo: ${anterior.motivo}`, opts.usuario);

  // a OS do Omie fica para o 2º passo ("Duplicar a OS"), que a tela oferece logo em seguida
  return { ok: true, nfse, antiga: numAntiga, proximo: "duplicar_os" };
}

interface ItemListaOS { Cabecalho?: { nCodOS?: number; cNumOS?: string; cCodIntOS?: string; nCodCli?: number; nValorTotal?: number }; InfoCadastro?: { cFaturada?: string; cCancelada?: string } }

/** cópia da OS antiga já criada no Omie (aberta, mesmo cliente, depois da antiga, não ligada a outra OS do portal) */
async function acharCopia(nAntiga: number, nCodCli: number, idOrdem: string): Promise<ItemListaOS | null> {
  const p1 = await ler<{ total_de_paginas?: number }>("/servicos/os/", "ListarOS", { pagina: 1, registros_por_pagina: 50 });
  const tot = Number(p1.total_de_paginas || 1);
  const achadas: ItemListaOS[] = [];
  for (const pg of [tot, tot - 1].filter((x) => x >= 1)) {
    const r = await ler<{ osCadastro?: ItemListaOS[] }>("/servicos/os/", "ListarOS", { pagina: pg, registros_por_pagina: 50 });
    achadas.push(...(r.osCadastro || []));
  }
  const cands = achadas.filter((o) => Number(o.Cabecalho?.nCodCli) === nCodCli && Number(o.Cabecalho?.nCodOS) > nAntiga
    && o.InfoCadastro?.cCancelada !== "S" && o.InfoCadastro?.cFaturada !== "S")
    .sort((a, b) => Number(b.Cabecalho?.nCodOS) - Number(a.Cabecalho?.nCodOS));
  for (const o of cands) {
    const { data } = await supabase.from(TBL_OS).select("Id_Ordem").eq("omie_ncodos", Number(o.Cabecalho?.nCodOS)).neq("Id_Ordem", idOrdem).limit(1);
    if (!data?.length) return o;
  }
  return null;
}

/**
 * 2º passo depois de cancelar a nota: "Duplicar a OS". Reaproveita a cópia se o
 * Omie já tiver criado (o DuplicarOS nem sempre devolve o código da nova), senão
 * duplica; cancela a antiga SÓ no Omie (a nota já foi cancelada no governo) e
 * liga a OS do portal à nova, que volta para "Cobrando Cliente".
 */
export async function refazerOSNoOmie(idOrdem: string, usuario: string): Promise<ResultadoRefaturar> {
  const { data: rows } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOrdem).limit(1);
  const os = rows?.[0] as Rec | undefined;
  if (!os) return { ok: false, erro: "OS não encontrada." };
  if (os.faturamento_status !== "nfse_cancelada") return { ok: false, erro: "A nota desta OS não está cancelada — use \"Cancelar nota\" antes." };
  const nAntiga = Number(os.omie_ncodos || 0);
  const numAntiga = semZeros(os.Ordem_Omie);
  if (!nAntiga) return { ok: false, erro: "A OS não tem o código do Omie gravado." };

  let antiga: OsOmie;
  try { antiga = await ler<OsOmie>("/servicos/os/", "ConsultarOS", { nCodOS: nAntiga }); }
  catch (e) { return { ok: false, erro: `Não consegui ler a OS ${numAntiga} no Omie: ${e instanceof Error ? e.message : e}` }; }
  const nCodCli = Number(antiga.Cabecalho?.nCodCli || 0);

  // 1) a cópia: reaproveita a que já existe ou duplica agora
  let copia: ItemListaOS | null = null;
  try { copia = await acharCopia(nAntiga, nCodCli, idOrdem); } catch { /* tenta duplicar */ }
  if (!copia) {
    try { await escrever("/servicos/osp/", "DuplicarOS", { nCodOS: nAntiga }); }
    catch (e) { return { ok: false, erro: `O Omie recusou duplicar a OS ${numAntiga}: ${e instanceof Error ? e.message : e}` }; }
    await espera(2500);
    try { copia = await acharCopia(nAntiga, nCodCli, idOrdem); } catch { /* abaixo */ }
    if (!copia) return { ok: false, erro: `Pedi ao Omie para duplicar a OS ${numAntiga}, mas não achei a cópia. Confira no Omie e tente de novo (o portal reaproveita a cópia se ela existir).` };
  }
  const nNova = Number(copia.Cabecalho?.nCodOS);
  const numNova = semZeros(copia.Cabecalho?.cNumOS);
  const avisos: string[] = [];

  // 2) cancela a antiga só no Omie (a nota já foi cancelada no governo; o título sai junto)
  if (antiga.InfoCadastro?.cCancelada !== "S") {
    try { await escrever("/servicos/osp/", "CancelarOS", { nCodOS: nAntiga, cCancelarNfse: "N" }); }
    catch (e) { avisos.push(`O Omie não cancelou a OS ${numAntiga} (${e instanceof Error ? e.message : e}). Cancele no Omie SEM cancelar a nota — o título a receber dela também precisa sair.`); }
  }
  // 3) vínculo cruzado no Omie: a OS nova cita o(s) pedido(s) de venda e cada pedido
  //    passa a citar a OS nova no "Nº do pedido do cliente" (é por aí que a Pasta
  //    Clientes junta serviço + peças). Pedido já faturado pode recusar: vira aviso.
  try {
    const { data: ppvs } = await supabase.from("pedidos").select("id_pedido, pedido_omie, status, omie_empresa").eq("Id_Os", idOrdem);
    const lista = await pedidosDaOS((ppvs || []) as Record<string, unknown>[]);
    if (lista.length) await cruzarNumeros(nNova, numNova, lista, avisos);
  } catch (e) { avisos.push(`Não refiz o vínculo OS × pedido no Omie (${e instanceof Error ? e.message : e}).`); }
  // código de integração "OS-0729-5376" (a conferência de identidade aceita esse formato);
  // se o Omie não deixar trocar, o portal grava o que estiver lá
  let ccodint = String(copia.Cabecalho?.cCodIntOS || "");
  if (!ccodint) {
    try {
      await escrever("/servicos/os/", "AlterarOS", { Cabecalho: { nCodOS: nNova, cCodIntOS: `${idOrdem}-${numNova}` } });
      const conf = await ler<OsOmie>("/servicos/os/", "ConsultarOS", { nCodOS: nNova });
      ccodint = String(conf.Cabecalho?.cCodIntOS || "");
    } catch { /* fica sem código */ }
  }

  // 4) portal: liga a OS nova (a trava libera porque a nota está cancelada)
  const historico = Array.isArray(os.faturamento_anterior) ? [...(os.faturamento_anterior as Rec[])] : [];
  if (historico.length) historico[historico.length - 1] = { ...historico[historico.length - 1], novaOmie: numNova };
  const { error: e2 } = await supabase.from(TBL_OS).update({
    Ordem_Omie: numNova, id_omie: numNova, omie_ncodos: nNova, omie_ccodint: ccodint || null,
    faturado_omie_em: null, faturado_por: null, nfse_numero: null, nfse_link: null,
    faturamento_status: null, faturamento_erro: null, faturando_desde: null,
    faturamento_anterior: historico, Status: "Cobrando Cliente",
  }).eq("Id_Ordem", idOrdem);
  if (e2) return { ok: false, antiga: numAntiga, nova: numNova, erro: `A OS nova ${numNova} está no Omie, mas o portal não ligou (${e2.message}). Avise o T.I.` };
  const { data: depois } = await supabase.from(TBL_OS).select("Ordem_Omie").eq("Id_Ordem", idOrdem).limit(1);
  if (semZeros(depois?.[0]?.Ordem_Omie) !== numNova) avisos.push(`O portal não trocou o nº do Omie para ${numNova} (trava do banco). Avise o T.I.`);

  await logOS(idOrdem, `OS refeita no Omie: ${numAntiga} (cancelada) → ${numNova}. A OS voltou para Cobrando Cliente.`, usuario);
  return { ok: true, antiga: numAntiga, nova: numNova, avisos };
}
