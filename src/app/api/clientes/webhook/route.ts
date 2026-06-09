import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getAccByKey(appKey: string): Acc | undefined {
  return ACCS.find(a => a.key === appKey);
}

async function omieCall(ep: string, call: string, param: Record<string, unknown>, acc: Acc) {
  const res = await fetch(`${OMIE_BASE}${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 60000)); return omieCall(ep, call, param, acc); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(data.faultstring);
  return data;
}

const ETAPA_OS: Record<string, string> = {
  "10": "Em Aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada",
};

function parseData(d: string): string | null {
  if (!d) return null;
  const [dia, mes, ano] = d.split("/");
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes}-${dia}`;
}

const BUCKET = "clientes-docs";

async function downloadNF(url: string, path: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return url;
    const ct = res.headers.get("content-type") || "application/pdf";
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: ct, upsert: true });
    if (error) return url;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return url; }
}

// Processar OS criada/alterada/faturada
async function processarOS(codOS: number, acc: Acc) {
  const os: any = await omieCall("/servicos/os/", "ConsultarOS", { nCodOS: codOS }, acc);
  const cab = os.Cabecalho;
  const info = os.InfoCadastro;
  const adicional = os.InformacoesAdicionais;
  const servicos: any[] = os.ServicosPrestados || [];

  let status = ETAPA_OS[cab.cEtapa] || cab.cEtapa;
  if (info.cCancelada === "S") status = "Cancelada";

  const numPedidoCli = cab.cNumPedCli || adicional?.cNumPedido || adicional?.cNumContrato || "";

  // Projeto
  let projetoNome = "";
  if (adicional?.nCodProj) {
    try {
      const { data: proj } = await supabase.from("portal_nt_projetos_PRINCIPAL").select("nome").eq("codigo", adicional.nCodProj).eq("empresa", acc.name).single();
      projetoNome = proj?.nome || "";
    } catch {}
  }

  // Vendedor
  let vendedorNome = "";
  if (cab.nCodVend) {
    try {
      const vend: any = await omieCall("/geral/vendedores/", "ConsultarVendedor", { codigo: cab.nCodVend }, acc);
      vendedorNome = vend?.nome || "";
    } catch {}
  }

  const row = {
    num_os: cab.cNumOS,
    cod_os: cab.nCodOS,
    empresa: acc.name,
    cod_cli: cab.nCodCli,
    etapa: cab.cEtapa,
    data_previsao: parseData(cab.dDtPrevisao),
    data_inclusao: parseData(info.dDtInc),
    data_faturamento: parseData(info.dDtFat || "") || null,
    valor_total: cab.nValorTotal,
    status,
    cancelada: info.cCancelada === "S",
    faturada: info.cFaturada === "S",
    num_pedido_cli: numPedidoCli,
    vendedor: vendedorNome,
    cod_vendedor: cab.nCodVend,
    cidade: adicional?.cCidPrestServ || "",
    contrato: adicional?.cNumContrato || "",
    projeto: projetoNome,
    descricao: servicos.find((s: any) => s.cDescServ)?.cDescServ || "",
    servicos: JSON.stringify(servicos.map((s: any) => ({
      cod: s.nCodServico, qtd: s.nQtde, valor: s.nValUnit, desc: s.cDescServ || "",
    }))),
    obs: os.Observacoes?.cObsOS || "",
    dados_adic: adicional?.cDadosAdicNF || "",
    updated_at: new Date().toISOString(),
  };

  await supabase.from("portal_nt_clientes_os").upsert(row, { onConflict: "num_os,empresa" });

  // Se faturada, buscar NFS-e
  if (info.cFaturada === "S") {
    try {
      const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: codOS }, acc);
      const nfseList: any[] = st?.ListaRpsNfse || [];
      if (nfseList.length > 0) {
        const nfse = nfseList[0];
        const numNFSe = nfse.nNfse || "";
        const danfeUrl = nfse.danfe || nfse.cUrlNfse || "";
        if (numNFSe || danfeUrl) {
          let finalUrl = danfeUrl;
          if (danfeUrl) finalUrl = await downloadNF(danfeUrl, `${acc.name.replace(/ /g, "_")}/os_${cab.cNumOS}/nfse_${numNFSe || cab.cNumOS}.pdf`);
          const updates: Record<string, string> = {};
          if (numNFSe) updates.num_nf = numNFSe;
          if (finalUrl) updates.link_nf = finalUrl;
          await supabase.from("portal_nt_clientes_os").update(updates).eq("num_os", cab.cNumOS).eq("empresa", acc.name);
        }
      }
    } catch {}
  }

  // Enriquecer nome do cliente
  try {
    const { data: cli } = await supabase.from("portal_nt_clientes_cadastro_omie").select("nome_fantasia, razao_social").eq("cod_cli", cab.nCodCli).eq("empresa", acc.name).single();
    if (cli) {
      await supabase.from("portal_nt_clientes_os").update({ cliente_nome: cli.nome_fantasia || cli.razao_social }).eq("num_os", cab.cNumOS).eq("empresa", acc.name);
    }
  } catch {}

  console.log(`[webhook] OS ${cab.cNumOS} (${acc.name}): ${status}`);
  return { num_os: cab.cNumOS, status };
}

