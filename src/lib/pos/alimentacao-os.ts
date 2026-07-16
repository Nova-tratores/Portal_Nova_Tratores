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
 * Cria UMA despesa de alimentação (Requisicao tipo='Alimentação', já em
 * status='financeiro', solicitante = técnico, recibo em foto_nf). Reusada
 * pelo fechamento da OS e pelo anexo de nota do admin (que dispara na hora).
 */
async function criarRequisicaoAlimentacao(os: OSMin, item: AlimentacaoItem): Promise<number | null> {
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
    status: "financeiro",
    enviado_financeiro_data: agora.toISOString(),
    valor_despeza: item.valor.toFixed(2).replace(".", ","),
    ordem_servico: os.Id_Ordem,
    origem: "auto_alimentacao_os",
    obs: `Despesa de alimentação (${dataItem}) registrada automaticamente (OS ${os.Id_Ordem})${tecnicos.length > 1 ? ` — técnicos: ${tecnicos.join(", ")}` : ""}.`,
  };
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

/**
 * Dispara a despesa de UM item de alimentação NA HORA (usado quando o admin
 * anexa a nota no portal — pedido do usuário: anexou, abriu a despesa).
 * Idempotente por OS + data + valor; se a despesa auto já existe, só ATUALIZA
 * o recibo (foto_nf) nela. Não exige a OS concluída.
 */
export async function registrarAlimentacaoItem(
  idOrdem: string,
  item: AlimentacaoItem,
): Promise<{ requisicaoId: number | null; criada: boolean; motivo?: string }> {
  const { data: osRes } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Os_Tecnico, Os_Tecnico2, Alimentacoes, Projeto, Cnpj_Cliente, Os_Cliente, Data")
    .eq("Id_Ordem", idOrdem)
    .limit(1);
  if (!osRes?.length) return { requisicaoId: null, criada: false, motivo: `OS ${idOrdem} não encontrada` };
  const os = osRes[0] as OSMin;

  if (!(item.valor > 0)) {
    return { requisicaoId: null, criada: false, motivo: "Lance o VALOR da alimentação antes — a despesa precisa dele." };
  }

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
    return { requisicaoId: manual[0].id, criada: false, motivo: `Já existe requisição manual de Alimentação (#${manual[0].id}) nesta OS` };
  }

  // auto existente pra mesma data+valor -> só anexa o recibo nela
  const dataItem = item.data || (os.Data || new Date().toISOString().slice(0, 10));
  const { data: autos } = await supabase
    .from("Requisicao")
    .select("id, data, valor_despeza, foto_nf")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os");
  const existente = (autos || []).find(
    (r: any) => String(r.data) === dataItem && parseValor(r.valor_despeza).toFixed(2) === item.valor.toFixed(2),
  );
  if (existente) {
    const fotoNf = fotoNfDe(item.foto);
    if (fotoNf && fotoNf !== existente.foto_nf) {
      await supabase.from("Requisicao").update({ foto_nf: fotoNf }).eq("id", existente.id);
    }
    return { requisicaoId: existente.id, criada: false, motivo: "Despesa já existia — recibo anexado nela" };
  }

  const id = await criarRequisicaoAlimentacao(os, { ...item, data: dataItem });
  return { requisicaoId: id, criada: id != null, motivo: id == null ? "Falha ao criar a requisição" : undefined };
}

export async function registrarAlimentacaoOS(idOrdem: string): Promise<RegistroAlimentacaoResult> {
  // 1) Carregar OS
  const { data: osRes } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Os_Tecnico, Os_Tecnico2, Alimentacoes, Alimentacao_Tecnico, Alimentacao_Valor, Projeto, Cnpj_Cliente, Os_Cliente, Data")
    .eq("Id_Ordem", idOrdem)
    .limit(1);

  if (!osRes || !osRes.length) {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: `OS ${idOrdem} não encontrada` };
  }
  const os = osRes[0] as OSMin;

  if ((os.Status || "").trim() !== "Concluída") {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: `Status atual="${os.Status}" (esperado: Concluída)` };
  }

  // 2) Montar a lista de alimentações (array novo, ou fallback do campo antigo)
  let lista = normalizarAlimentacoes(os.Alimentacoes);
  if (lista.length === 0) {
    const valorAgg = parseValor(os.Alimentacao_Valor);
    if (os.Alimentacao_Tecnico && valorAgg > 0) {
      lista = [{ data: (os.Data || new Date().toISOString().slice(0, 10)), valor: valorAgg, tecnicos: [os.Os_Tecnico || "Sistema"], no_pdf: false }];
    }
  }
  if (lista.length === 0) {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: "OS sem alimentação a registrar" };
  }

  // 3) Se já há Requisição MANUAL tipo='Alimentação' vinculada, o usuário já cuidou — não cria nada
  const { data: existenteManual } = await supabase
    .from("Requisicao")
    .select("id")
    .eq("ordem_servico", idOrdem)
    .eq("tipo", "Alimentação")
    .neq("origem", "auto_alimentacao_os")
    .not("status", "in", '("lixeira","cancelada")')
    .limit(1);
  if (existenteManual && existenteManual.length > 0) {
    return { criada: false, criadas: 0, pulado: true, motivoPulado: `Já há requisição manual de Alimentação (#${existenteManual[0].id})` };
  }

  // 4) Despesas auto já existentes (idempotência por data+valor)
  const { data: existentesAuto } = await supabase
    .from("Requisicao")
    .select("id, data, valor_despeza")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os");
  const jaTem = new Set(
    (existentesAuto || []).map((r: any) => `${String(r.data)}|${parseValor(r.valor_despeza).toFixed(2)}`)
  );

  const agora = new Date();
  let criadas = 0;
  let ultimoId: number | undefined;

  for (const item of lista) {
    if (!(item.valor > 0)) continue; // item só com foto (nota sem valor lançado) não vira despesa
    const dataItem = item.data || (os.Data || agora.toISOString().slice(0, 10));
    const chave = `${dataItem}|${item.valor.toFixed(2)}`;
    if (jaTem.has(chave)) continue;

    const id = await criarRequisicaoAlimentacao(os, { ...item, data: dataItem });
    if (id == null) continue;
    criadas++;
    ultimoId = id;
    jaTem.add(chave);
  }

  return { criada: criadas > 0, criadas, pulado: criadas === 0, motivoPulado: criadas === 0 ? "Nada novo a registrar" : undefined, requisicaoId: ultimoId };
}
