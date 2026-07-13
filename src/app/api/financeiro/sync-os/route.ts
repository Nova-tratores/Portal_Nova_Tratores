import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";

// Cria automaticamente um Chamado_NF (setor Oficina) para cada Ordem de Serviço
// faturada (com NFS-e). Cruza com o Pedido de Venda pelo campo "Nº do Pedido do
// Cliente" da OS, soma NF de serviço + NF de peças, e pega condição/vencimentos.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
interface Acc { name: string; key: string; secret: string }
const ACCS: Acc[] = [
  { name: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { name: "Castro Pecas", ...contaOmie("Castro Pecas") },
];
const accPorNome = (nome: string) => ACCS.find(a => a.name === nome) || ACCS[0];

// Só gera card para notas faturadas a partir desta data (ignora histórico antigo)
const DATA_CORTE = process.env.SYNC_FINANCEIRO_DESDE || "2026-06-18";
// user_id "do sistema" para registrar criações automáticas no audit_log
const SISTEMA_UID = "00000000-0000-0000-0000-000000000000";

// Notifica (admins + quem tem acesso ao financeiro) que um card foi criado pelo sistema
async function notificarCard(origin: string, setor: string, cliente: string, opts?: { numOS?: string; semNfsePdf?: boolean }) {
  try {
    await fetch(`${origin}/api/financeiro/notificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `Novo card no financeiro — ${setor}`,
        descricao: `Gerado automaticamente do Omie${cliente ? ` — ${cliente}` : ""}.`,
        link: "/financeiro",
      }),
    });
    // NFS-e emitida mas SEM PDF (NFS-e municipal): avisa o Pós-Vendas pra anexar a nota manualmente.
    if (opts?.semNfsePdf) {
      await fetch(`${origin}/api/financeiro/notificar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `⚠️ NFS-e sem PDF — anexe a nota de serviço${opts.numOS ? ` (OS ${opts.numOS})` : ""}`,
          descricao: `A NFS-e${opts.numOS ? ` da OS ${opts.numOS}` : ""}${cliente ? ` — ${cliente}` : ""} foi emitida, mas o Omie não forneceu o PDF (NFS-e municipal). Anexe a nota de serviço manualmente no card.`,
          link: "/financeiro",
          alvo: "posvendas",
        }),
      });
    }
  } catch { /* ignore */ }
}

async function omieCall(ep: string, call: string, param: Record<string, unknown>, acc: Acc, tentativa = 0): Promise<any> {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429 && tentativa < 2) { await new Promise(r => setTimeout(r, 60000)); return omieCall(ep, call, param, acc, tentativa + 1); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) {
    const fs = String(data.faultstring);
    // "Consumo redundante" do Omie: espera o tempo sugerido e tenta de novo
    if (/redundante|redundant/i.test(fs) && tentativa < 2) {
      const m = fs.match(/(\d+)\s*segundo/i);
      const seg = Math.min((m ? parseInt(m[1], 10) : 30) + 2, 70);
      await new Promise(r => setTimeout(r, seg * 1000));
      return omieCall(ep, call, param, acc, tentativa + 1);
    }
    throw new Error(fs);
  }
  return data;
}

