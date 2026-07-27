// =====================================================================
// REGISTRO DE DESPESA DE ALIMENTAÇÃO AO FECHAR OS
//
// Ao fechar uma Ordem_Servico (Status='Concluída'), cada item do array
// `Alimentacoes` (data, valor, técnicos) que ainda não tenha despesa
// vinculada vira uma Requisicao tipo='Alimentação' já em status='financeiro',
// usando a DATA informada na alimentação.
//
// Compat: se `Alimentacoes` estiver vazio mas houver o campo agregado antigo
// (Alimentacao_Tecnico + Alimentacao_Valor > 0), cria 1 despesa como antes.
//
// Idempotência: por OS + data + valor (não duplica ao reconcluir).
// =====================================================================

import { supabase } from "./supabase";
import { TBL_OS } from "./constants";
import type { AlimentacaoItem } from "./types";

export interface RegistroAlimentacaoResult {
  criada: boolean;
  criadas: number;
  pulado: boolean;
  motivoPulado?: string;
  requisicaoId?: number;
}

function parseValor(v: string | number | null | undefined): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ── Helpers reutilizados pelas rotas POST/PATCH ──
export function normalizarAlimentacoes(raw: unknown): AlimentacaoItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .map((a) => ({
      data: typeof a?.data === "string" ? a.data.slice(0, 10) : "",
      valor: parseValor(a?.valor),
      tecnicos: Array.isArray(a?.tecnicos) ? a.tecnicos.filter(Boolean).slice(0, 2) : [],
      no_pdf: !!a?.no_pdf,
      // nota anexada pelo admin no portal — NUNCA descartar no round-trip
      foto: typeof a?.foto === "string" && a.foto ? a.foto : null,
    }))
    .filter((a) => a.valor > 0 || a.foto);
}

export function agregadosAlimentacao(lista: AlimentacaoItem[]) {
  const valor = lista.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  return { tecnico: lista.length > 0, valor, noPdf: lista.some((a) => a.no_pdf) };
}

interface OSMin {
  Id_Ordem: string;
  Status?: string | null;
  Os_Tecnico?: string | null;
  Os_Tecnico2?: string | null;
  Alimentacoes?: unknown;
  Alimentacao_Tecnico?: boolean | null;
  Alimentacao_Valor?: string | number | null;
  Projeto?: string | null;
  Cnpj_Cliente?: string | null;
  Os_Cliente?: string | null;
  Data?: string | null;
}

// foto_nf da Requisicao aceita URL completa OU path do bucket 'requisicoes'
// (getUrlAnexo trata os dois). Se a URL é do nosso bucket, guarda só o path —
// é o formato que o RH também sabe montar.
function fotoNfDe(foto: string | null | undefined): string | null {
  if (!foto) return null;
  const marca = "/object/public/requisicoes/";
  const i = foto.indexOf(marca);
  return i >= 0 ? decodeURIComponent(foto.slice(i + marca.length)) : foto;
}

/**
 * Cria UMA despesa de alimentação (Requisicao tipo='Alimentação',
 * solicitante = técnico, recibo em foto_nf). O status depende do momento:
 * 'pedido' (primeira fase, em aberto — a OS ainda não concluiu) ou
 * 'financeiro' (OS concluída).
 */
