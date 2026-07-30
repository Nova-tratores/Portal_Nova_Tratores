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
import { TBL_OS, TBL_PROJETOS_DB, TBL_LOGS_PPO } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";
import { supabaseFetch, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_ITENS } from "@/lib/ppv/constants";
import { registrarLog as registrarLogPPV, atualizarValorTotal } from "@/lib/ppv/queries";
import { aplicarMudancaFase } from "@/lib/pos/fase";
import { criarOSNoOmie } from "@/lib/pos/omie";
import { registrarAlimentacaoOS } from "@/lib/pos/alimentacao-os";

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
  ppvId: string;
  tecnico: string;
  devolucoes: { codigo: string; descricao: string; quantidade: number; motivo: string }[];
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
    ppvId: "", tecnico: "", devolucoes: [],
    antes: { servSolicitado: "", qtdHoras: 0, qtdKm: 0, projeto: "", previsaoExecucao: "", dataFimServico: "", valorTotal: 0 },
  });

  const cols = "Id_Ordem, Serv_Solicitado, Qtd_HR, Qtd_KM, Projeto, Status, Previsao_Execucao, Data_Fim_Servico, Valor_Total, ID_PPV, Os_Tecnico";
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
    .select("TotalHora, TotalKm, DataInicio, DataFinal, Chassis, Modelo, Horimetro, Motivo, ServicoRealizado, PecasInfo")
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

  // Peças a devolver no PPV vinculado: "não usada" (qtd inteira) e "devolvida"
  // (qtd devolvida). Só as de origem PPV.
  const ppvId = String((os as Record<string, unknown>).ID_PPV || "");
  const tecnico = String((os as Record<string, unknown>).Os_Tecnico || "");
  const devolucoes: { codigo: string; descricao: string; quantidade: number; motivo: string }[] = [];
  if (ppvId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pecas: any[] = [];
    try { const pp = JSON.parse(String(rel.PecasInfo || "[]")); if (Array.isArray(pp)) pecas = pp; } catch {}
    for (const pc of pecas) {
      const o = (pc || {}) as Record<string, unknown>;
      if (String(o.origem || "") !== "ppv") continue;
      const codigo = String(o.codigo || "").trim();
      if (!codigo) continue;
      if (o.naoUsada === true) {
        const q = parseNum(o.qtdUsada);
        if (q > 0) devolucoes.push({ codigo, descricao: String(o.descricao || ""), quantidade: q, motivo: "não usada" });
      } else if (o.devolvida === true) {
        const q = parseNum(o.qtdDevolvida);
        if (q > 0) devolucoes.push({ codigo, descricao: String(o.descricao || ""), quantidade: q, motivo: "devolvida" });
      }
    }
  }

  return {
    osId: idReal, ok: true, duvidas, qtdHoras, qtdKm, dataInicio, dataFim, horimetro,
    projeto: projetoNome, modelo, chassis, solicitacaoCliente, servicoRealizado, servSolicitado,
    ppvId, tecnico, devolucoes,
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
export async function aplicarNaOS(p: PropostaAtualizacao, userName?: string): Promise<{ ok: boolean; erro?: string; valorTotal?: number; devolucoes?: number }> {
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

  // Devoluções de peças no PPV vinculado + histórico no PPV e no card do POS.
  let devsRegistradas = 0;
  if (p.ppvId && p.devolucoes.length > 0) {
    const quem = userName || "Tratorilson";
    for (const d of p.devolucoes) {
      let preco = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const it = await supabaseFetch<any[]>(`${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(p.ppvId)}&CodProduto=eq.${encodeURIComponent(d.codigo)}&order=Id.desc&limit=1`);
        preco = Number(it?.[0]?.Preco) || 0;
      } catch { /* sem preço → 0 */ }
      const mov = {
        Id: Math.floor(Math.random() * 9000000000) + 1000000000,
        Id_PPV: p.ppvId, Data_Hora: formatarDataBR(new Date().toISOString(), true),
        Tecnico: p.tecnico || quem, TipoMovimento: "Devolução",
        CodProduto: d.codigo, Descricao: d.descricao, Qtde: String(d.quantidade), Preco: preco,
      };
      try {
        await supabaseFetch(TBL_ITENS, "POST", [mov]);
        await registrarLogPPV(p.ppvId, `Devolveu ${d.quantidade} un de ${d.codigo} (${d.motivo}) — via Tratorilson`, quem);
        devsRegistradas++;
      } catch { /* segue as demais */ }
    }
    if (devsRegistradas > 0) {
      await atualizarValorTotal(p.ppvId);
      const resumo = p.devolucoes.map((d) => `${d.quantidade}x ${d.codigo} (${d.motivo})`).join(", ");
      const agora = new Date();
      await supabase.from(TBL_LOGS_PPO).insert({
        Id_ppo: p.osId,
        Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora),
        Hora_Acao: agora.toLocaleTimeString("pt-BR"),
        UsuEmail: quem,
        acao: `Tratorilson: devoluções no PPV ${p.ppvId} — ${resumo}`,
        Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
      });
    }
  }

  return { ok: true, valorTotal, devolucoes: devsRegistradas };
}