const dataBRtoISO = (s: unknown): string | null => {
  const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// "1234 CASTRO" -> { num: "1234", empresa: "Castro Pecas" }; senão empresa = a da OS
function parsePedidoCliente(campo: string, empresaOS: string): { num: string; empresa: string } {
  const txt = String(campo || "");
  const ehCastro = /castro/i.test(txt);
  const num = (txt.match(/\d+/g) || []).join(""); // só dígitos
  return { num, empresa: ehCastro ? "Castro Pecas" : empresaOS };
}

// Parcelas (ISO) da OS via ConsultarOS
async function parcelasOS(codOS: number, acc: Acc): Promise<{ datas: string[]; qtd: number }> {
  try {
    const os: any = await omieCall("/servicos/os/", "ConsultarOS", { nCodOS: codOS }, acc);
    const parc: any[] = os?.Parcelas || [];
    const datas = parc.map(p => dataBRtoISO(p?.dDtVenc)).filter(Boolean) as string[];
    const qtd = Number(os?.Cabecalho?.nQtdeParc || datas.length || 0);
    return { datas, qtd: qtd || datas.length };
  } catch { return { datas: [], qtd: 0 }; }
}

// Parcelas (ISO) do PV via ConsultarPedido (por número, com fallback por código)
async function parcelasPV(numPedido: string, codPedido: number | null, acc: Acc): Promise<{ datas: string[]; valor: number; numNF: string; danfe: string | null; codCli: number | null; codPedido: number | null; faturado: boolean; existe: boolean }> {
  let pv: any = null;
  try {
    const r: any = await omieCall("/produtos/pedido/", "ConsultarPedido", codPedido ? { codigo_pedido: codPedido } : { numero_pedido: numPedido }, acc);
    pv = r?.pedido_venda_produto || r;
  } catch { /* ignore */ }
  if (!pv && codPedido) {
    try { const r: any = await omieCall("/produtos/pedido/", "ConsultarPedido", { numero_pedido: numPedido }, acc); pv = r?.pedido_venda_produto || r; } catch { /* ignore */ }
  }
  const parc: any[] = pv?.lista_parcelas?.parcela || pv?.parcelas || [];
  const datas = parc.map(p => dataBRtoISO(p?.data_vencimento || p?.dt_venc || p?.dDtVenc)).filter(Boolean) as string[];
  const valor = pv?.total_pedido?.valor_total_pedido || 0;
  const numNF = String(pv?.lista_nfe?.[0]?.numero_nfe || pv?.frete?.numero_nota_fiscal || "");
  const codCli = pv?.cabecalho?.codigo_cliente ?? null;
  const codPed = pv?.cabecalho?.codigo_pedido ?? null;
  const faturado = pv?.infoCadastro?.faturado === "S";
  return { datas, valor, numNF, danfe: null, codCli, codPedido: codPed, faturado, existe: !!pv };
}

async function dadosCliente(codCli: number | null, acc: Acc): Promise<{ nome: string; cnpj: string }> {
  if (!codCli) return { nome: "", cnpj: "" };
  try {
    const { data } = await supabase.from("portal_nt_clientes_cadastro_omie").select("nome_fantasia, razao_social, cnpj_cpf").eq("cod_cli", codCli).maybeSingle();
    if (data) return { nome: (data.nome_fantasia || data.razao_social || "").trim(), cnpj: String(data.cnpj_cpf || "").trim() };
  } catch { /* ignore */ }
  try {
    const c: any = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codCli }, acc);
    return { nome: String(c?.nome_fantasia || c?.razao_social || "").trim(), cnpj: String(c?.cnpj_cpf || "").trim() };
  } catch { return { nome: "", cnpj: "" }; }
}

const BUCKET = "anexos";
// pdfApenas = true: só guarda se for PDF de verdade (evita guardar HTML de portal).
// pdfApenas = false: guarda qualquer conteúdo (ex.: XML da NFS-e).
async function baixarEAnexar(url: string, path: string, pdfApenas = true): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ehPdf = buffer.slice(0, 5).toString("latin1").startsWith("%PDF");
    if (pdfApenas && !ehPdf) return null;
    const ct = ehPdf ? "application/pdf" : (path.endsWith(".xml") ? "application/xml" : (res.headers.get("content-type") || "application/octet-stream"));
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: ct, upsert: true });
    if (error) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return null; }
}

// NFS-e da OS via StatusOS (número + PDF). O ListarOS NÃO traz o número confiável.
async function nfseDaOS(codOS: number, numOS: string, empKey: string, acc: Acc): Promise<{ num: string; url: string | null; raw: any }> {
  try {
    const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: codOS }, acc);
    const nfse = (st?.ListaRpsNfse || [])[0];
    if (!nfse) return { num: "", url: null, raw: null };
    const num = String(nfse.nNfse || "");
    // SOMENTE o PDF real da NFS-e. Se o Omie não der PDF, fica vazio (anexo manual no card).
    let url: string | null = null;
    const pdf = nfse.danfe || nfse.cUrlDanfe || nfse.cUrlNfse || "";
    if (pdf) url = await baixarEAnexar(pdf, `os/${empKey}/os_${numOS}/nfse_${num || numOS}.pdf`); // pdfApenas=true: só guarda se for PDF
    return { num, url, raw: nfse };
  } catch { return { num: "", url: null, raw: null }; }
}

