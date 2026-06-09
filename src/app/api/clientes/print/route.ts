import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
interface OmieAccount { name: string; key: string; secret: string; }
const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", key: process.env.OMIE_APP_KEY || "2729522270475", secret: process.env.OMIE_APP_SECRET || "113d785bb86c48d064889d4d73348131" },
  { name: "Castro Pecas", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];
function getAccount(empresa: string): OmieAccount {
  return OMIE_ACCOUNTS.find(a => a.name === empresa) || OMIE_ACCOUNTS[0];
}
async function omieCall(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount) {
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 60000)); return omieCall(endpoint, call, param, acc); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(data.faultstring);
  return data;
}

const EMP: Record<string, { razao: string; cnpj: string; ie: string; im: string; end1: string; end2: string; end3: string; fone: string; site: string }> = {
  "Nova Tratores": {
    razao: "NOVA TRATORES MAQUINAS AGRICOLAS LTDA", site: "novatratores.com.br",
    cnpj: "31.463.139/0001-03", ie: "537.054.605.110", im: "0",
    end1: "AVENIDA SÃO SEBASTIÃO, 1065", end2: "JARDIM ANA CRISTIINA",
    end3: "Piraju - SP - CEP: 18800-770", fone: "(14) 3351-6049",
  },
  "Castro Pecas": {
    razao: "CASTRO PECAS AGRICOLAS LTDA", site: "",
    cnpj: "31.463.139/0003-75", ie: "", im: "",
    end1: "Rod. Raposo Tavares, km 303", end2: "",
    end3: "Piraju - SP", fone: "(14) 3351-1700",
  },
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQ(v: number) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtU(v: number) { return v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }); }
function e(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// CSS identico ao estilo Omie
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Montserrat',Arial,sans-serif;color:#222;background:#d8d8d8;font-size:12px}
.page{width:210mm;min-height:297mm;margin:6mm auto;background:#fff;position:relative;padding-bottom:40px}
@media print{body{background:#fff}.page{margin:0;box-shadow:none}.no-print{display:none!important}@page{margin:0;size:A4}}

/* ---- HEADER ---- */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 28px 16px;border-bottom:2.5px solid #2a7f3e}
.hdr-left{max-width:55%}
.hdr-left h1{font-size:15px;font-weight:800;color:#111;margin-bottom:1px}
.hdr-left .site{font-size:10.5px;color:#2a7f3e;font-weight:600;margin-bottom:8px}
.hdr-left p{font-size:10.5px;color:#444;line-height:1.65}
.hdr-right{text-align:right;padding-top:6px}
.hdr-right .titulo{font-size:16px;font-weight:800;color:#2a7f3e}

/* ---- SECTION TITLES ---- */
.sec{padding:0 28px}
.st{font-size:12px;font-weight:700;color:#2a7f3e;padding:14px 0 6px;border-bottom:2px solid #2a7f3e;margin-bottom:10px}
.st-purple{color:#7c3aed;border-color:#7c3aed}

/* ---- CLIENT BLOCK ---- */
.cli{padding:0 28px 0;margin-bottom:4px}
.cli .nome{font-size:14px;font-weight:700;color:#111;margin-bottom:4px}
.cli p{font-size:11.5px;color:#333;line-height:1.7}
.cli .lbl{color:#888}

/* ---- TABLE SERVICOS / ITENS ---- */
table.tb{width:100%;border-collapse:collapse;margin-bottom:2px}
table.tb th{font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.3px;padding:7px 6px;text-align:left;border-bottom:1.5px solid #ccc;background:#fafafa}
table.tb td{padding:7px 6px;font-size:11.5px;border-bottom:1px solid #eee}
table.tb tr:last-child td{border-bottom:none}
.r{text-align:right}.c{text-align:center}

/* ---- DESC BLOCK (modelo/chassis/solicitacao) ---- */
.desc{padding:8px 6px;font-size:11.5px;line-height:1.7;color:#333}
.desc strong{color:#111}

/* ---- TOTAIS ---- */
.tot{display:flex;justify-content:flex-end;align-items:baseline;padding:6px 6px 2px;gap:12px}
.tot .tl{font-size:12px;font-weight:700;color:#333}
.tot .tv{font-size:13px;font-weight:800;color:#111;min-width:90px;text-align:right}
.tot-sub .tl{font-weight:600;color:#666;font-size:11px}
.tot-sub .tv{font-weight:600;font-size:11.5px;color:#444}
.tot-line{border-top:1.5px solid #ccc;margin-top:4px;padding-top:6px}

/* ---- VENCIMENTOS ---- */
.venc-info{font-size:11.5px;color:#888;font-weight:600;margin-bottom:6px}
table.vt{border-collapse:collapse}
table.vt th{font-size:10.5px;font-weight:700;color:#555;padding:5px 18px 5px 0;text-align:left}
table.vt td{font-size:12px;font-weight:500;padding:4px 18px 4px 0}

/* ---- OUTRAS INFO ---- */
.oi{font-size:11.5px;line-height:2.0;padding:4px 0}
.oi .ol{color:#888}.oi .ov{font-weight:600;color:#111}

/* ---- OBS ---- */
.obs{font-size:11.5px;line-height:1.7;color:#333;padding:6px 0;white-space:pre-wrap;font-weight:500}

/* ---- FOOTER ---- */
.ft{position:absolute;bottom:0;left:0;right:0;padding:10px 28px;font-size:9.5px;color:#aaa;text-align:center;border-top:1px solid #eee;font-weight:500}

/* ---- PRINT BTN ---- */
.pb{position:fixed;top:12px;right:12px;background:#2a7f3e;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;z-index:999;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:'Montserrat',sans-serif}
.pb:hover{background:#1f6330}
`;

function head(emp: typeof EMP["Nova Tratores"], titulo: string) {
  return `<div class="hdr">
    <div class="hdr-left">
      <h1>${e(emp.razao)}</h1>
      ${emp.site ? `<div class="site">${e(emp.site)}</div>` : ""}
      <p>
        CNPJ: ${e(emp.cnpj)}<br>
        Inscrição Estadual: ${e(emp.ie)}<br>
        ${emp.im ? `Inscrição Municipal: ${e(emp.im)}<br>` : ""}
      </p>
      <p style="margin-top:6px">
        ${e(emp.end1)}<br>
        ${emp.end2 ? e(emp.end2) + "<br>" : ""}
        ${e(emp.end3)}<br>
        Telefone: ${e(emp.fone)}
      </p>
    </div>
    <div class="hdr-right">
      <div class="titulo">${titulo}</div>
    </div>
  </div>`;
}

function clienteBlock(cli: any) {
  const nome = cli.razao_social || cli.nome_fantasia || "";
  const cnpj = cli.cnpj_cpf || "";
  const end = [cli.endereco, cli.endereco_numero].filter(Boolean).join(", ");
  const bairro = cli.bairro || "";
  const cidUF = [cli.cidade, cli.estado].filter(Boolean).join(" - ") + (cli.cep ? ` - CEP: ${cli.cep}` : "");
  const ie = cli.inscricao_estadual || "";
  const fone = cli.telefone1_numero ? `(${cli.telefone1_ddd || ""}) ${cli.telefone1_numero}` : "";
  const email = cli.email || "";

  return `<div class="cli">
    <div class="nome">${e(nome)}</div>
    <p>
      <span class="lbl">CNPJ:</span> ${e(cnpj)} &nbsp;&nbsp; ${e(end)}
    </p>
    ${ie ? `<p><span class="lbl">Inscrição Estadual:</span> ${e(ie)} &nbsp;&nbsp; ${e(bairro)} - ${e(cidUF)}</p>` :
      `<p>${e(bairro)} - ${e(cidUF)}</p>`}
    <p>
      ${fone ? `<span class="lbl">Telefone:</span> ${e(fone)}` : ""}
      ${email ? ` &nbsp;&nbsp; <span class="lbl">Email:</span> ${e(email)}` : ""}
    </p>
  </div>`;
}

function footer(usuario: string) {
  const dt = new Date();
  return `<div class="ft">Gerado em ${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR")} por ${e(usuario)} &mdash; Página 1 de 1</div>`;
}

function wrap(title: string, cssExtra: string, body: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${e(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}${cssExtra}</style></head><body>
<button class="pb no-print" onclick="window.print()">Imprimir</button>
<div class="page">${body}</div>
</body></html>`;
}

// ====================== ORDEM DE SERVICO ======================
async function renderOS(codOS: number, empresa: string): Promise<string> {
  const acc = getAccount(empresa);
  const emp = EMP[empresa] || EMP["Nova Tratores"];

  const os: any = await omieCall("/servicos/os/", "ConsultarOS", { nCodOS: codOS }, acc);
  const cab = os.Cabecalho;
  const info = os.InfoCadastro;
  const adicional = os.InformacoesAdicionais;
  const servicos: any[] = os.ServicosPrestados || [];
  const parcelas: any[] = os.Parcelas || [];
  const obsText = os.Observacoes?.cObsOS || "";

  // Cliente
  let cli: any = {};
  try { cli = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: cab.nCodCli }, acc); } catch {}

  // Vendedor
  let vendNome = "";
  try { const { data } = await supabase.from("portal_nt_clientes_os").select("vendedor").eq("cod_os", codOS).eq("empresa", empresa).single(); vendNome = data?.vendedor || ""; } catch {}

  // Descricao item (sol.aber.os)
  const descItem = servicos.find((s: any) => s.cCodigo === "sol.aber.os" || (s.nValUnit < 0.01 && (s.cDescServ || "").length > 30));
  const descricao = descItem?.cDescServ || "";
  const servicosReais = servicos.filter((s: any) => s !== descItem && s.nQtde > 0 && s.nValUnit > 0.001);
  const totalISS = servicosReais.reduce((s: number, sv: any) => s + (sv.impostos?.nValorISS || 0), 0);

  // Parse descricao
  let modelo = "", chassis = "", horimetro = "", solicitacao = "", realizado = "";
  if (descricao) {
    for (const p of descricao.split("|").map((x: string) => x.trim())) {
      if (/^Modelo:/i.test(p)) modelo = p.replace(/^Modelo:\s*/i, "");
      else if (/^Chassis:/i.test(p)) chassis = p.replace(/^Chassis:\s*/i, "");
      else if (/^Hor[ií]metro:/i.test(p)) horimetro = p.replace(/^Hor[ií]metro:\s*/i, "");
      else if (/^Solicita/i.test(p)) solicitacao = p.replace(/^Solicita[çc][ãa]o[^:]*:\s*/i, "");
      else if (/^Servi[çc]o\s*[Rr]ealizado/i.test(p)) realizado = p.replace(/^Servi[çc]o\s*[Rr]ealizado[^:]*:\s*/i, "");
    }
  }

  // Servicos rows + desc row
  let servicosHtml = servicosReais.map((s: any) => `<tr>
    <td>${e(s.cDescServ || "")} (Cód. ${e(s.cCodServMun || "")})</td>
    <td class="r">${fmtQ(s.nQtde)}</td>
    <td class="r">${fmt(s.nValUnit)}</td>
    <td class="r">${fmt(s.nQtde * s.nValUnit)}</td>
  </tr>`).join("");

  // Desc item (como no Omie: aparece na tabela com modelo/chassis e qtd 1,00 / 0,00 / 0,00)
  if (descItem) {
    const descLines: string[] = [];
    if (modelo) descLines.push(`Modelo: ${e(modelo)}`);
    if (chassis) descLines.push(`Chassis: ${e(chassis)}`);
    if (horimetro) descLines.push(`Horímetro: ${e(horimetro)}`);

    servicosHtml += `<tr><td colspan="4" class="desc">
      ${descLines.join("<br>")}
    </td></tr>`;

    if (solicitacao) {
      servicosHtml += `<tr><td colspan="4" class="desc">
        <strong>Solicitação Cliente:</strong> ${e(solicitacao)}
      </td></tr>`;
    }
    if (realizado) {
      servicosHtml += `<tr><td colspan="4" class="desc">
        <strong>Serviço realizado:</strong> ${e(realizado)} (Cód. ${e(descItem.cCodServMun || "140101")})
      </td></tr>`;
    }
  }

  // Parcelas
  let vencHtml = "";
  if (parcelas.length > 0) {
    vencHtml = `
    <div class="sec">
      <div class="st">Vencimentos</div>
      <div class="venc-info">${parcelas.length === 1 ? "À Vista" : parcelas.length + " Parcelas"}</div>
      <table class="vt">
        <tr><th>Parcela</th>${parcelas.map((_: any, i: number) => `<th>${i + 1}</th>`).join("")}</tr>
        <tr><td class="ol">Vencimento</td>${parcelas.map((p: any) => `<td>${e(p.dDtVenc)}</td>`).join("")}</tr>
        <tr><td class="ol">Valor</td>${parcelas.map((p: any) => `<td style="font-weight:700">${fmt(p.nValor)}</td>`).join("")}</tr>
      </table>
    </div>`;
  }

  const body = `
    ${head(emp, `Ordem de Serviço Nº ${e(cab.cNumOS)}`)}

    <div class="sec"><div class="st">Informações do Cliente</div></div>
    ${clienteBlock(cli)}

    <div class="sec">
      <div class="st">Lista dos Serviços</div>
      <table class="tb">
        <thead><tr>
          <th>Descrição do Serviço</th>
          <th class="r" style="width:80px">Quantidade</th>
          <th class="r" style="width:85px">Valor Unit.</th>
          <th class="r" style="width:85px">Valor Total</th>
        </tr></thead>
        <tbody>${servicosHtml}</tbody>
      </table>
      <div class="tot tot-line"><span class="tl">Total:</span><span class="tv">${fmt(cab.nValorTotal)}</span></div>
      <div class="tot tot-sub"><span class="tl">Total do ISS:</span><span class="tv">${fmt(totalISS)}</span></div>
    </div>

    ${vencHtml}

    <div class="sec">
      <div class="st">Outras Informações</div>
      <div class="oi">
        <div><span class="ol">Ordem de Serviço - incluído em: </span><span class="ov">${e(info.dDtInc)} às ${e(info.cHrInc)}</span></div>
        <div><span class="ol">Previsão de Faturamento: </span><span class="ov">${e(cab.dDtPrevisao)}</span></div>
        ${vendNome ? `<div><span class="ol">Vendedor: </span><span class="ov">${e(vendNome)}</span></div>` : ""}
      </div>
    </div>

    ${obsText ? `<div class="sec"><div class="obs">${e(obsText).replace(/\|/g, "\n")}</div></div>` : ""}

    ${footer("Portal Nova Tratores")}
  `;

  return wrap(`OS ${cab.cNumOS} - ${empresa}`, "", body);
}

// ====================== PEDIDO DE VENDA ======================
async function renderPV(codPedido: number, empresa: string): Promise<string> {
  const acc = getAccount(empresa);
  const emp = EMP[empresa] || EMP["Nova Tratores"];

  const raw: any = await omieCall("/produtos/pedido/", "ConsultarPedido", { codigo_pedido: codPedido }, acc);
  const pv = raw.pedido_venda_produto || raw;
  const cab = pv.cabecalho;
  const infoCad = pv.infoCadastro || {};
  const itens: any[] = pv.det || [];
  const totalPedido = pv.total_pedido || {};
  const obs = pv.observacoes?.obs_venda || "";

  // Cliente
  let cli: any = {};
  try { cli = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: cab.codigo_cliente }, acc); } catch {}

  // Vendedor (do banco se tiver)
  let vendNome = "";
  try {
    // Buscar nas OS que referenciam esse PV
    const { data } = await supabase.from("portal_nt_clientes_os").select("vendedor").eq("num_pedido_cli", cab.numero_pedido).eq("empresa", empresa).limit(1).single();
    vendNome = data?.vendedor || "";
  } catch {}

  const subtotal = itens.reduce((s: number, d: any) => s + (d.produto?.valor_total || 0), 0);
  const totalIPI = itens.reduce((s: number, d: any) => s + (d.imposto?.ipi?.valor_ipi || 0), 0);
  const totalICMSST = itens.reduce((s: number, d: any) => s + (d.imposto?.icms_st?.valor_icms_st || 0), 0);
  const totalFinal = totalPedido.valor_total_pedido || subtotal;

  const parcelas: any[] = pv.parcelas || pv.lista_parcelas?.parcela || [];

  // Itens table
  const itensHtml = itens.map((d: any) => {
    const p = d.produto || {};
    const desc = (p.descricao || "").replace(/&quot;/g, '"');
    const cod = p.codigo || "";
    return `<tr>
      <td style="font-weight:600">${e(cod)}</td>
      <td>${e(desc)}${cod ? ` = ${e(cod)}` : ""}</td>
      <td>${e(p.ncm || "")}</td>
      <td class="r">${fmtQ(p.quantidade || 0)} ${e(p.unidade || "")}</td>
      <td class="r">${fmtU(p.valor_unitario || 0)}</td>
      <td class="r" style="font-weight:600">${fmt(p.valor_total || 0)}</td>
    </tr>`;
  }).join("");

  // Parcelas
  let vencHtml = "";
  if (parcelas.length > 0) {
    vencHtml = `
    <div class="sec">
      <div class="st">Vencimentos</div>
      <div class="venc-info">${parcelas.length} Parcela${parcelas.length > 1 ? "s" : ""}</div>
      <table class="vt">
        <tr><th>Parcela</th>${parcelas.map((_: any, i: number) => `<th>${i + 1}</th>`).join("")}</tr>
        <tr><td class="ol">Vencimento</td>${parcelas.map((p: any) => `<td>${e(p.data_vencimento || p.dt_venc || p.dDtVenc || "")}</td>`).join("")}</tr>
        <tr><td class="ol">Valor</td>${parcelas.map((p: any) => `<td style="font-weight:700">${fmt(p.valor || p.nValor || 0)}</td>`).join("")}</tr>
      </table>
    </div>`;
  }

  const body = `
    ${head(emp, `Pedido de Venda Nº ${e(cab.numero_pedido)}`)}

    <div class="sec"><div class="st">Informações do Cliente</div></div>
    ${clienteBlock(cli)}

    <div class="sec">
      <div class="st">Itens do Pedido de Venda</div>
      <table class="tb">
        <thead><tr>
          <th style="width:70px">Código</th>
          <th>Descrição</th>
          <th style="width:80px">NCM</th>
          <th class="r" style="width:75px">Quant.</th>
          <th class="r" style="width:90px">Unit.</th>
          <th class="r" style="width:90px">Valor Total</th>
        </tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>
      <div class="tot tot-sub tot-line"><span class="tl">Subtotal:</span><span class="tv">${fmt(subtotal)}</span></div>
      <div class="tot tot-sub"><span class="tl">IPI:</span><span class="tv">${fmt(totalIPI)}</span></div>
      <div class="tot tot-sub"><span class="tl">ICMS ST:</span><span class="tv">${fmt(totalICMSST)}</span></div>
      <div class="tot" style="margin-top:4px"><span class="tl">Total:</span><span class="tv">${fmt(totalFinal)}</span></div>
    </div>

    ${vencHtml}

    <div class="sec">
      <div class="st">Outras Informações</div>
      <div class="oi">
        <div><span class="ol">Pedido de Venda - incluído em: </span><span class="ov">${e(infoCad.dInc || "")} às ${e(infoCad.hInc || "")}</span></div>
        <div><span class="ol">Previsão de Faturamento: </span><span class="ov">${e(cab.data_previsao || "")}</span></div>
        ${vendNome ? `<div><span class="ol">Vendedor: </span><span class="ov">${e(vendNome)}</span></div>` : ""}
      </div>
    </div>

    ${obs ? `<div class="sec"><div class="obs">${e(obs)}</div></div>` : ""}

    ${footer("Portal Nova Tratores")}
  `;

  return wrap(`PV ${cab.numero_pedido} - ${empresa}`, "", body);
}

// ====================== ROUTE ======================
export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get("tipo");
  const cod = req.nextUrl.searchParams.get("cod");
  const empresa = req.nextUrl.searchParams.get("empresa") || "Nova Tratores";

  if (!tipo || !cod) {
    return NextResponse.json({ error: "?tipo=os&cod=COD_OS&empresa=X ou ?tipo=pv&cod=COD_PEDIDO&empresa=X" }, { status: 400 });
  }

  try {
    let html: string;
    if (tipo === "os") html = await renderOS(Number(cod), empresa);
    else if (tipo === "pv") html = await renderPV(Number(cod), empresa);
    else return NextResponse.json({ error: "tipo: os ou pv" }, { status: 400 });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`<h1>Erro</h1><pre>${e(msg)}</pre>`, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
