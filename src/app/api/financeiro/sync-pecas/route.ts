import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Cria automaticamente um Chamado_NF (setor Peças) para cada Pedido de Venda
// faturado no Omie cuja Categoria seja a de "Revenda de Peças Balcão".

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

// Categoria-alvo (do Pedido de Venda). Match flexível pelo núcleo do texto.
const CATEGORIA_PECAS_LABEL = process.env.OMIE_CATEGORIA_PECAS || "10. @Revenda de Peças Balcão";
const norm = (s: unknown) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[@]/g, "").replace(/\s+/g, " ").trim();
const NUCLEO_PECAS = "revenda de pecas balcao"; // núcleo robusto (sem acento/@)

const BUCKET_ANEXOS = "anexos";

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

// DD/MM/AAAA -> AAAA-MM-DD
function dataBRtoISO(s: unknown): string | null {
  const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function baixarEAnexar(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ehPdf = buffer.slice(0, 5).toString("latin1").startsWith("%PDF");
    const { error } = await supabase.storage.from(BUCKET_ANEXOS).upload(path, buffer, {
      contentType: ehPdf ? "application/pdf" : (res.headers.get("content-type") || "application/octet-stream"),
      upsert: true,
    });
    if (error) return null;
    const { data: pub } = supabase.storage.from(BUCKET_ANEXOS).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return null; }
}

// Mapa codigo_categoria -> descricao (resolve o nome da categoria)
async function mapaCategorias(acc: Acc): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  try {
    let pag = 1, tot = 1;
    while (pag <= tot && pag <= 20) {
      const r: any = await omieCall("/geral/categorias/", "ListarCategorias", { pagina: pag, registros_por_pagina: 500 }, acc);
      tot = r?.total_de_paginas || 1;
      for (const c of r?.categoria_cadastro || []) {
        if (c?.codigo) mapa[String(c.codigo)] = String(c.descricao || "");
      }
      pag++;
    }
  } catch { /* ignore */ }
  return mapa;
}

// Extrai o código de categoria do pedido (vários locais possíveis)
function categoriaDoPedido(pv: any): string {
  return String(
    pv?.informacoes_adicionais?.codigo_categoria ||
    pv?.cabecalho?.codigo_categoria ||
    pv?.det?.[0]?.produto?.codigo_categoria ||
    ""
  ).trim();
}

// Decide se a categoria (código + descrição) é a de Peças
function ehCategoriaPecas(codigo: string, descricao: string): boolean {
  const cands = [descricao, `${codigo}. ${descricao}`, `${codigo} ${descricao}`, codigo, CATEGORIA_PECAS_LABEL];
  const alvo = norm(CATEGORIA_PECAS_LABEL);
  return cands.some(c => {
    const n = norm(c);
    return n === alvo || n.includes(NUCLEO_PECAS);
  });
}

// Parcelas do pedido -> forma de pagamento + vencimentos
function condicaoPagamento(pv: any) {
  const parc: any[] = pv?.lista_parcelas?.parcela || pv?.parcelas || [];
  const datas = parc
    .map(p => dataBRtoISO(p?.data_vencimento || p?.dt_venc || p?.dDtVenc))
    .filter(Boolean) as string[];
  const qtd = datas.length;
  if (qtd <= 1) {
    return {
      forma_pagamento: "Boleto 30 dias",
      qtd_parcelas: 1,
      vencimento_boleto: datas[0] || dataBRtoISO(pv?.cabecalho?.data_previsao) || null,
      datas_parcelas: "",
    };
  }
  return {
    forma_pagamento: "Boleto Parcelado",
    qtd_parcelas: qtd,
    vencimento_boleto: datas[0],
    datas_parcelas: datas.slice(1).join(", "),
  };
}

async function dadosCliente(codCli: number, acc: Acc): Promise<{ nome: string; cnpj: string }> {
  // tenta cache local primeiro
  try {
    const { data } = await supabase.from("portal_nt_clientes_cadastro_omie")
      .select("nome_fantasia, razao_social, cnpj_cpf").eq("cod_cli", codCli).maybeSingle();
    if (data) {
      return { nome: (data.nome_fantasia || data.razao_social || "").trim(), cnpj: String(data.cnpj_cpf || "").trim() };
    }
  } catch { /* ignore */ }
  try {
    const c: any = await omieCall("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codCli }, acc);
    return { nome: String(c?.nome_fantasia || c?.razao_social || "").trim(), cnpj: String(c?.cnpj_cpf || "").trim() };
  } catch { return { nome: "", cnpj: "" }; }
}

async function nfDoPedido(codPedido: number, numPedido: string, empKey: string, acc: Acc): Promise<{ num: string; url: string | null }> {
  try {
    const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: codPedido }, acc);
    const nfe = (st?.ListaNfe || [])[0];
    if (!nfe) return { num: "", url: null };
    const num = String(nfe.numero_nfe || "");
    let url: string | null = null;
    if (nfe.danfe) url = await baixarEAnexar(nfe.danfe, `pecas/${empKey}/pedido_${numPedido}/danfe_${num || numPedido}.pdf`);
    return { num, url };
  } catch { return { num: "", url: null }; }
}