const FASE_ORIGEM = "Relatório Concluído";
const FASE_ENVIAR_OMIE = "Enviar Omie";
const FASE_PREENCHIDO = "Preenchido Garantia";

export interface ResultadoLote {
  total: number; ok: number; erros: number; paraEnviarOmie: number; paraPreenchido: number;
  resultados: { os: string; ok: boolean; fase?: string; garantia?: boolean; duvidas?: number; erro?: string }[];
}

// Processa TODAS as OS em "Relatório Concluído": preenche pelo relatório, devolve
// peças no PPV e move de fase (garantia → "Preenchido", resto → "Enviar Omie").
// Usado pelo botão manual, pela rota de lote e pelo agendador automático.
export async function processarLoteRelatorios(userName: string): Promise<ResultadoLote> {
  const { data: osList } = await supabase.from(TBL_OS).select("Id_Ordem").eq("Status", FASE_ORIGEM);
  const ids = (osList || []).map((o) => String((o as { Id_Ordem: string }).Id_Ordem));
  const resultados: ResultadoLote["resultados"] = [];

  for (const id of ids) {
    try {
      const prop = await montarAtualizacaoOS(id, userName);
      if (!prop.ok) { resultados.push({ os: id, ok: false, erro: prop.erro }); continue; }
      const r = await aplicarNaOS(prop, userName);
      if (!r.ok) { resultados.push({ os: id, ok: false, erro: r.erro }); continue; }

      const { data: gar } = await supabase.from("garantias").select("id").eq("id_ordem", prop.osId).limit(1);
      const ehGarantia = !!(gar && gar.length > 0);
      const faseDestino = ehGarantia ? FASE_PREENCHIDO : FASE_ENVIAR_OMIE;

      await aplicarMudancaFase(prop.osId, faseDestino, userName, {
        // notifica só quando houve dúvida — assim o time revisa as incertas.
        notificar: prop.duvidas.length > 0,
        acaoLog: "Atualizada pelo Tratorilson (relatório do técnico)",
      });
      resultados.push({ os: prop.osId, ok: true, fase: faseDestino, garantia: ehGarantia, duvidas: prop.duvidas.length });
    } catch (e) {
      resultados.push({ os: id, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const ok = resultados.filter((r) => r.ok).length;
  return {
    total: ids.length, ok, erros: resultados.length - ok,
    paraEnviarOmie: resultados.filter((r) => r.ok && !r.garantia).length,
    paraPreenchido: resultados.filter((r) => r.ok && r.garantia).length,
    resultados,
  };
}

// ── Correção de uma OS pelo chat (Fase 3): "na OS X, troca o campo Y por Z" ──

function parseDescricao(texto: unknown): Record<string, string> {
  const linhas = String(texto || "").split("\n");
  const c: Record<string, string> = { modelo: "", chassis: "", horimetro: "", solicitacao: "", servico: "" };
  let atual = "";
  for (const l of linhas) {
    const m = l.match(/^\s*(Modelo|Chassis|Hor[ií]metro|Solicita[çc][ãa]o do cliente|Servi[çc]o Realizado)\s*:\s*(.*)$/i);
    if (m) {
      const k = m[1].toLowerCase();
      atual = k.startsWith("modelo") ? "modelo" : k.startsWith("chassis") ? "chassis" : k.startsWith("hor") ? "horimetro" : k.startsWith("solicit") ? "solicitacao" : "servico";
      c[atual] = m[2];
    } else if (atual && l.length) {
      c[atual] += "\n" + l;
    }
  }
  return c;
}
function montarDescricao(c: Record<string, string>): string {
  return `Modelo: ${c.modelo || ""}\nChassis: ${c.chassis || ""}\nHorimetro: ${c.horimetro || ""}\n\n` +
    `Solicitação do cliente: ${c.solicitacao || ""}\nServiço Realizado: ${c.servico || ""}`;
}

const FASE_ENVIADO_OMIE = "Enviado Para Omie";

export type ResultadoEnvioOmie = { os: string; ok: boolean; cNumOS?: string; pedidoVenda?: string; erro?: string; ppvErro?: string };

// Envia UMA OS ao Omie (a OS + o PPV vinculado, via criarOSNoOmie).
// Sucesso → guarda Ordem Omie + Pedido de Venda + log, move pra "Enviado Para Omie".
// Erro (OS ou PPV) → guarda o log com o erro e DEIXA em "Enviar Omie" pra reenviar.
export async function enviarOSaoOmie(id: string, userName: string): Promise<ResultadoEnvioOmie> {
  try {
    const r = await criarOSNoOmie(id); // já envia OS + PPV (pedido de venda) ao Omie
    // "OS já possui Ordem Omie: NNN" → já foi enviada antes; trata como enviada
    // (não reenvia, mas avança de fase pra parar de dar erro).
    const jaEnviada = !r.sucesso && /já possui Ordem Omie/i.test(r.erro || "");
    const numExistente = jaEnviada ? (r.erro || "").split(":").pop()?.trim() : undefined;
    const okFinal = r.sucesso || jaEnviada;
    const cNum = r.cNumOS || numExistente;

    const partes: string[] = [];
    if (r.sucesso) {
      partes.push(r.cNumOS ? `OK — Ordem Omie nº ${r.cNumOS}` : "OK — enviada");
      if (r.pedidoVenda) partes.push(`Pedido de Venda nº ${r.pedidoVenda}`);
      if (r.pedidoVendaErro) partes.push(`ERRO no PPV: ${r.pedidoVendaErro}`);
    } else if (jaEnviada) {
      partes.push(`Já estava no Omie — Ordem nº ${numExistente}`);
    } else {
      partes.push(`ERRO ao enviar a OS: ${r.erro}`);
    }
    const agora = new Date();
    const log = `[${new Intl.DateTimeFormat("pt-BR").format(agora)} ${agora.toLocaleTimeString("pt-BR")}] ${partes.join(" | ")}`;

    // Só grava Pedido_Venda quando houve envio novo (não apaga o que já existe).
    const upd: Record<string, unknown> = { Omie_Envio_Log: log };
    if (r.pedidoVenda) upd.Pedido_Venda = r.pedidoVenda;
    await supabase.from(TBL_OS).update(upd).eq("Id_Ordem", id);

    if (okFinal) {
      // Só lança alimentação em envio novo (evita duplicar em OS que já estava no Omie).
      if (r.sucesso) { try { await registrarAlimentacaoOS(id); } catch { /* despesa de alimentação — best-effort */ } }
      // Interna: criarOSNoOmie já concluiu (remessa). Externa: move pra "Enviado Para Omie".
      if (!r.interna) {
        await aplicarMudancaFase(id, FASE_ENVIADO_OMIE, userName, {
          notificar: !!r.pedidoVendaErro,
          acaoLog: jaEnviada
            ? `Já estava no Omie (Ordem nº ${numExistente}) — movida pelo Tratorilson`
            : `Enviada ao Omie${r.cNumOS ? ` (Ordem nº ${r.cNumOS})` : ""}${r.pedidoVenda ? `, PV nº ${r.pedidoVenda}` : ""} — por ${userName}`,
        });
      }
    }
    return { os: id, ok: okFinal, cNumOS: cNum, pedidoVenda: r.pedidoVenda, erro: okFinal ? undefined : r.erro, ppvErro: r.pedidoVendaErro };
  } catch (e) {
    const agora = new Date();
    const log = `[${new Intl.DateTimeFormat("pt-BR").format(agora)} ${agora.toLocaleTimeString("pt-BR")}] ERRO: ${e instanceof Error ? e.message : String(e)}`;
    try { await supabase.from(TBL_OS).update({ Omie_Envio_Log: log }).eq("Id_Ordem", id); } catch { /* best-effort */ }
    return { os: id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Envia ao Omie TODAS as OS em "Enviar Omie" (ou só as de `ids`, se passar).
export async function enviarLoteOmie(userName: string, ids?: string[]): Promise<{ total: number; ok: number; erros: number; resultados: ResultadoEnvioOmie[] }> {
  let alvos = ids;
  if (!alvos) {
    const { data: osList } = await supabase.from(TBL_OS).select("Id_Ordem").eq("Status", FASE_ENVIAR_OMIE);
    alvos = (osList || []).map((o) => String((o as { Id_Ordem: string }).Id_Ordem));
  }
  const resultados: ResultadoEnvioOmie[] = [];

  for (const id of alvos) {
    resultados.push(await enviarOSaoOmie(id, userName));
    // Espaçamento entre OS pra não disparar o anti-flood da Omie.
    await new Promise((res) => setTimeout(res, 1200));
  }

  const ok = resultados.filter((r) => r.ok).length;
  return { total: alvos.length, ok, erros: resultados.length - ok, resultados };
}

export type CampoOS =
  | "servico_realizado" | "solicitacao_cliente" | "modelo" | "chassis" | "horimetro"
  | "horas" | "km" | "data_inicio" | "data_fim"
  // Campos diretos da OS (edição de OS existente pelo Tratorilson)
  | "tecnico" | "tecnico2" | "tipo_servico" | "projeto" | "cliente" | "data_execucao" | "revisao"
  | "endereco" | "cidade" | "cnpj";

// Campos que são só uma coluna direta da OS (troca simples de texto).
const CAMPO_COLUNA: Partial<Record<CampoOS, string>> = {
  tecnico: "Os_Tecnico", tecnico2: "Os_Tecnico2", tipo_servico: "Tipo_Servico",
  projeto: "Projeto", cliente: "Os_Cliente", data_execucao: "Data", revisao: "Revisao",
  endereco: "Endereco_Cliente", cidade: "Cidade_Cliente", cnpj: "Cnpj_Cliente",
};

export async function corrigirCampoOS(osNum: string, campo: CampoOS, valor: string, userName?: string): Promise<{ ok: boolean; erro?: string; osId?: string; campo?: string; antes?: string; depois?: string }> {
  const cols = "Id_Ordem, Serv_Solicitado, Qtd_HR, Qtd_KM, Valor_Total, Previsao_Execucao, Data_Fim_Servico, Os_Tecnico, Os_Tecnico2, Tipo_Servico, Projeto, Os_Cliente, Data, Revisao, Endereco_Cliente, Cidade_Cliente, Cnpj_Cliente";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buscar = async (c: string, v: string | number): Promise<any> => (await supabase.from(TBL_OS).select(cols).eq(c, v).maybeSingle()).data;
  let os = await buscar("Id_Ordem", osNum);
  if (!os) {
    const num = parseInt(String(osNum).replace(/\D/g, ""), 10);
    if (num) { os = await buscar("Id_Ordem", `OS-${String(num).padStart(4, "0")}`); if (!os) os = await buscar("Servico_Numero", num); }
  }
  if (!os) return { ok: false, erro: `OS ${osNum} não encontrada.` };
  const idReal = String(os.Id_Ordem);

  const update: Record<string, unknown> = {};
  let antes = "", depois = "";
  const mapDesc: Record<string, string> = { servico_realizado: "servico", solicitacao_cliente: "solicitacao", modelo: "modelo", chassis: "chassis", horimetro: "horimetro" };

  if (mapDesc[campo]) {
    const desc = parseDescricao(os.Serv_Solicitado);
    const k = mapDesc[campo];
    antes = desc[k] || ""; desc[k] = valor; depois = valor;
    update.Serv_Solicitado = montarDescricao(desc);
  } else if (campo === "horas" || campo === "km") {
    const cfg = await getConfigPOS();
    const novoHoras = campo === "horas" ? parseHoras(valor) : Number(os.Qtd_HR) || 0;
    const novoKm = campo === "km" ? parseNum(valor) : Number(os.Qtd_KM) || 0;
    const parcAntiga = (Number(os.Qtd_HR) || 0) * cfg.valor_hora + (Number(os.Qtd_KM) || 0) * cfg.valor_km;
    const parcNova = novoHoras * cfg.valor_hora + novoKm * cfg.valor_km;
    update.Qtd_HR = novoHoras; update.Qtd_KM = novoKm;
    update.Valor_Total = Math.max(0, (Number(os.Valor_Total) || 0) - parcAntiga + parcNova);
    antes = String(campo === "horas" ? os.Qtd_HR : os.Qtd_KM); depois = String(campo === "horas" ? novoHoras : novoKm);
  } else if (campo === "data_inicio") {
    antes = String(os.Previsao_Execucao || ""); update.Previsao_Execucao = valor || null; depois = valor;
  } else if (campo === "data_fim") {
    antes = String(os.Data_Fim_Servico || ""); update.Data_Fim_Servico = valor || null; depois = valor;
  } else if (CAMPO_COLUNA[campo]) {
    // Campo direto da OS (técnico, tipo de serviço, projeto, cliente, data, revisão)
    const col = CAMPO_COLUNA[campo]!;
    antes = String(os[col] ?? ""); update[col] = valor; depois = valor;
  } else {
    return { ok: false, erro: `Campo "${campo}" não suportado.` };
  }

  const { error } = await supabase.from(TBL_OS).update(update).eq("Id_Ordem", idReal);
  if (error) return { ok: false, erro: error.message };

  const agora = new Date();
  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: idReal, Data_Acao: new Intl.DateTimeFormat("pt-BR").format(agora), Hora_Acao: agora.toLocaleTimeString("pt-BR"),
    UsuEmail: userName || "Tratorilson (correção)", acao: `Tratorilson: correção via chat — ${campo}`,
    Status_Anterior: "", Status_Atual: "", Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  });

  return { ok: true, osId: idReal, campo, antes, depois };
}
