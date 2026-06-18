import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  { name: "Nova Tratores", key: process.env.OMIE_APP_KEY || "2729522270475", secret: process.env.OMIE_APP_SECRET || "113d785bb86c48d064889d4d73348131" },
  { name: "Castro Pecas", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];
const accPorNome = (nome: string) => ACCS.find(a => a.name === nome) || ACCS[0];

// Só gera card para notas faturadas a partir desta data (ignora histórico antigo)
const DATA_CORTE = process.env.SYNC_FINANCEIRO_DESDE || "2026-06-18";
// user_id "do sistema" para registrar criações automáticas no audit_log
const SISTEMA_UID = "00000000-0000-0000-0000-000000000000";

// Notifica (admins + quem tem acesso ao financeiro) que um card foi criado pelo sistema
async function notificarCard(origin: string, setor: string, cliente: string) {
  try {
    await fetch(`${origin}/api/financeiro/notificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `Novo card no financeiro — ${setor}`,
        descricao: `Gerado automaticamente do Omie${cliente ? ` — ${cliente}` : ""}.`,
        link: "/financeiro",
      }),
    });
  } catch { /* ignore */ }
}

async function omieCall(ep: string, call: string, param: Record<string, unknown>, acc: Acc): Promise<any> {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 60000)); return omieCall(ep, call, param, acc); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(data.faultstring);
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
async function parcelasPV(numPedido: string, codPedido: number | null, acc: Acc): Promise<{ datas: string[]; valor: number; numNF: string; danfe: string | null; codCli: number | null; faturado: boolean; existe: boolean }> {
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
  const faturado = pv?.infoCadastro?.faturado === "S";
  return { datas, valor, numNF, danfe: null, codCli, faturado, existe: !!pv };
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
async function baixarEAnexar(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ehPdf = buffer.slice(0, 5).toString("latin1").startsWith("%PDF");
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: ehPdf ? "application/pdf" : (res.headers.get("content-type") || "application/octet-stream"), upsert: true });
    if (error) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return null; }
}

// NFS-e da OS (número já vem do ListarOS; aqui pega o PDF via StatusOS)
async function nfseLinkOS(codOS: number, numOS: string, empKey: string, acc: Acc): Promise<string | null> {
  try {
    const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: codOS }, acc);
    const nfse = (st?.ListaRpsNfse || [])[0];
    const danfe = nfse?.danfe || nfse?.cUrlNfse || "";
    return danfe ? await baixarEAnexar(danfe, `os/${empKey}/os_${numOS}/nfse_${numOS}.pdf`) : null;
  } catch { return null; }
}

// NF-e do PV (peça): número + PDF via StatusPedido
async function nfePedido(numPedido: string, empKey: string, acc: Acc): Promise<{ num: string; url: string | null }> {
  try {
    const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { numero_pedido: numPedido }, acc);
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

async function handler(req: NextRequest) {
  const limite = parseInt(req.nextUrl.searchParams.get("limite") || "300");
  // Janela de busca por data de CADASTRO da OS (larga, pra pegar OS antigas faturadas agora).
  // O corte de "de agora em diante" é aplicado pela data de FATURAMENTO (dDtFat) abaixo.
  const dias = parseInt(req.nextUrl.searchParams.get("dias") || "120");
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";
  const desde = req.nextUrl.searchParams.get("desde") || DATA_CORTE; // corte por data de faturamento

  const hoje = new Date();
  const de = new Date(hoje.getTime() - dias * 86400000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const relatorio: any[] = [];
  const porEmpresa: Record<string, { faturadas: number; com_nfse: number; candidatas: number; criados: number; jaExistiam: number; semPedido: number; aguardandoPV: number }> = {};
  let criados = 0, jaExistiam = 0, candidatas = 0, semPedido = 0, aguardandoPV = 0;

  try {
    for (const acc of ACCS) {
      porEmpresa[acc.name] = { faturadas: 0, com_nfse: 0, candidatas: 0, criados: 0, jaExistiam: 0, semPedido: 0, aguardandoPV: 0 };
      const empKey = acc.name.replace(/ /g, "_");

      let pag = 1, totPag = 1, processadas = 0;
      while (pag <= totPag && processadas < limite) {
        let r: any;
        try {
          r = await omieCall("/servicos/os/", "ListarOS", {
            pagina: pag, registros_por_pagina: 100,
            filtrar_por_data_de: fmt(de), filtrar_por_data_ate: fmt(hoje),
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
          porEmpresa[acc.name].faturadas++;

          const numNFSe = info.nNumNFSe ? String(info.nNumNFSe) : "";
          if (!numNFSe) continue; // precisa ter NFS-e emitida
          porEmpresa[acc.name].com_nfse++;

          // corte por data de faturamento
          const dtFatISO = dataBRtoISO(info.dDtFat);
          if (dtFatISO && dtFatISO < desde) continue;

          const numOS = String(cab.cNumOS);
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
          const pvParc = pvNum ? await parcelasPV(pvNum, null, accPV) : { datas: [] as string[], valor: 0, numNF: "", danfe: null, codCli: null, faturado: false, existe: false };
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

          // NFs (links em PDF) e números
          const anexoServico = await nfseLinkOS(cab.nCodOS, numOS, empKey, acc);
          const nfPeca = pvNum ? await nfePedido(pvNum, empKey, accPV) : { num: "", url: null };
          const numNFPeca = nfPeca.num || pvParc.numNF || "";

          // Valores: soma NF serviço (OS) + NF peça (PV)
          const valorOS = Number(cab.nValorTotal || 0);
          const valorPV = Number(pvParc.valor || 0);
          const valor = valorOS + valorPV;

          // Cliente (nome + CNPJ)
          const cli = await dadosCliente(cab.nCodCli, acc);

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
            obs: `Gerado do Omie — OS ${numOS} (${acc.name}). Pedido cliente: ${pedCli || "(sem)"} → PV ${pvNum || "(sem)"} (${pvEmp}). Parcelas: ${datasDiferem ? "OS (priorizado)" : "PV"}.`,
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
              await notificarCard(req.nextUrl.origin, "Pós-Vendas", cli.nome || "");
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
      itens: relatorio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handler(req); }
export async function GET(req: NextRequest) { return handler(req); }