async function criarRequisicaoAlimentacao(
  os: OSMin,
  item: AlimentacaoItem,
  status: "pedido" | "financeiro",
): Promise<number | null> {
  const setor = os.Cnpj_Cliente ? "Trator-Cliente" : "Trator-Loja";
  const tituloProjeto = os.Projeto ? ` (${os.Projeto})` : "";
  const agora = new Date();
  const dataItem = item.data || (os.Data || agora.toISOString().slice(0, 10));
  const tecnicos = item.tecnicos.length ? item.tecnicos : [os.Os_Tecnico || "Sistema"];

  const novaReq: Record<string, unknown> = {
    titulo: `Alimentação - OS ${os.Id_Ordem}${tituloProjeto}`,
    tipo: "Alimentação",
    setor,
    solicitante: tecnicos[0] || "Sistema",
    data: dataItem,
    status,
    valor_despeza: item.valor.toFixed(2).replace(".", ","),
    ordem_servico: os.Id_Ordem,
    origem: "auto_alimentacao_os",
    obs:
      status === "financeiro"
        ? `Despesa de alimentação (${dataItem}) registrada automaticamente (OS ${os.Id_Ordem})${tecnicos.length > 1 ? ` — técnicos: ${tecnicos.join(", ")}` : ""}.`
        : `Despesa de alimentação (${dataItem}) aberta automaticamente ao lançar a alimentação na OS ${os.Id_Ordem}${tecnicos.length > 1 ? ` — técnicos: ${tecnicos.join(", ")}` : ""}. Fica EM ABERTO (disponível pra desconto em folha, se for o caso) e vai pro financeiro quando a OS concluir.`,
  };
  if (status === "financeiro") novaReq.enviado_financeiro_data = agora.toISOString();
  const fotoNf = fotoNfDe(item.foto);
  if (fotoNf) novaReq.foto_nf = fotoNf;
  if (os.Projeto) novaReq.Chassis_Modelo = os.Projeto;
  if (os.Cnpj_Cliente && setor === "Trator-Cliente") novaReq.cliente = os.Os_Cliente || os.Cnpj_Cliente;

  const { data: inserida, error } = await supabase.from("Requisicao").insert(novaReq).select("id").single();
  if (error) {
    console.error(`[alimentacao-os] falhou criar Requisicao p/ OS ${os.Id_Ordem}:`, error.message);
    return null;
  }
  return inserida?.id ?? null;
}

export interface SyncAlimentacaoResult {
  criadas: number;
  atualizadas: number;
  promovidas: number;   // pedido -> financeiro (na conclusão da OS)
  removidas: number;    // item saiu da OS -> requisição em aberto vai pra lixeira
  pulado: boolean;
  motivoPulado?: string;
  ultimoId?: number;
}

/**
 * O MOTOR do fluxo automático de alimentação (pedido do usuário, 16/07):
 *
 *  - lançou a alimentação na OS  -> a Requisicao nasce NA HORA em
 *    status='pedido' (primeira fase, em aberto — dá pra descontar em folha
 *    se precisar), com os dados da OS, o técnico como solicitante e o valor;
 *  - editou valor/técnico/nota   -> a requisição em aberto acompanha;
 *  - removeu o item da OS        -> a requisição em aberto vai pra lixeira
 *    (reversível; a lixeira não exclui);
 *  - CONCLUIU a OS (promover)    -> vira status='financeiro' com o valor
 *    ATUALIZADO e a nota anexada (foto_nf).
 *
 * Idempotente: casa requisição <-> item pela DATA (uma despesa por dia por
 * OS; dois itens no mesmo dia somam). Requisição MANUAL de Alimentação na OS
 * desliga o automático (o humano venceu). Requisição já em 'financeiro'
 * nunca é rebaixada nem tem valor mexido fora da conclusão (só ganha nota).
 */