// NF-e do PV (peça): número + PDF via StatusPedido. O Omie exige o codigo_pedido (interno).
async function nfePedido(numPedido: string, codPedido: number | null, empKey: string, acc: Acc): Promise<{ num: string; url: string | null }> {
  if (!codPedido && !numPedido) return { num: "", url: null };
  try {
    const st: any = await omieCall("/produtos/pedido/", "StatusPedido", codPedido ? { codigo_pedido: codPedido } : { numero_pedido: numPedido }, acc);
    const nfe = (st?.ListaNfe || [])[0];
    if (!nfe) return { num: "", url: null };
    const num = String(nfe.numero_nfe || "");
    const url = nfe.danfe ? await baixarEAnexar(nfe.danfe, `os/${empKey}/pv_${numPedido}/danfe_${num || numPedido}.pdf`) : null;
    return { num, url };
  } catch { return { num: "", url: null }; }
}

function condicao(datas: string[]) {
  const qtd = datas.length;
  if (qtd <= 1) return { forma_pagamento: "Boleto 30 dias", qtd_parcelas: 1, vencimento_boleto: datas[0] || null, datas_parcelas: "" };
  return { forma_pagamento: "Boleto Parcelado", qtd_parcelas: qtd, vencimento_boleto: datas[0], datas_parcelas: datas.slice(1).join(", ") };
}

