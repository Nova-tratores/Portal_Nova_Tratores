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

async function cnpjCliente(codCli: number | null, acc: Acc): Promise<string> {
  if (!codCli) return "";
  try {
    const { data } = await supabase.from("portal_nt_clientes_cadastro_omie").select("cnpj_cpf").eq("cod_cli", codCli).maybeSingle();
    if (data?.cnpj_cpf) return String(data.cnpj_cpf).trim();
  } catch { /* ignore */ }
  try {
    const c: any = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codCli }, acc);
    return String(c?.cnpj_cpf || "").trim();
  } catch { return ""; }
}

function condicao(datas: string[]) {
  const qtd = datas.length;
  if (qtd <= 1) return { forma_pagamento: "Boleto 30 dias", qtd_parcelas: 1, vencimento_boleto: datas[0] || null, datas_parcelas: "" };
  return { forma_pagamento: "Boleto Parcelado", qtd_parcelas: qtd, vencimento_boleto: datas[0], datas_parcelas: datas.slice(1).join(", ") };
}

async function handler(req: NextRequest) {
  const limite = parseInt(req.nextUrl.searchParams.get("limite") || "300");
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";

  const relatorio: any[] = [];
  const porEmpresa: Record<string, { candidatas: number; criados: number; jaExistiam: number; semPedido: number; aguardandoPV: number }> = {};
  let criados = 0, jaExistiam = 0, candidatas = 0, semPedido = 0, aguardandoPV = 0;

  try {
    for (const acc of ACCS) {
      porEmpresa[acc.name] = { candidatas: 0, criados: 0, jaExistiam: 0, semPedido: 0, aguardandoPV: 0 };

      // OS faturadas (a partir do corte), com NFS-e e com "Nº do Pedido do Cliente"
      const { data: oss } = await supabase.from("portal_nt_clientes_os")
        .select("num_os, cod_os, empresa, cod_cli, cliente_nome, num_pedido_cli, num_nf, link_nf, valor_total")
        .eq("empresa", acc.name).eq("faturada", true).eq("cancelada", false)
        .not("num_nf", "is", null).neq("num_nf", "")
        .not("num_pedido_cli", "is", null).neq("num_pedido_cli", "")
        .gte("data_faturamento", DATA_CORTE)
        .order("data_faturamento", { ascending: false })
        .limit(limite);

      for (const os of oss || []) {
        candidatas++;
        porEmpresa[acc.name].candidatas++;

        // Pedido de venda (número + empresa) a partir do campo da OS
        const { num: pvNum, empresa: pvEmp } = parsePedidoCliente(os.num_pedido_cli, acc.name);
        const accPV = accPorNome(pvEmp);

        // idempotência: já existe card desta OS? ou um card de peças do mesmo PV?
        const { data: jaOS } = await supabase.from("Chamado_NF").select("id").eq("omie_num_os", String(os.num_os)).eq("omie_empresa", acc.name).limit(1);
        let jaPV: any[] | null = null;
        if (pvNum) { const { data } = await supabase.from("Chamado_NF").select("id").eq("omie_num_pedido", pvNum).eq("omie_empresa", pvEmp).limit(1); jaPV = data; }
        if ((jaOS && jaOS.length) || (jaPV && jaPV.length)) { jaExistiam++; porEmpresa[acc.name].jaExistiam++; continue; }

        // Dados do PV no banco (NF de peça, valor, código, faturado)
        let pvRow: any = null;
        if (pvNum) {
          const { data } = await supabase.from("portal_nt_clientes_pv")
            .select("num_pedido, cod_pedido, numero_nf, link_nf, valor_total, cod_cli, faturado, cancelado")
            .eq("empresa", pvEmp).eq("num_pedido", pvNum).maybeSingle();
          pvRow = data;
        }

        // Parcelas/condição: PV (principal) e OS (prioriza se as datas diferem)
        const pvParc = pvNum ? await parcelasPV(pvNum, pvRow?.cod_pedido ?? null, accPV) : { datas: [], valor: 0, numNF: "", danfe: null, codCli: null, faturado: false, existe: false };

        // VÍNCULO: se a OS referencia um Pedido de Venda, esse PV TEM que estar faturado.
        // Só gera o card quando AS DUAS notas (serviço + peça) já saíram.
        if (pvNum) {
          const pvFaturado = pvRow ? pvRow.faturado === true : pvParc.faturado;
          if (!pvFaturado) {
            aguardandoPV++; porEmpresa[acc.name].aguardandoPV++;
            relatorio.push({ empresa: acc.name, os: os.num_os, pv: pvNum, pv_empresa: pvEmp, aguardando: "PV ainda não faturado" });
            continue;
          }
        }
        const osParc = await parcelasOS(os.cod_os, acc);
        const datasDiferem = osParc.datas.length > 0 &&
          (osParc.datas.length !== pvParc.datas.length || JSON.stringify(osParc.datas) !== JSON.stringify(pvParc.datas));
        const datasFinais = datasDiferem ? osParc.datas : (pvParc.datas.length ? pvParc.datas : osParc.datas);
        const cond = condicao(datasFinais);

        // Valores: soma NF serviço (OS) + NF peça (PV)
        const valorOS = Number(os.valor_total || 0);
        const valorPV = Number(pvRow?.valor_total ?? pvParc.valor ?? 0);
        const valor = valorOS + valorPV;

        const numNFPeca = String(pvRow?.numero_nf || pvParc.numNF || "");
        const anexoPeca = pvRow?.link_nf || null;
        if (!pvNum || (!pvRow && !pvParc.datas.length && !numNFPeca)) { semPedido++; porEmpresa[acc.name].semPedido++; }

        const codCli = os.cod_cli || pvRow?.cod_cli || pvParc.codCli || null;
        const cnpj = await cnpjCliente(codCli, acc);

        const row: Record<string, unknown> = {
          nom_cliente: os.cliente_nome || "",
          cnpj_cliente: cnpj,
          valor_servico: valor,
          num_nf_servico: String(os.num_nf || ""),
          anexo_nf_servico: os.link_nf || null,
          num_nf_peca: numNFPeca,
          anexo_nf_peca: anexoPeca,
          forma_pagamento: cond.forma_pagamento,
          qtd_parcelas: cond.qtd_parcelas,
          vencimento_boleto: cond.vencimento_boleto,
          datas_parcelas: cond.datas_parcelas,
          setor: "Financeiro",
          status: "gerar_boleto",
          tarefa: "Gerar Boleto",
          setor_destino: "oficina",
          origem: "omie_os",
          omie_num_os: String(os.num_os),
          omie_num_pedido: pvNum || null,
          omie_empresa: acc.name,
          obs: `Gerado do Omie — OS ${os.num_os} (${acc.name}). Pedido cliente: ${os.num_pedido_cli} → PV ${pvNum || "?"} (${pvEmp}). Parcelas: ${datasDiferem ? "OS (priorizado)" : "PV"}.`,
        };

        relatorio.push({
          empresa: acc.name, os: os.num_os, pedido_cliente: os.num_pedido_cli, pv: pvNum, pv_empresa: pvEmp,
          nf_servico: os.num_nf, nf_peca: numNFPeca, valor_os: valorOS, valor_pv: valorPV, valor_total: valor,
          parcelas_de: datasDiferem ? "OS" : "PV", ...cond,
        });

        if (!dryRun) {
          const { data: ins, error } = await supabase.from("Chamado_NF").insert([row]).select("id").maybeSingle();
          if (!error && ins) {
            criados++; porEmpresa[acc.name].criados++;
            await supabase.from("audit_log").insert([{
              user_id: SISTEMA_UID, user_nome: "Sistema (Omie)", sistema: "financeiro", acao: "criar",
              entidade: "Chamado_NF", entidade_id: String(ins.id), entidade_label: `NF #${ins.id} - ${os.cliente_nome || ""}`,
              detalhes: { origem: "omie_os", os: os.num_os, pedido: pvNum, empresa: acc.name, valor },
            }]);
            await notificarCard(req.nextUrl.origin, "Pós-Vendas", os.cliente_nome || "");
          } else if (error) relatorio[relatorio.length - 1].erro = error.message;
        }
        await new Promise(r => setTimeout(r, 220));
      }
    }

    return NextResponse.json({
      sucesso: true, dryRun, desde: DATA_CORTE,
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
