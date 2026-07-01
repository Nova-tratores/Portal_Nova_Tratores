import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const BUCKET = "clientes-docs";

const OMIE_ACCOUNTS: Record<string, { key: string; secret: string }> = {
  "Nova Tratores": { key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131" },
  "Castro Peças": { key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
};

async function omieCall(endpoint: string, call: string, param: Record<string, unknown>, empresa: string, t = 1): Promise<any> {
  const acc = OMIE_ACCOUNTS[empresa];
  if (!acc) throw new Error(`Empresa desconhecida: ${empresa}`);
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429 && t < 3) { await new Promise(r => setTimeout(r, t * 30000)); return omieCall(endpoint, call, param, empresa, t + 1); }
  const data = await res.json();
  if (data?.faultstring) throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  return data;
}

const ETAPA_OS: Record<string, string> = { "10": "Em Aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada" };
const ETAPA_PV: Record<string, string> = { "10": "Em Aberto", "20": "Faturar", "30": "Faturado parcial", "40": "Devolução parcial", "50": "Faturado", "60": "Faturado" };

function parseData(d?: string | null): string | null {
  if (!d) return null;
  const [dia, mes, ano] = String(d).split("/");
  return (dia && mes && ano) ? `${ano}-${mes}-${dia}` : null;
}

async function downloadAndStore(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ct = res.headers.get("content-type") || "application/pdf";
    // Só guarda PDF de verdade. NFS-e Nacional devolve a URL de um portal (SPA em HTML);
    // baixar isso no servidor traz só o formulário em branco. Nesse caso retorna null
    // pra que o chamador guarde a própria URL (que abre o portal e renderiza a nota).
    const ehPdf = buffer.slice(0, 5).toString("latin1").startsWith("%PDF") || ct.toLowerCase().includes("application/pdf");
    if (!ehPdf) return null;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (error) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return null; }
}

async function nomeCliente(codCli: number, empresa: string): Promise<string> {
  const { data } = await supabase.from("portal_nt_clientes_cadastro_omie")
    .select("razao_social, nome_fantasia").eq("cod_cli", codCli).eq("empresa", empresa).maybeSingle();
  if (data) return data.nome_fantasia || data.razao_social || "";
  try {
    const c: any = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codCli }, empresa);
    return c?.nome_fantasia || c?.razao_social || "";
  } catch { return ""; }
}

// ========================= PV (reutilizável) =========================
async function processarPV(num: string, empresa: string, pdf_url?: string, nf_pdf_url?: string, servicoInterno = false) {
  const empKey = empresa.replace(/ /g, "_");
  const numInt = Number(num.replace(/\D/g, ""));
  let raw: any;
  try { raw = await omieCall("/produtos/pedido/", "ConsultarPedido", { numero_pedido: num }, empresa); }
  catch (e1) {
    if (!Number.isFinite(numInt)) throw e1;
    try { raw = await omieCall("/produtos/pedido/", "ConsultarPedido", { codigo_pedido: numInt }, empresa); }
    catch { throw new Error(`Pedido ${num} não encontrado no Omie (${empresa}).`); }
  }
  const pv = raw.pedido_venda_produto || raw;
  const cab = pv.cabecalho, info = pv.infoCadastro || {};
  const itens = (pv.det || []).map((d: any) => ({
    codigo: d.produto?.codigo || "", descricao: d.produto?.descricao, quantidade: d.produto?.quantidade,
    valor_unitario: d.produto?.valor_unitario, valor_total: d.produto?.valor_total,
  }));

  // NF de peça (DANFE / NF-e). Anexo do usuário tem prioridade; senão busca no Omie.
  let numNF = pv.frete?.numero_nota_fiscal || (pv.nfRelacionada?.nNF ? String(pv.nfRelacionada.nNF) : "") || (pv.lista_nfe?.[0]?.numero_nfe || "");
  let linkNF = "";
  // Serviço interno: não busca NF no Omie (usa só o recibo, se anexado).
  if (!servicoInterno) {
    try {
      const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: cab.codigo_pedido }, empresa);
      const nfe = (st?.ListaNfe || [])[0];
      if (nfe) {
        numNF = nfe.numero_nfe || numNF;
        if (!nf_pdf_url) {
          const danfe = nfe.danfe || "";
          if (danfe) linkNF = (await downloadAndStore(danfe, `${empKey}/pv_${cab.numero_pedido}/danfe_${numNF || cab.numero_pedido}.pdf`)) || danfe;
        }
      }
    } catch { /* sem NF ainda */ }
  }
  if (nf_pdf_url) linkNF = nf_pdf_url;

  const row: Record<string, unknown> = {
    num_pedido: cab.numero_pedido, cod_pedido: cab.codigo_pedido, empresa, cod_cli: cab.codigo_cliente,
    data_previsao: parseData(cab.data_previsao), data_inclusao: parseData(info.dInc),
    etapa: ETAPA_PV[cab.etapa] || cab.etapa, valor_total: pv.total_pedido?.valor_total_pedido || 0,
    cancelado: info.cancelado === "S", faturado: info.faturado === "S",
    numero_nf: numNF, link_nf: linkNF || undefined,
    itens: JSON.stringify(itens), observacoes: pv.observacoes?.obs_venda || "",
    cliente_nome: await nomeCliente(cab.codigo_cliente, empresa),
    updated_at: new Date().toISOString(),
  };
  if (pdf_url) row.pdf_anexo = pdf_url;
  if (!row.link_nf) delete row.link_nf;

  const { error } = await supabase.from("portal_nt_clientes_pv").upsert(row, { onConflict: "num_pedido,empresa" });
  if (error) throw new Error(error.message);
  return { ok: true, tipo: "pv" as const, numero: cab.numero_pedido, cod_cli: cab.codigo_cliente, cliente_nome: row.cliente_nome as string };
}