// Processa UMA OS específica (ConsultarOS) — pra debug (?os=NNNN), webhook (?codOS=) e tempo real.
// `consulta` = { cNumOS } ou { nCodOS }.
// `manual` = criação pedida NA MÃO pelo usuário na pasta (ignora a trava das notas).
// O fluxo automático SEMPRE chama com manual=false.
async function processarOSnum(consulta: Record<string, unknown>, label: string, dryRun: boolean, desde: string, origin: string, manual = false) {
  const debug: any = { os: label, tentativas: [] };
  for (const acc of ACCS) {
    let osData: any = null;
    try {
      osData = await omieCall("/servicos/os/", "ConsultarOS", consulta, acc);
    } catch (e: any) {
      debug.tentativas.push(`${acc.name}: ${String(e?.message || "").slice(0, 70)}`);
      continue;
    }
    const cab = osData?.Cabecalho || {};
    const info = osData?.InfoCadastro || {};
    const adic = osData?.InformacoesAdicionais || {};
    const empKey = acc.name.replace(/ /g, "_");
    debug.empresa = acc.name;
    debug.faturada = info.cFaturada; debug.cancelada = info.cCancelada;
    debug.dDtInc = info.dDtInc; debug.dDtAlt = info.dDtAlt; debug.dDtFat = info.dDtFat;

    if (info.cFaturada !== "S" || info.cCancelada === "S") { debug.resultado = "OS não está faturada (ou cancelada)"; return debug; }

    // OS interna (Conta Corrente = INTERNO) não gera card financeiro
    const deps: any[] = osData?.Departamentos || [];
    const contaCorrente = deps[0]?.cContaCorrente || adic.cContaCorrente || cab.cContaCorrente || "";
    debug.conta_corrente = contaCorrente;
    if (String(contaCorrente).toUpperCase().includes("INTERNO")) {
      debug.resultado = "OS interna (Conta Corrente INTERNO) — não cria card financeiro";
      return debug;
    }

    const dtFatISO = dataBRtoISO(info.dDtFat);
    debug.dDtFat_iso = dtFatISO; debug.corte = desde;
    if (dtFatISO && dtFatISO < desde) { debug.resultado = `OS faturada ANTES do corte ${desde} — não cria (use ?desde= mais antigo pra testar)`; return debug; }

    const numOS = String(cab.cNumOS);
    const nfse = await nfseDaOS(cab.nCodOS, numOS, empKey, acc);
    debug.nfse_num = nfse.num; debug.nfse_pdf = !!nfse.url; debug.nfse_url = nfse.url;
    if (dryRun) debug.nfse_raw = nfse.raw; // campos brutos da NFS-e (pra achar o link certo)

    // A NOTA ANEXADA NA PASTA VALE TANTO QUANTO A DO OMIE.
    // Muita nota não sai pelo Omie (NFS-e municipal sem PDF, nota rejeitada e reemitida
    // por fora, etc.) e é anexada na mão na pasta do cliente. Antes o sync só olhava o
    // Omie: exigia o Nº da NFS-e, o PV faturado e o DANFE — então anexar à mão não
    // destravava nada e o card nunca nascia.
    // select("*") de propósito: assim a coluna pv_manual entra quando existir, sem quebrar
    // se a migration ainda não tiver rodado.
    const { data: osRow } = await supabase.from("portal_nt_clientes_os")
      .select("*").eq("num_os", numOS).eq("empresa", acc.name).maybeSingle();
    const anexoServico = (osRow?.link_nf && String(osRow.link_nf).trim()) || nfse.url;
    const numNFServico = nfse.num || String(osRow?.num_nf || "").trim() || "";
    debug.anexo_servico_origem = osRow?.link_nf ? "pasta" : (nfse.url ? "StatusOS (Omie)" : "nenhum");

    // A NOTA DE SERVIÇO EXISTE? Só de duas formas:
    //  a) o Omie tem a NFS-e (nfse.num), ou
    //  b) alguém ANEXOU a nota de propósito na pasta (nf_manual).
    // Ter um link_nf qualquer NÃO basta — ele pode ter sido preenchido pelo sync com uma
    // URL solta. Sem essa checagem, OS sem nota nenhuma virava card no financeiro.
    const servicoManual = !!osRow?.nf_manual;
    debug.nf_servico_manual = servicoManual;
    if (!nfse.num && !servicoManual && !manual) {
      debug.aguardando_nf = true; debug.falta_servico = true;
      debug.resultado = "NFS-e ainda não emitida (StatusOS sem nota) — anexe a nota de serviço na pasta se ela foi emitida por fora";
      return debug;
    }
    if (!anexoServico && !manual) {
      debug.aguardando_nf = true; debug.falta_servico = true;
      debug.resultado = "NFS-e emitida mas sem PDF — anexe a nota de serviço na pasta do cliente";
      return debug;
    }

    const pedCli = cab.cNumPedCli || adic.cNumPedido || adic.cNumContrato || "";
    debug.pedido_cliente = pedCli;
    const auto = parsePedidoCliente(pedCli, acc.name);
    // PV manual (definido na pasta) tem prioridade sobre o que veio do Omie — serve pra
    // apontar o pedido certo quando o vínculo do Omie está errado/vazio.
    const pvManual = String(osRow?.pv_manual || "").trim();
    const pvNum = pvManual || auto.num;
    const pvEmp = auto.empresa;
    debug.pv = pvNum; debug.pv_empresa = pvEmp; debug.pv_manual = pvManual || null;
    const accPV = accPorNome(pvEmp);

    const { data: jaOS } = await supabase.from("Chamado_NF").select("id").eq("omie_num_os", numOS).eq("omie_empresa", acc.name).limit(1);
    if (jaOS && jaOS.length) {
      if (!dryRun) { debug.resultado = "Já existe card desta OS"; return debug; }
      debug.ja_existe = true; // no dryRun, segue mostrando o que seria criado
    }

    const pvParc = pvNum ? await parcelasPV(pvNum, null, accPV) : { datas: [] as string[], valor: 0, numNF: "", danfe: null, codCli: null, codPedido: null, faturado: false, existe: false };
    debug.pv_faturado = pvParc.faturado;

    const osParc = await parcelasOS(cab.nCodOS, acc);
    const datasDiferem = osParc.datas.length > 0 && (osParc.datas.length !== pvParc.datas.length || JSON.stringify(osParc.datas) !== JSON.stringify(pvParc.datas));
    const datasFinais = datasDiferem ? osParc.datas : (pvParc.datas.length ? pvParc.datas : osParc.datas);
    const cond = condicao(datasFinais);

    // NF de peça: do Omie OU anexada na pasta (mesma regra do serviço)
    const nfPeca = pvNum ? await nfePedido(pvNum, pvParc.codPedido, empKey, accPV) : { num: "", url: null };
    let pvRow: any = null;
    if (pvNum) {
      const { data } = await supabase.from("portal_nt_clientes_pv")
        .select("*").eq("num_pedido", pvNum).eq("empresa", pvEmp).maybeSingle();
      pvRow = data;
    }
    const pecaManual = !!pvRow?.nf_manual;
    const anexoPeca = pvNum ? ((pvRow?.link_nf && String(pvRow.link_nf).trim()) || nfPeca.url) : null;
    const numNFPeca = nfPeca.num || pvParc.numNF || String(pvRow?.numero_nf || "").trim() || "";
    debug.anexo_peca_origem = pvRow?.link_nf ? "pasta" : (nfPeca.url ? "StatusPedido (Omie)" : "nenhum");
    debug.nf_peca_manual = pecaManual;

    // Peça: idem. Só conta se o Omie tem a NF-e OU se a nota foi anexada de propósito.
    // (o PV precisa estar faturado no Omie, exceto quando a nota foi anexada à mão)
    if (pvNum && !pvParc.faturado && !pecaManual && !manual) {
      debug.aguardando_nf = true; debug.falta_peca = true;
      debug.resultado = `Peça (PV ${pvNum}) ainda NÃO faturada no Omie — não cria; espera as duas notas`;
      return debug;
    }
    if (pvNum && !nfPeca.url && !pecaManual && !manual) {
      debug.aguardando_nf = true; debug.falta_peca = true;
      debug.resultado = `NF de peça do PV ${pvNum} não saiu no Omie — anexe a NF de peça na pasta se ela foi emitida por fora`;
      return debug;
    }

    const valorOS = Number(cab.nValorTotal || 0);
    const valorPV = Number(pvParc.valor || pvRow?.valor_total || 0);
    const valor = valorOS + valorPV;
    const cli = await dadosCliente(cab.nCodCli, acc);
    Object.assign(debug, { cliente: cli.nome, nf_servico: numNFServico, nf_peca: numNFPeca, anexo_servico: anexoServico, anexo_peca: anexoPeca, valor_os: valorOS, valor_pv: valorPV, valor_total: valor, parcelas_de: datasDiferem ? "OS" : "PV", ...cond });

    // Gate de COMPLETUDE: o card só nasce quando o serviço está COMPLETO na pasta —
    // com a NF de serviço e, se houver peça vinculada, a NF de peça. De qualquer origem
    // (Omie ou anexo manual). Ao anexar a NF na pasta, este sync roda de novo e cria o card.
    if (pvNum && !anexoPeca && !manual) {
      debug.aguardando_nf = true; debug.falta_peca = true;
      debug.resultado = `NF de peça do PV ${pvNum} sem PDF — anexe a NF de peça na pasta do cliente`;
      return debug;
    }
    if (manual) { debug.criado_manualmente = true; debug.obs_manual = "Card criado À MÃO pelo usuário na pasta (fora do fluxo automático)"; }

    const row: Record<string, unknown> = {
      nom_cliente: cli.nome, cnpj_cliente: cli.cnpj, valor_servico: valor,
      num_nf_servico: numNFServico, anexo_nf_servico: anexoServico, num_nf_peca: numNFPeca, anexo_nf_peca: anexoPeca,
      forma_pagamento: cond.forma_pagamento, qtd_parcelas: cond.qtd_parcelas, vencimento_boleto: cond.vencimento_boleto, datas_parcelas: cond.datas_parcelas,
      setor: "Financeiro", status: "gerar_boleto", tarefa: "Gerar Boleto", setor_destino: "oficina", origem: "omie_os",
      omie_num_os: numOS, omie_num_pedido: pvNum || null, omie_empresa: acc.name,
      obs: `Gerado do Omie — OS ${numOS} (${acc.name}). Pedido cliente: ${pedCli || "(sem)"} → PV ${pvNum || "(sem)"} (${pvEmp}).${anexoServico ? "" : " ATENCAO: a NFS-e desta OS nao veio em PDF do Omie (NFS-e municipal) - anexe a nota de servico manualmente."}`,
    };

    if (dryRun) { debug.resultado = "OK — criaria o card"; debug.row = row; return debug; }
    const { data: ins, error } = await supabase.from("Chamado_NF").insert([row]).select("id").maybeSingle();
    if (error) { debug.resultado = "Erro ao inserir: " + error.message; return debug; }
    await supabase.from("audit_log").insert([{ user_id: SISTEMA_UID, user_nome: "Sistema (Omie)", sistema: "financeiro", acao: "criar", entidade: "Chamado_NF", entidade_id: String(ins!.id), entidade_label: `NF #${ins!.id} - ${cli.nome || ""}`, detalhes: { origem: "omie_os", os: numOS, pedido: pvNum, empresa: acc.name, valor } }]);
    await notificarCard(origin, "Pós-Vendas", cli.nome || "", { numOS, semNfsePdf: !anexoServico });
    debug.resultado = `Card criado (#${ins!.id})`; debug.card_id = ins!.id;
    return debug;
  }
  debug.resultado = "OS não encontrada em nenhuma empresa";
  return debug;
}

