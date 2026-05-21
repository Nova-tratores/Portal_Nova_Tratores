// =====================================================================
// REGISTRO DE DESPESA DE ALIMENTAÇÃO AO FECHAR OS
//
// Ao fechar uma Ordem_Servico (Status='Concluída'), se ela tiver o campo
// agregado `Alimentacao_Tecnico=true` + `Alimentacao_Valor>0` e ainda
// não tiver requisição de Alimentação vinculada, cria automaticamente
// uma Requisicao tipo='Alimentação' já em status='financeiro'.
//
// Isso aproveita o fluxo existente de Requisições — a despesa entra na
// fase "enviado financeiro" do kanban de requisições, sem tabela extra.
//
// Idempotência: marca origem='auto_alimentacao_os' e checa antes de criar.
// =====================================================================

import { supabase } from "./supabase";
import { TBL_OS } from "./constants";

export interface RegistroAlimentacaoResult {
  criada: boolean;
  pulado: boolean;
  motivoPulado?: string;
  requisicaoId?: number;
}

interface OSMin {
  Id_Ordem: string;
  Status?: string | null;
  Os_Tecnico?: string | null;
  Alimentacao_Tecnico?: boolean | null;
  Alimentacao_Valor?: string | number | null;
  Projeto?: string | null;
  Cnpj_Cliente?: string | null;
  Os_Cliente?: string | null;
  Data?: string | null;
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

export async function registrarAlimentacaoOS(idOrdem: string): Promise<RegistroAlimentacaoResult> {
  // 1) Carregar OS
  const { data: osRes } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Os_Tecnico, Alimentacao_Tecnico, Alimentacao_Valor, Projeto, Cnpj_Cliente, Os_Cliente, Data")
    .eq("Id_Ordem", idOrdem)
    .limit(1);

  if (!osRes || !osRes.length) {
    return { criada: false, pulado: true, motivoPulado: `OS ${idOrdem} não encontrada` };
  }
  const os = osRes[0] as OSMin;

  if ((os.Status || "").trim() !== "Concluída") {
    return { criada: false, pulado: true, motivoPulado: `Status atual="${os.Status}" (esperado: Concluída)` };
  }

  // 2) Validar se há valor agregado para criar
  const valor = parseValor(os.Alimentacao_Valor);
  if (!os.Alimentacao_Tecnico || valor <= 0) {
    return { criada: false, pulado: true, motivoPulado: "OS sem alimentação a registrar (campo agregado)" };
  }

  // 3) Idempotência — já existe Requisicao auto para essa OS?
  const { data: existenteAuto } = await supabase
    .from("Requisicao")
    .select("id")
    .eq("ordem_servico", idOrdem)
    .eq("origem", "auto_alimentacao_os")
    .limit(1);
  if (existenteAuto && existenteAuto.length > 0) {
    return { criada: false, pulado: true, motivoPulado: `Já existe (requisição #${existenteAuto[0].id})`, requisicaoId: existenteAuto[0].id };
  }

  // 4) Se já há Requisição manual tipo='Alimentação' vinculada, o usuário já cuidou — não cria
  const { data: existenteManual } = await supabase
    .from("Requisicao")
    .select("id")
    .eq("ordem_servico", idOrdem)
    .eq("tipo", "Alimentação")
    .not("status", "in", '("lixeira","cancelada")')
    .limit(1);
  if (existenteManual && existenteManual.length > 0) {
    return { criada: false, pulado: true, motivoPulado: `Já há requisição manual de Alimentação (#${existenteManual[0].id})` };
  }

  // 5) Criar Requisicao em status='financeiro'
  const agora = new Date();
  const hoje = agora.toISOString().slice(0, 10);

  const setor = os.Cnpj_Cliente ? "Trator-Cliente" : "Trator-Loja";
  const tituloProjeto = os.Projeto ? ` (${os.Projeto})` : "";

  const novaReq: Record<string, unknown> = {
    titulo: `Alimentação - OS ${idOrdem}${tituloProjeto}`,
    tipo: "Alimentação",
    setor,
    solicitante: os.Os_Tecnico || "Sistema",
    data: hoje,
    status: "financeiro",
    enviado_financeiro_data: agora.toISOString(),
    valor_despeza: valor.toFixed(2).replace(".", ","),
    ordem_servico: idOrdem,
    origem: "auto_alimentacao_os",
    obs: `Despesa de alimentação registrada automaticamente ao fechar a OS ${idOrdem}${os.Projeto ? ` — ${os.Projeto}` : ""}.`,
  };

  if (os.Projeto) novaReq.Chassis_Modelo = os.Projeto;
  if (os.Cnpj_Cliente && setor === "Trator-Cliente") {
    novaReq.cliente = os.Os_Cliente || os.Cnpj_Cliente;
  }

  const { data: inserida, error } = await supabase
    .from("Requisicao")
    .insert(novaReq)
    .select("id")
    .single();

  if (error) {
    console.error(`[alimentacao-os] falhou criar Requisicao para OS ${idOrdem}:`, error.message);
    return { criada: false, pulado: true, motivoPulado: error.message };
  }

  return { criada: true, pulado: false, requisicaoId: inserida?.id };
}
