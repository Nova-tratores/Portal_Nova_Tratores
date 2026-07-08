// Tratorilson — função "atualizar OS a partir do relatório do técnico".
//
// Lê a OS (Ordem_Servico) + o relatório (Ordem_Servico_Tecnicos), calcula os
// campos determinísticos (horas, km, datas, horímetro), casa o chassis com um
// Projeto do POS (validando o modelo) e usa a IA para deixar o "Serviço
// Realizado" apresentável ao cliente e cruzar a "Solicitação do cliente".
//
// Devolve uma PROPOSTA (prévia). Quem aplica é a rota, chamando aplicarNaOS().
import { createClient } from "@supabase/supabase-js";
import { chamarIA, getIA } from "@/lib/assistente/ia";
import { logTratorilson } from "@/lib/assistente/log";
import { TBL_OS, TBL_PROJETOS_DB } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const TBL_TEC = "Ordem_Servico_Tecnicos";

export interface PropostaAtualizacao {
  osId: string;
  ok: boolean;
  erro?: string;
  duvidas: string[];
  qtdHoras: number;
  qtdKm: number;
  dataInicio: string;
  dataFim: string;
  horimetro: string;
  projeto: string;
  modelo: string;
  chassis: string;
  solicitacaoCliente: string;
  servicoRealizado: string;
  servSolicitado: string;
  antes: { servSolicitado: string; qtdHoras: number; qtdKm: number; projeto: string; previsaoExecucao: string; dataFimServico: string; valorTotal: number };
}

// Extrai o valor de "Label: valor" de um texto multi-linha (ex.: "Solicitação do cliente:").
function extrairCampo(texto: unknown, label: string): string {
  const linhas = String(texto || "").split("\n");
  const alvo = label.toLowerCase();
  const l = linhas.find((x) => x.trim().toLowerCase().startsWith(alvo + ":"));
  return l ? l.slice(l.indexOf(":") + 1).trim() : "";
}

const primeiraPalavra = (s: string) => String(s || "").trim().toLowerCase().split(/\s+/)[0] || "";

// Total de horas do relatório vem formatado ("2h40m", "2h", "40m", "2:40") ou já
// como número. Converte pra horas decimais (ex.: "2h40m" → 2.67), que é o que a
// OS usa em Qtd_HR (Qtd_HR × valor_hora).
function parseHoras(v: unknown): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const hm = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m?)?/i);
  if (hm) return Math.round((Number(hm[1]) + Number(hm[2] || 0) / 60) * 100) / 100;
  const so_m = s.match(/^(\d+)\s*m(?:in)?$/i);
  if (so_m) return Math.round((Number(so_m[1]) / 60) * 100) / 100;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Math.round((Number(hhmm[1]) + Number(hhmm[2]) / 60) * 100) / 100;
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) ? n : 0;
}
const parseNum = (v: unknown) => parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

// IA: reescreve o serviço realizado (apresentável + parágrafo de testes) e cruza a solicitação.
async function gerarTextos(p: { motivo: string; servicoRealizadoRaw: string; solAtual: string; userName?: string }): Promise<{ solicitacaoCliente: string; servicoRealizado: string; tokens: number }> {
  const sys =
    "Você formaliza relatórios de serviço de máquinas agrícolas (tratores) da Nova Tratores para o CLIENTE final. " +
    "Escreva em português do Brasil, claro, correto e profissional. Responda SOMENTE com um objeto JSON válido.";
  const user =
    `Diagnóstico/Motivo do técnico: """${String(p.motivo || "")}"""\n` +
    `Solicitação do cliente que já está na OS: """${String(p.solAtual || "")}"""\n` +
    `Serviço realizado (texto cru do técnico, pode ter erros): """${String(p.servicoRealizadoRaw || "")}"""\n\n` +
    `Devolva JSON no formato {"solicitacaoCliente":"...","servicoRealizado":"..."}:\n` +
    `- "solicitacaoCliente": a solicitação do cliente. Parta da que já está na OS e cruze com o diagnóstico/motivo do técnico; se o técnico fez algo além do que estava pedido, inclua. Curto e claro. Se não houver informação, use o diagnóstico/motivo.\n` +
    `- "servicoRealizado": reescreva o texto cru do técnico de forma apresentável ao cliente — corrija erros de português, deixe as frases coerentes e profissionais, sem inventar serviços que não foram citados. SEMPRE termine deixando claro que, após o serviço, o técnico realizou testes na máquina para verificar que está tudo funcionando corretamente antes de finalizar.`;

  try {
    const j = await chamarIA({
      temperature: 0.2, max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    });
    const tokens = j?.usage?.total_tokens || 0;
    const txt = j?.choices?.[0]?.message?.content || "{}";
    const o = JSON.parse(txt);
    logTratorilson({
      userName: p.userName, tipo: "atualizar_os",
      pergunta: `Reescrever relatório: ${String(p.servicoRealizadoRaw || "").slice(0, 500)}`,
      resposta: String(o.servicoRealizado || "").slice(0, 2000),
      modelo: getIA().model, tokens,
    }).catch(() => {});
    return {
      solicitacaoCliente: String(o.solicitacaoCliente || p.solAtual || p.motivo || "").trim(),
      servicoRealizado: String(o.servicoRealizado || p.servicoRealizadoRaw || "").trim(),
      tokens,
    };
  } catch {
    // Se a IA falhar, devolve o texto original (sem quebrar o fluxo).
    return { solicitacaoCliente: p.solAtual || String(p.motivo || ""), servicoRealizado: String(p.servicoRealizadoRaw || ""), tokens: 0 };
  }
}