export async function POST(req: NextRequest) {
  try {
    const { tipo, numero, empresa, pdf_url, nf_pdf_url, pv_vinculado, pv_pdf_url, pv_nf_pdf_url, servico_interno } = await req.json();
    if (!empresa || !OMIE_ACCOUNTS[empresa]) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    const num = String(numero || "").trim();
    if (!num) return NextResponse.json({ error: "Informe o número." }, { status: 400 });
    const empKey = empresa.replace(/ /g, "_");
    const numInt = Number(num.replace(/\D/g, ""));

    // ========================= OS =========================
    if (tipo === "os") {
      // Consultar tentando número visível → cai p/ código interno
      let os: any;
      try { os = await omieCall("/servicos/os/", "ConsultarOS", { cNumOS: num }, empresa); }
      catch (e1) {
        if (!Number.isFinite(numInt)) throw e1;
        try { os = await omieCall("/servicos/os/", "ConsultarOS", { nCodOS: numInt }, empresa); }
        catch { return NextResponse.json({ error: `OS ${num} não encontrada no Omie (${empresa}).` }, { status: 404 }); }
      }
      const cab = os.Cabecalho, info = os.InfoCadastro || {}, adicional = os.InformacoesAdicionais || {};
      const servs: any[] = os.ServicosPrestados || [];
      let status = ETAPA_OS[cab.cEtapa] || cab.cEtapa;
      if (info.cCancelada === "S") status = "Cancelada";

      // Projeto
      let projetoNome = "";
      const codProj = adicional?.nCodProj || null;
      if (codProj) {
        const { data: pj } = await supabase.from("portal_nt_projetos_PRINCIPAL").select("nome").eq("codigo", codProj).eq("empresa", empresa).maybeSingle();
        projetoNome = pj?.nome || `Proj #${codProj}`;
      }

      // NF de serviço (NFS-e). Se o usuário anexou o PDF, usa ele; senão busca no Omie. O número vem do Omie.
      let numNF = info.nNumNFSe ? String(info.nNumNFSe) : "";
      let linkNF = "";
      // Serviço interno: não busca NFS-e no Omie (usa só o recibo, se anexado).
      if (!servico_interno) {
        try {
          const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: cab.nCodOS }, empresa);
          const nfse = (st?.ListaRpsNfse || [])[0];
          if (nfse) {
            numNF = nfse.nNfse ? String(nfse.nNfse) : numNF;
            if (!nf_pdf_url) {
              const chave = nfse.cChaveNfse || nfse.cChaveNFSe || nfse.cChaveAcesso || "";
              let danfe = nfse.danfe || nfse.cUrlNfse || "";
              // NFS-e Nacional: com a chave, monta a URL que já exibe a nota (em vez do formulário vazio).
              if (chave && /nfse\.gov\.br/i.test(danfe) && !/chave=/i.test(danfe)) danfe = `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${chave}`;
              if (danfe) linkNF = (await downloadAndStore(danfe, `${empKey}/os_${cab.cNumOS}/nfse_${numNF || cab.cNumOS}.pdf`)) || danfe;
            }
          }
        } catch { /* sem NF ainda */ }
      }
      if (nf_pdf_url) linkNF = nf_pdf_url;

      const row: Record<string, unknown> = {
        num_os: cab.cNumOS, cod_os: cab.nCodOS, empresa, cod_cli: cab.nCodCli,
        etapa: cab.cEtapa, status,
        data_previsao: parseData(cab.dDtPrevisao), data_inclusao: parseData(info.dDtInc), data_faturamento: parseData(info.dDtFat) || null,
        valor_total: cab.nValorTotal, cancelada: info.cCancelada === "S", faturada: info.cFaturada === "S",
        num_pedido_cli: String(pv_vinculado || "").replace(/\D/g, "") || cab.cNumPedCli || adicional?.cNumPedido || adicional?.cNumContrato || "",
        cod_vendedor: cab.nCodVend, cidade: adicional?.cCidPrestServ || "", contrato: adicional?.cNumContrato || "",
        projeto: projetoNome,
        num_nf: numNF, link_nf: linkNF || undefined,
        descricao: servs.find((s: any) => s.cDescServ)?.cDescServ || "",
        servicos: JSON.stringify(servs.map((s: any) => ({ cod: s.nCodServico, qtd: s.nQtde, valor: s.nValUnit, desc: s.cDescServ || "" }))),
        obs: os.Observacoes?.cObsOS || "", dados_adic: adicional?.cDadosAdicNF || "",
        cliente_nome: await nomeCliente(cab.nCodCli, empresa),
        updated_at: new Date().toISOString(),
      };
      if (pdf_url) row.pdf_anexo = pdf_url;
      if (!row.link_nf) delete row.link_nf;

      const { error } = await supabase.from("portal_nt_clientes_os").upsert(row, { onConflict: "num_os,empresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Marca "fechado interno" (best-effort): se a coluna ainda não existir no
      // banco, ignora sem quebrar o anexar. Grava sempre pra refletir o checkbox.
      await supabase.from("portal_nt_clientes_os")
        .update({ servico_interno: !!servico_interno })
        .eq("num_os", cab.cNumOS).eq("empresa", empresa)
        .then(() => {}, () => {});

      // Se o usuário informou um Pedido de Venda vinculado, puxa o PV junto (best-effort)
      // pra ele aparecer ligado na pasta. Não falha a OS se o PV der erro.
      let pv_vinc_aviso: string | undefined;
      const pvVinc = String(pv_vinculado || "").replace(/\D/g, "");
      if (pvVinc) {
        try { await processarPV(pvVinc, empresa, pv_pdf_url, pv_nf_pdf_url, !!servico_interno); }
        catch (e: any) { pv_vinc_aviso = `OS anexada, mas falhou ao puxar o PV ${pvVinc}: ${e?.message || "erro"}.`; }
      }
      return NextResponse.json({ ok: true, tipo, numero: cab.cNumOS, cod_cli: cab.nCodCli, cliente_nome: row.cliente_nome, pv_vinculado: pvVinc || undefined, aviso: pv_vinc_aviso });
    }

    // ========================= PV =========================
    if (tipo === "pv") {
      return NextResponse.json(await processarPV(num, empresa, pdf_url, nf_pdf_url));
    }

    return NextResponse.json({ error: "tipo inválido (use 'os' ou 'pv')" }, { status: 400 });
  } catch (err: any) {
    console.error("Erro ao anexar:", err?.message);
    return NextResponse.json({ error: err?.message || "Erro ao anexar" }, { status: 500 });
  }
}