export async function sincronizarAlimentacaoOS(
  idOrdem: string,
  opts?: { promover?: boolean },
): Promise<SyncAlimentacaoResult> {
  const vazio: SyncAlimentacaoResult = { criadas: 0, atualizadas: 0, promovidas: 0, removidas: 0, pulado: true };

  const { data: osRes } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Os_Tecnico, Os_Tecnico2, Alimentacoes, Alimentacao_Tecnico, Alimentacao_Valor, Projeto, Cnpj_Cliente, Os_Cliente, Data")
    .eq("Id_Ordem", idOrdem)
    .limit(1);
  if (!osRes?.length) return { ...vazio, motivoPulado: `OS ${idOrdem} não encontrada` };
  const os = osRes[0] as OSMin;

  // OS CANCELADA -> as despesas automáticas EM ABERTO vão pra lixeira
  // (reversível) e nada é criado/atualizado. Requisição já em 'financeiro'
  // não é mexida (valor confirmado); manual segue com o humano.
  if (/cancelada/i.test((os.Status || "").trim())) {
    const { data: abertas } = await supabase
      .from("Requisicao")
      .select("id, obs")
      .eq("ordem_servico", idOrdem)
      .eq("origem", "auto_alimentacao_os")
      .in("status", ["pedido", "aguardando"]);
    const resumoCanc: SyncAlimentacaoResult = { criadas: 0, atualizadas: 0, promovidas: 0, removidas: 0, pulado: false };
    for (const r of abertas || []) {
      const { error } = await supabase
        .from("Requisicao")
        .update({
          status: "lixeira",
          obs: `${r.obs || ""}\n[auto] OS ${idOrdem} cancelada — despesa de alimentação arquivada na lixeira.`.trim(),
        })
        .eq("id", r.id);
      if (!error) resumoCanc.removidas++;
    }
    resumoCanc.pulado = resumoCanc.removidas === 0;
    if (resumoCanc.pulado) resumoCanc.motivoPulado = `OS ${idOrdem} cancelada — nada em aberto a arquivar`;
    return resumoCanc;
  }

  const promover = opts?.promover ?? (os.Status || "").trim() === "Concluída";

  // manual existente vence (o humano já cuidou)
  const { data: manual } = await supabase
    .from("Requisicao")
    .select("id")
    .eq("ordem_servico", idOrdem)
    .eq("tipo", "Alimentação")
    .neq("origem", "auto_alimentacao_os")
    .not("status", "in", '("lixeira","cancelada")')
    .limit(1);
  if (manual?.length) {
    return { ...vazio, motivoPulado: `Já há requisição manual de Alimentação (#${manual[0].id})` };
  }

  // itens da OS (compat: campo agregado antigo só entra na conclusão, como antes)
  let lista = normalizarAlimentacoes(os.Alimentacoes);
  if (lista.length === 0 && promover) {
    const valorAgg = parseValor(os.Alimentacao_Valor);
    if (os.Alimentacao_Tecnico && valorAgg > 0) {
      lista = [{ data: (os.Data || new Date().toISOString().slice(0, 10)), valor: valorAgg, tecnicos: [os.Os_Tecnico || "Sistema"], no_pdf: false, foto: null }];
    }
  }

  // agrupa por DATA (a chave do casamento requisição<->item)
  const porData = new Map<string, AlimentacaoItem>();
  for (const item of lista) {
    if (!(item.valor > 0)) continue; // nota sem valor lançado ainda não é despesa
    const dataItem = item.data || (os.Data || new Date().toISOString().slice(0, 10));
    const atual = porData.get(dataItem);
    porData.set(dataItem, atual
      ? { ...atual, valor: atual.valor + item.valor, foto: atual.foto || item.foto }
      : { ...item, data: dataItem });
  }

  const { data: autos } = await supabase
    .from("Requisicao")
    .select("id, data, valor_despeza, foto_nf, status, solicitante, obs")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os")
    .not("status", "in", '("lixeira","cancelada")');

  const resumo: SyncAlimentacaoResult = { criadas: 0, atualizadas: 0, promovidas: 0, removidas: 0, pulado: false };
  const agora = new Date();

  for (const [dataItem, item] of porData) {
    const existente = (autos || []).find((r: any) => String(r.data).slice(0, 10) === dataItem);
    if (!existente) {
      const id = await criarRequisicaoAlimentacao(os, item, promover ? "financeiro" : "pedido");
      if (id != null) { resumo.criadas++; resumo.ultimoId = id; }
      continue;
    }

    const patch: Record<string, unknown> = {};
    const jaFinanceiro = String(existente.status).toLowerCase() === "financeiro";
    const valorNovo = item.valor.toFixed(2).replace(".", ",");
    // valor/solicitante acompanham enquanto em aberto — e na conclusão (o
    // "atualiza o valor junto da nota" do pedido); financeiro fora da
    // conclusão não é mexido
    if ((!jaFinanceiro || promover) && parseValor(existente.valor_despeza).toFixed(2) !== item.valor.toFixed(2)) {
      patch.valor_despeza = valorNovo;
    }
    const solicitante = item.tecnicos[0] || os.Os_Tecnico || "Sistema";
    if (!jaFinanceiro && existente.solicitante !== solicitante) patch.solicitante = solicitante;
    const fotoNf = fotoNfDe(item.foto);
    if (fotoNf && fotoNf !== existente.foto_nf) patch.foto_nf = fotoNf;
    if (promover && !jaFinanceiro) {
      patch.status = "financeiro";
      patch.enviado_financeiro_data = agora.toISOString();
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("Requisicao").update(patch).eq("id", existente.id);
      if (!error) {
        if (patch.status === "financeiro") resumo.promovidas++;
        else resumo.atualizadas++;
      }
    }
    resumo.ultimoId = existente.id;
  }

  // item saiu da OS -> requisição EM ABERTO vai pra lixeira (nunca a financeiro)
  for (const r of autos || []) {
    const st = String(r.status).toLowerCase();
    if (st !== "pedido" && st !== "aguardando") continue;
    if (porData.has(String(r.data).slice(0, 10))) continue;
    const { error } = await supabase
      .from("Requisicao")
      .update({ status: "lixeira", obs: `${r.obs || ""}\n[auto] Item de alimentação removido da OS ${idOrdem} — despesa arquivada na lixeira.`.trim() })
      .eq("id", r.id);
    if (!error) resumo.removidas++;
  }

  resumo.pulado = resumo.criadas + resumo.atualizadas + resumo.promovidas + resumo.removidas === 0;
  if (resumo.pulado) resumo.motivoPulado = porData.size === 0 ? "OS sem alimentação a registrar" : "Nada novo a registrar";
  return resumo;
}