export async function montarAtualizacaoOS(osId: string, userName?: string): Promise<PropostaAtualizacao> {
  const duvidas: string[] = [];
  const vazia = (erro: string): PropostaAtualizacao => ({
    osId, ok: false, erro, duvidas, qtdHoras: 0, qtdKm: 0, dataInicio: "", dataFim: "", horimetro: "",
    projeto: "", modelo: "", chassis: "", solicitacaoCliente: "", servicoRealizado: "", servSolicitado: "",
    antes: { servSolicitado: "", qtdHoras: 0, qtdKm: 0, projeto: "", previsaoExecucao: "", dataFimServico: "", valorTotal: 0 },
  });

  const cols = "Id_Ordem, Serv_Solicitado, Qtd_HR, Qtd_KM, Projeto, Status, Previsao_Execucao, Data_Fim_Servico, Valor_Total";
  // O usuário digita o número visível (ex.: 541 ou OS-0541 = Servico_Numero), mas a
  // OS é chaveada por Id_Ordem. Resolve pelos dois.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buscarOS = async (campo: string, val: string | number): Promise<any> =>
    (await supabase.from(TBL_OS).select(cols).eq(campo, val).maybeSingle()).data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let os: any = await buscarOS("Id_Ordem", osId);
  if (!os) {
    const num = parseInt(String(osId).replace(/\D/g, ""), 10);
    if (num) {
      // Id_Ordem tem o formato "OS-0541" (prefixo + 4 dígitos).
      os = await buscarOS("Id_Ordem", `OS-${String(num).padStart(4, "0")}`);
      if (!os) os = await buscarOS("Servico_Numero", num);
    }
  }
  if (!os) return vazia(`OS ${osId} não encontrada.`);
  const idReal = String(os.Id_Ordem);

  const { data: rel } = await supabase
    .from(TBL_TEC)
    .select("TotalHora, TotalKm, DataInicio, DataFinal, Chassis, Modelo, Horimetro, Motivo, ServicoRealizado")
    .eq("Ordem_Servico", idReal).maybeSingle();
  if (!rel) return vazia(`Relatório do técnico da OS ${osId} não encontrado (a OS já foi preenchida pelo técnico?).`);

  const qtdHoras = parseHoras(rel.TotalHora);
  const qtdKm = parseNum(rel.TotalKm);
  const dataInicio = String(rel.DataInicio || "").slice(0, 10);
  const dataFim = String(rel.DataFinal || dataInicio || "").slice(0, 10);
  const horimetro = String(rel.Horimetro || "").trim();

  // Chassis do relatório → Projeto no POS (nome = "MODELO CHASSIS...") + valida modelo.
  const chassisRel = String(rel.Chassis || "").trim();
  const modeloRel = String(rel.Modelo || "").trim();
  let projetoNome = String(os.Projeto || "");
  let modelo = "";
  let chassis = "";

  const parseProjeto = (nome: string) => {
    const partes = String(nome || "").trim().split(/\s+/);
    return { modelo: partes[0] || "", chassis: partes.slice(1).join(" ") };
  };

  if (chassisRel) {
    const { data: projs } = await supabase
      .from(TBL_PROJETOS_DB).select("nome").ilike("nome", `%${chassisRel.replace(/[%,()]/g, "")}%`).limit(20);
    const candidatos = (projs || []).map((p) => ({ nome: String(p.nome), ...parseProjeto(String(p.nome)) }));
    const match =
      candidatos.find((c) => modeloRel && c.modelo.toLowerCase().includes(primeiraPalavra(modeloRel))) ||
      candidatos[0];
    if (match) {
      projetoNome = match.nome; modelo = match.modelo; chassis = match.chassis;
      if (modeloRel && !match.modelo.toLowerCase().includes(primeiraPalavra(modeloRel))) {
        duvidas.push(`O modelo do relatório ("${modeloRel}") pode não bater com o projeto encontrado pelo chassis ("${match.nome}"). Confere?`);
      }
    } else {
      duvidas.push(`Não achei nenhum projeto no POS com o chassis "${chassisRel}". Mantive o projeto atual da OS.`);
      ({ modelo, chassis } = parseProjeto(projetoNome));
    }
  } else {
    duvidas.push("O relatório do técnico não tem chassis preenchido. Mantive o projeto atual da OS.");
    ({ modelo, chassis } = parseProjeto(projetoNome));
  }

  if (!qtdHoras) duvidas.push("Total de horas do relatório está zerado.");
  if (!dataInicio) duvidas.push("O relatório não tem data de início.");

  const solAtual = extrairCampo(os.Serv_Solicitado, "Solicitação do cliente");
  const { solicitacaoCliente, servicoRealizado } = await gerarTextos({
    motivo: String(rel.Motivo || ""), servicoRealizadoRaw: String(rel.ServicoRealizado || ""), solAtual, userName,
  });

  const servSolicitado =
    `Modelo: ${modelo}\nChassis: ${chassis}\nHorimetro: ${horimetro}\n\n` +
    `Solicitação do cliente: ${solicitacaoCliente}\nServiço Realizado: ${servicoRealizado}`;

  return {
    osId: idReal, ok: true, duvidas, qtdHoras, qtdKm, dataInicio, dataFim, horimetro,
    projeto: projetoNome, modelo, chassis, solicitacaoCliente, servicoRealizado, servSolicitado,
    antes: {
      servSolicitado: String(os.Serv_Solicitado || ""), qtdHoras: Number(os.Qtd_HR) || 0,
      qtdKm: Number(os.Qtd_KM) || 0, projeto: String(os.Projeto || ""),
      previsaoExecucao: String(os.Previsao_Execucao || ""), dataFimServico: String(os.Data_Fim_Servico || ""),
      valorTotal: Number(os.Valor_Total) || 0,
    },
  };
}