async function handler(req: NextRequest) {
  const limite = parseInt(req.nextUrl.searchParams.get("limite") || "300");
  // Janela de busca por data de CADASTRO da OS (larga, pra pegar OS antigas faturadas agora).
  // O corte de "de agora em diante" é aplicado pela data de FATURAMENTO (dDtFat) abaixo.
  const dias = parseInt(req.nextUrl.searchParams.get("dias") || "120");
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";
  const desde = req.nextUrl.searchParams.get("desde") || DATA_CORTE; // corte por data de faturamento

  // Modo OS específica (debug/webhook): ?os=5043 (número) ou ?codOS=123 (código interno)
  //
  // ?manual=1 → SÓ pelo clique do usuário na pasta do cliente. O automático NUNCA usa isto:
  // quando falta nota, o card não nasce sozinho — a pasta mostra o erro e a pessoa decide
  // criar o card na mão. É o único caminho que ignora a trava das duas notas.
  const osParam = req.nextUrl.searchParams.get("os");
  const codOSParam = req.nextUrl.searchParams.get("codOS");
  const manual = req.nextUrl.searchParams.get("manual") === "1";
  if (osParam || codOSParam) {
    const consulta = codOSParam ? { nCodOS: Number(codOSParam) } : { cNumOS: String(osParam).trim() };
    const corte = manual ? "1900-01-01" : desde;
    try { return NextResponse.json({ sucesso: true, ...(await processarOSnum(consulta, codOSParam || String(osParam), dryRun, corte, req.nextUrl.origin, manual)) }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }

  const hoje = new Date();
  const de = new Date(hoje.getTime() - dias * 86400000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const relatorio: any[] = [];
  const amostra: any[] = [];
  const porEmpresa: Record<string, { faturadas: number; no_periodo: number; com_nfse: number; aguardando_nfse: number; candidatas: number; criados: number; jaExistiam: number; semPedido: number; aguardandoPV: number }> = {};
  let criados = 0, jaExistiam = 0, candidatas = 0, semPedido = 0, aguardandoPV = 0;
  const MAX_STATUS = parseInt(req.nextUrl.searchParams.get("maxStatus") || "120"); // teto de chamadas StatusOS por empresa

  try {
    for (const acc of ACCS) {
      porEmpresa[acc.name] = { faturadas: 0, no_periodo: 0, com_nfse: 0, aguardando_nfse: 0, candidatas: 0, criados: 0, jaExistiam: 0, semPedido: 0, aguardandoPV: 0 };
      const empKey = acc.name.replace(/ /g, "_");
      let statusCalls = 0;

      let pag = 1, totPag = 1, processadas = 0;
      while (pag <= totPag && processadas < limite && statusCalls < MAX_STATUS) {
        let r: any;
        try {
          r = await omieCall("/servicos/os/", "ListarOS", {
            pagina: pag, registros_por_pagina: 100,
            filtrar_por_data_de: fmt(de), filtrar_por_data_ate: fmt(hoje),
            filtrar_apenas_alteracao: "S", // faturar = alterar a OS → pega faturadas hoje mesmo sendo antigas
          }, acc);
        } catch (e: any) {
          // Omie lança erro quando a faixa não tem registros — trata como "vazio"
          if (String(e?.message || "").toLowerCase().includes("não existem registros")) break;
          throw e;
        }
        totPag = r?.total_de_paginas || 1;

        for (const os of r?.osCadastro || []) {
          processadas++;
          const cab = os?.Cabecalho || {};
          const info = os?.InfoCadastro || {};
          const adic = os?.InformacoesAdicionais || {};
          if (info.cFaturada !== "S" || info.cCancelada === "S") continue;

          // OS interna (Conta Corrente = INTERNO) — pula, não gera card financeiro
          const deps: any[] = os?.Departamentos || [];
          const cc = deps[0]?.cContaCorrente || adic.cContaCorrente || cab.cContaCorrente || "";
          if (String(cc).toUpperCase().includes("INTERNO")) continue;

          porEmpresa[acc.name].faturadas++;

          if (dryRun && amostra.length < 12) {
            amostra.push({ empresa: acc.name, os: String(cab.cNumOS), dDtInc: info.dDtInc, dDtAlt: info.dDtAlt, dDtFat: info.dDtFat, pedido_cliente: cab.cNumPedCli || adic.cNumPedido || adic.cNumContrato || "" });
          }

          // corte por data de faturamento (antes de chamar StatusOS, pra não estourar a API)
          const dtFatISO = dataBRtoISO(info.dDtFat);
          if (dtFatISO && dtFatISO < desde) continue;
          porEmpresa[acc.name].no_periodo++;
          if (statusCalls >= MAX_STATUS) break;

          const numOS = String(cab.cNumOS);
          // NFS-e via StatusOS (o ListarOS não traz o número confiável)
          statusCalls++;
          const nfse = await nfseDaOS(cab.nCodOS, numOS, empKey, acc);
          if (!nfse.num) { porEmpresa[acc.name].aguardando_nfse++; continue; } // NFS-e ainda não emitida
          porEmpresa[acc.name].com_nfse++;
          const numNFSe = nfse.num;
          // Prioriza a NFS-e que o portal já baixou (módulo Clientes)
          const { data: osRow } = await supabase.from("portal_nt_clientes_os").select("link_nf").eq("num_os", numOS).eq("empresa", acc.name).maybeSingle();
          const anexoServico = (osRow?.link_nf && String(osRow.link_nf).trim()) || nfse.url;

          const pedCli = cab.cNumPedCli || adic.cNumPedido || adic.cNumContrato || "";
          candidatas++; porEmpresa[acc.name].candidatas++;

          // Pedido de venda vinculado (número + empresa) a partir do campo da OS
          const { num: pvNum, empresa: pvEmp } = parsePedidoCliente(pedCli, acc.name);
          const accPV = accPorNome(pvEmp);

          // idempotência: card desta OS, ou card de peças do mesmo PV
          const { data: jaOS } = await supabase.from("Chamado_NF").select("id").eq("omie_num_os", numOS).eq("omie_empresa", acc.name).limit(1);
          let jaPV: any[] | null = null;
          if (pvNum) { const { data } = await supabase.from("Chamado_NF").select("id").eq("omie_num_pedido", pvNum).eq("omie_empresa", pvEmp).limit(1); jaPV = data; }
          if ((jaOS && jaOS.length) || (jaPV && jaPV.length)) { jaExistiam++; porEmpresa[acc.name].jaExistiam++; continue; }

          // VÍNCULO: se a OS aponta um Pedido de Venda no campo, esse PV PRECISA estar faturado.
          // Se faturou só a OS e a peça (PV) ainda não, NÃO cria — espera as duas notas.
          const pvParc = pvNum ? await parcelasPV(pvNum, null, accPV) : { datas: [] as string[], valor: 0, numNF: "", danfe: null, codCli: null, codPedido: null, faturado: false, existe: false };
          if (pvNum && !pvParc.faturado) {
            aguardandoPV++; porEmpresa[acc.name].aguardandoPV++;
            relatorio.push({ empresa: acc.name, os: numOS, pv: pvNum, pv_empresa: pvEmp, aguardando: "PV (peça) ainda não faturado" });
            continue;
          }
          if (!pvNum) { semPedido++; porEmpresa[acc.name].semPedido++; }

          // Parcelas: PV (principal) e OS (prioriza se as datas diferem — "Número de Parcelas" da OS)
          const osParc = await parcelasOS(cab.nCodOS, acc);
          const datasDiferem = osParc.datas.length > 0 &&
            (osParc.datas.length !== pvParc.datas.length || JSON.stringify(osParc.datas) !== JSON.stringify(pvParc.datas));
          const datasFinais = datasDiferem ? osParc.datas : (pvParc.datas.length ? pvParc.datas : osParc.datas);
          const cond = condicao(datasFinais);

          // NF de peça (PV): número + PDF via StatusPedido
          const nfPeca = pvNum ? await nfePedido(pvNum, pvParc.codPedido, empKey, accPV) : { num: "", url: null };
          const numNFPeca = nfPeca.num || pvParc.numNF || "";

          // Valores: soma NF serviço (OS) + NF peça (PV)
          const valorOS = Number(cab.nValorTotal || 0);
          const valorPV = Number(pvParc.valor || 0);
          const valor = valorOS + valorPV;

          // Cliente (nome + CNPJ)
          const cli = await dadosCliente(cab.nCodCli, acc);

          // Gate de COMPLETUDE: só cria quando o serviço está completo na pasta
          // (NF de serviço + NF de peça quando houver). Senão, fica aguardando o anexo.
          if (!anexoServico || (!!pvNum && !nfPeca.url)) {
            relatorio.push({ empresa: acc.name, os: numOS, pv: pvNum, aguardando: `${!anexoServico ? "NF de serviço" : ""}${(!anexoServico && !!pvNum && !nfPeca.url) ? " + " : ""}${(!!pvNum && !nfPeca.url) ? "NF de peça" : ""} na pasta do cliente` });
            continue;
          }

          const row: Record<string, unknown> = {
            nom_cliente: cli.nome,
            cnpj_cliente: cli.cnpj,
            valor_servico: valor,
            num_nf_servico: numNFSe,
            anexo_nf_servico: anexoServico,
            num_nf_peca: numNFPeca,
            anexo_nf_peca: nfPeca.url,
            forma_pagamento: cond.forma_pagamento,
            qtd_parcelas: cond.qtd_parcelas,
            vencimento_boleto: cond.vencimento_boleto,
            datas_parcelas: cond.datas_parcelas,
            setor: "Financeiro",
            status: "gerar_boleto",
            tarefa: "Gerar Boleto",
            setor_destino: "oficina",
            origem: "omie_os",
            omie_num_os: numOS,
            omie_num_pedido: pvNum || null,
            omie_empresa: acc.name,
            obs: `Gerado do Omie — OS ${numOS} (${acc.name}). Pedido cliente: ${pedCli || "(sem)"} → PV ${pvNum || "(sem)"} (${pvEmp}). Parcelas: ${datasDiferem ? "OS (priorizado)" : "PV"}.${anexoServico ? "" : " ATENCAO: NFS-e sem PDF do Omie - anexe a nota de servico manualmente."}`,
          };

          relatorio.push({
            empresa: acc.name, os: numOS, pedido_cliente: pedCli, pv: pvNum, pv_empresa: pvEmp,
            nf_servico: numNFSe, nf_peca: numNFPeca, valor_os: valorOS, valor_pv: valorPV, valor_total: valor,
            parcelas_de: datasDiferem ? "OS" : "PV", ...cond,
          });

          if (!dryRun) {
            const { data: ins, error } = await supabase.from("Chamado_NF").insert([row]).select("id").maybeSingle();
            if (!error && ins) {
              criados++; porEmpresa[acc.name].criados++;
              await supabase.from("audit_log").insert([{
                user_id: SISTEMA_UID, user_nome: "Sistema (Omie)", sistema: "financeiro", acao: "criar",
                entidade: "Chamado_NF", entidade_id: String(ins.id), entidade_label: `NF #${ins.id} - ${cli.nome || ""}`,
                detalhes: { origem: "omie_os", os: numOS, pedido: pvNum, empresa: acc.name, valor },
              }]);
              await notificarCard(req.nextUrl.origin, "Pós-Vendas", cli.nome || "", { numOS, semNfsePdf: !anexoServico });
            } else if (error) relatorio[relatorio.length - 1].erro = error.message;
          }
          await new Promise(r => setTimeout(r, 220));
        }
        pag++;
        if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
      }
    }

    return NextResponse.json({
      sucesso: true, dryRun, desde,
      candidatas, criados, jaExistiam, semPedidoVinculado: semPedido, aguardandoPV,
      por_empresa: porEmpresa,
      amostra: dryRun ? amostra : undefined,
      itens: relatorio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handler(req); }
export async function GET(req: NextRequest) { return handler(req); }