/**
 * Anexo de nota pelo admin: o chamador já gravou item.foto na OS — aqui só
 * roda o sync e devolve o estado da requisição daquele dia (pra mensagem).
 */
export async function registrarAlimentacaoItem(
  idOrdem: string,
  item: AlimentacaoItem,
): Promise<{ requisicaoId: number | null; criada: boolean; status?: string; motivo?: string }> {
  if (!(item.valor > 0)) {
    await sincronizarAlimentacaoOS(idOrdem); // ainda sincroniza os outros dias
    return { requisicaoId: null, criada: false, motivo: "Nota guardada — lance o VALOR da alimentação pra despesa abrir." };
  }
  const antes = await supabase
    .from("Requisicao")
    .select("id")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os")
    .eq("data", item.data)
    .not("status", "in", '("lixeira","cancelada")')
    .limit(1);
  const existiaAntes = !!antes.data?.length;

  const sync = await sincronizarAlimentacaoOS(idOrdem);
  if (sync.motivoPulado?.includes("manual")) {
    return { requisicaoId: null, criada: false, motivo: sync.motivoPulado };
  }

  const { data: depois } = await supabase
    .from("Requisicao")
    .select("id, status")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os")
    .eq("data", item.data)
    .not("status", "in", '("lixeira","cancelada")')
    .limit(1);
  const req = depois?.[0];
  return {
    requisicaoId: req?.id ?? null,
    criada: !existiaAntes && !!req,
    status: req?.status,
    motivo: !req ? "Não consegui localizar/criar a despesa deste dia." : existiaAntes ? "Despesa já existia — recibo anexado nela." : undefined,
  };
}

export async function registrarAlimentacaoOS(idOrdem: string): Promise<RegistroAlimentacaoResult> {
  // Wrapper de compatibilidade (3 call sites: PATCH da OS, envio ao Omie e
  // atualizar-relatorio): a CONCLUSÃO da OS agora é "promover" — as despesas
  // abertas na fase Pedido viram 'financeiro' com valor atualizado e nota
  // anexada; o que faltar é criado direto em 'financeiro'.
  const { data: osRes } = await supabase.from(TBL_OS).select("Id_Ordem, Status").eq("Id_Ordem", idOrdem).limit(1);
  if (!osRes?.length) {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: `OS ${idOrdem} não encontrada` };
  }
  if ((osRes[0].Status || "").trim() !== "Concluída") {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: `Status atual="${osRes[0].Status}" (esperado: Concluída)` };
  }

  const sync = await sincronizarAlimentacaoOS(idOrdem, { promover: true });
  const total = sync.criadas + sync.promovidas;
  return {
    criada: total > 0,
    criadas: total,
    pulado: sync.pulado,
    motivoPulado: sync.motivoPulado,
    requisicaoId: sync.ultimoId,
  };
}