// Aplica a proposta na OS (grava os campos calculados). Não recalcula valores de
// peças/requisições — só os campos que a função cuida.
export async function aplicarNaOS(p: PropostaAtualizacao): Promise<{ ok: boolean; erro?: string; valorTotal?: number }> {
  if (!p.ok) return { ok: false, erro: p.erro || "proposta inválida" };
  // Recalcula o Valor_Total trocando só a parcela de hora/km (preserva peças/req/desconto).
  const cfg = await getConfigPOS();
  const parcelaAntiga = p.antes.qtdHoras * cfg.valor_hora + p.antes.qtdKm * cfg.valor_km;
  const parcelaNova = p.qtdHoras * cfg.valor_hora + p.qtdKm * cfg.valor_km;
  const valorTotal = Math.max(0, p.antes.valorTotal - parcelaAntiga + parcelaNova);

  const { error } = await supabase.from(TBL_OS).update({
    Qtd_HR: p.qtdHoras,
    Qtd_KM: p.qtdKm,
    Valor_Total: valorTotal,
    Previsao_Execucao: p.dataInicio || null,
    Data_Fim_Servico: p.dataFim || null,
    Projeto: p.projeto,
    Serv_Solicitado: p.servSolicitado,
  }).eq("Id_Ordem", p.osId);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, valorTotal };
}