async function handler(req: NextRequest) {
  const dias = parseInt(req.nextUrl.searchParams.get("dias") || "45");
  const limite = parseInt(req.nextUrl.searchParams.get("limite") || "500");
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";

  const hoje = new Date();
  const de = new Date(hoje.getTime() - dias * 86400000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const relatorio: any[] = [];
  const categoriasVistas = new Set<string>();
  const porEmpresa: Record<string, { processados: number; faturados: number; candidatos: number; criados: number; jaExistiam: number }> = {};
  let criados = 0, jaExistiam = 0, candidatos = 0;

  try {
    for (const acc of ACCS) {
      const empKey = acc.name.replace(/ /g, "_");
      const cats = await mapaCategorias(acc);
      porEmpresa[acc.name] = { processados: 0, faturados: 0, candidatos: 0, criados: 0, jaExistiam: 0 };

      let pag = 1, totPag = 1, processados = 0;
      while (pag <= totPag && processados < limite) {
        const r: any = await omieCall("/produtos/pedido/", "ListarPedidos", {
          pagina: pag, registros_por_pagina: 100,
          filtrar_por_data_de: fmt(de), filtrar_por_data_ate: fmt(hoje),
        }, acc);
        totPag = r?.total_de_paginas || 1;

        for (const pv of r?.pedido_venda_produto || []) {
          processados++;
          porEmpresa[acc.name].processados++;
          const info = pv?.infoCadastro || {};
          if (info.faturado !== "S" || info.cancelado === "S") continue;
          porEmpresa[acc.name].faturados++;

          // Categoria pode vir na listagem; se faltar, consulta o pedido completo
          let codCat = categoriaDoPedido(pv);
          let pvFull = pv;
          if (!codCat) {
            try {
              const c: any = await omieCall("/produtos/pedido/", "ConsultarPedido", { codigo_pedido: pv.cabecalho.codigo_pedido }, acc);
              pvFull = c?.pedido_venda_produto || c || pv;
              codCat = categoriaDoPedido(pvFull);
            } catch { /* ignore */ }
          }
          const descCat = cats[codCat] || "";
          if (codCat) categoriasVistas.add(`${codCat} = ${descCat}`);
          if (!ehCategoriaPecas(codCat, descCat)) continue;

          candidatos++;
          porEmpresa[acc.name].candidatos++;
          const numPedido = String(pv.cabecalho.numero_pedido);

          // idempotência
          const { data: existe } = await supabase.from("Chamado_NF")
            .select("id").eq("omie_num_pedido", numPedido).eq("omie_empresa", acc.name).maybeSingle();
          if (existe) { jaExistiam++; porEmpresa[acc.name].jaExistiam++; continue; }

          // garante parcelas/total — consulta completa se ainda não temos
          if (!(pvFull?.lista_parcelas || pvFull?.parcelas)) {
            try {
              const c: any = await omieCall("/produtos/pedido/", "ConsultarPedido", { codigo_pedido: pv.cabecalho.codigo_pedido }, acc);
              pvFull = c?.pedido_venda_produto || c || pvFull;
            } catch { /* ignore */ }
          }

          const cli = await dadosCliente(pv.cabecalho.codigo_cliente, acc);
          const cond = condicaoPagamento(pvFull);
          const nf = await nfDoPedido(pv.cabecalho.codigo_pedido, numPedido, empKey, acc);
          const valor = pvFull?.total_pedido?.valor_total_pedido || pv?.total_pedido?.valor_total_pedido || 0;

          const row: Record<string, unknown> = {
            nom_cliente: cli.nome,
            cnpj_cliente: cli.cnpj,
            valor_servico: valor,
            num_nf_peca: nf.num || "",
            anexo_nf_peca: nf.url,
            forma_pagamento: cond.forma_pagamento,
            qtd_parcelas: cond.qtd_parcelas,
            vencimento_boleto: cond.vencimento_boleto,
            datas_parcelas: cond.datas_parcelas,
            setor: "Financeiro",
            status: "gerar_boleto",
            tarefa: "Gerar Boleto",
            setor_destino: "pecas",
            categoria_nota: "peças",
            origem: "omie_pecas",
            omie_num_pedido: numPedido,
            omie_empresa: acc.name,
            obs: `Gerado do Omie — Pedido ${numPedido} (${acc.name}). Categoria: ${codCat} ${descCat}.`,
          };

          relatorio.push({ empresa: acc.name, pedido: numPedido, cliente: cli.nome, cnpj: cli.cnpj, nf: nf.num, anexo: !!nf.url, ...cond, valor });

          if (!dryRun) {
            const { error } = await supabase.from("Chamado_NF").insert([row]);
            if (!error) { criados++; porEmpresa[acc.name].criados++; }
            else relatorio[relatorio.length - 1].erro = error.message;
          }
          await new Promise(r => setTimeout(r, 200));
        }
        pag++;
        if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
      }
    }

    return NextResponse.json({
      sucesso: true, dryRun,
      candidatos, criados, jaExistiam,
      por_empresa: porEmpresa,
      categorias_encontradas: Array.from(categoriasVistas).sort(),
      categoria_alvo: CATEGORIA_PECAS_LABEL,
      itens: relatorio,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handler(req); }
export async function GET(req: NextRequest) { return handler(req); }