// Processar PV criado/alterado/faturado
async function processarPV(codPedido: number, acc: Acc) {
  const raw: any = await omieCall("/produtos/pedido/", "ConsultarPedido", { codigo_pedido: codPedido }, acc);
  const pv = raw.pedido_venda_produto || raw;
  const cab = pv.cabecalho;
  const info = pv.infoCadastro || {};
  const frete = pv.frete || {};

  const itens = (pv.det || []).map((d: any) => ({
    codigo: d.produto?.codigo || "",
    descricao: d.produto?.descricao || "",
    quantidade: d.produto?.quantidade || 0,
    valor_unitario: d.produto?.valor_unitario || 0,
    valor_total: d.produto?.valor_total || 0,
  }));

  let numNF = frete.numero_nota_fiscal || "";
  if (!numNF && pv.nfRelacionada?.nNF) numNF = String(pv.nfRelacionada.nNF);

  const row = {
    num_pedido: cab.numero_pedido,
    cod_pedido: cab.codigo_pedido,
    empresa: acc.name,
    cod_cli: cab.codigo_cliente,
    data_previsao: parseData(cab.data_previsao),
    data_inclusao: parseData(info.dInc),
    etapa: cab.etapa,
    valor_total: pv.total_pedido?.valor_total_pedido || 0,
    cancelado: info.cancelado === "S",
    faturado: info.faturado === "S",
    numero_nf: numNF,
    itens: JSON.stringify(itens),
    observacoes: pv.observacoes?.obs_venda || "",
    updated_at: new Date().toISOString(),
  };

  await supabase.from("portal_nt_clientes_pv").upsert(row, { onConflict: "num_pedido,empresa" });

  // Se faturado, buscar NF-e
  if (info.faturado === "S") {
    try {
      const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: codPedido }, acc);
      const nfeList: any[] = st?.ListaNfe || [];
      if (nfeList.length > 0) {
        const nfe = nfeList[0];
        const numNFe = nfe.numero_nfe || "";
        const danfeUrl = nfe.danfe || "";
        if (numNFe || danfeUrl) {
          let finalUrl = danfeUrl;
          if (danfeUrl) finalUrl = await downloadNF(danfeUrl, `${acc.name.replace(/ /g, "_")}/pv_${cab.numero_pedido}/danfe_${numNFe || cab.numero_pedido}.pdf`);
          const updates: Record<string, string> = {};
          if (numNFe) updates.numero_nf = numNFe;
          if (finalUrl) updates.link_nf = finalUrl;
          await supabase.from("portal_nt_clientes_pv").update(updates).eq("num_pedido", cab.numero_pedido).eq("empresa", acc.name);
        }
      }
    } catch {}
  }

  // Enriquecer nome do cliente
  try {
    const { data: cli } = await supabase.from("portal_nt_clientes_cadastro_omie").select("nome_fantasia, razao_social").eq("cod_cli", cab.codigo_cliente).eq("empresa", acc.name).single();
    if (cli) {
      await supabase.from("portal_nt_clientes_pv").update({ cliente_nome: cli.nome_fantasia || cli.razao_social }).eq("num_pedido", cab.numero_pedido).eq("empresa", acc.name);
    }
  } catch {}

  console.log(`[webhook] PV ${cab.numero_pedido} (${acc.name}): ${info.faturado === "S" ? "Faturado" : "Atualizado"}`);
  return { num_pedido: cab.numero_pedido, faturado: info.faturado === "S" };
}

// ====================== ROUTE ======================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ping de validacao do Omie
    if (body.ping === "omie") {
      return NextResponse.json({ pong: "omie" });
    }

    const topic = body.topic || "";
    const event = body.event || {};
    const appKey = body.appKey || body.app_key || "";

    console.log(`[webhook] Recebido: topic=${topic}, appKey=${appKey}`);

    const acc = getAccByKey(appKey);
    if (!acc) {
      console.warn(`[webhook] appKey desconhecida: ${appKey}`);
      return NextResponse.json({ ok: true, msg: "appKey nao reconhecida" });
    }

    // OS
    if (topic.includes("os.") || topic.includes("OrdemServico")) {
      const codOS = event.nCodOS || event.codigo || event.idOrigem || 0;
      if (codOS) {
        const result = await processarOS(codOS, acc);
        return NextResponse.json({ ok: true, tipo: "os", ...result });
      }
    }

    // PV
    if (topic.includes("pedido.") || topic.includes("PedidoVenda") || topic.includes("VendaProduto")) {
      const codPedido = event.codigo_pedido || event.codigo || event.idOrigem || 0;
      if (codPedido) {
        const result = await processarPV(codPedido, acc);
        return NextResponse.json({ ok: true, tipo: "pv", ...result });
      }
    }

    // NF-e emitida
    if (topic.includes("nfe.") || topic.includes("NotaFiscal")) {
      const numPedido = event.numero_pedido || event.cNumPedido || "";
      const codPedido = event.codigo_pedido || 0;
      if (codPedido) {
        const result = await processarPV(codPedido, acc);
        return NextResponse.json({ ok: true, tipo: "nfe", ...result });
      }
    }

    // NFS-e emitida
    if (topic.includes("nfse.") || topic.includes("NotaFiscalServico")) {
      const codOS = event.nCodOS || event.codigo || 0;
      if (codOS) {
        const result = await processarOS(codOS, acc);
        return NextResponse.json({ ok: true, tipo: "nfse", ...result });
      }
    }

    // Cliente alterado
    if (topic.includes("cliente.") || topic.includes("ClienteCadastro")) {
      const codCli = event.codigo_cliente_omie || event.codigo || 0;
      if (codCli) {
        try {
          const cli: any = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codCli }, acc);
          await supabase.from("portal_nt_clientes_cadastro_omie").upsert({
            cod_cli: cli.codigo_cliente_omie,
            empresa: acc.name,
            razao_social: cli.razao_social || "",
            nome_fantasia: cli.nome_fantasia || "",
            cnpj_cpf: cli.cnpj_cpf || "",
            email: cli.email || "",
            telefone: cli.telefone1_numero ? `(${cli.telefone1_ddd || ""}) ${cli.telefone1_numero}` : "",
            cidade: cli.cidade || "",
            estado: cli.estado || "",
            endereco: cli.endereco || "",
            bairro: cli.bairro || "",
            cep: cli.cep || "",
            inscricao_estadual: cli.inscricao_estadual || "",
            inativo: cli.inativo || "N",
            updated_at: new Date().toISOString(),
          }, { onConflict: "cod_cli,empresa" });
          console.log(`[webhook] Cliente ${codCli} atualizado`);
        } catch {}
        return NextResponse.json({ ok: true, tipo: "cliente", cod_cli: codCli });
      }
    }

    console.log(`[webhook] Topic nao tratado: ${topic}`);
    return NextResponse.json({ ok: true, msg: "topic nao tratado" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webhook] Erro:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
