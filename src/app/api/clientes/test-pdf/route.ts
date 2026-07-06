import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const BUCKET = "clientes-docs";

interface OmieAccount {
  name: string;
  key: string;
  secret: string;
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { name: "Castro Pecas", ...contaOmie("Castro Pecas") },
];

function getAccount(empresa: string): OmieAccount {
  return OMIE_ACCOUNTS.find(a => a.name === empresa) || OMIE_ACCOUNTS[0];
}

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount): Promise<T> {
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) {
    console.warn(`[test-pdf] Rate limit — aguardando 60s`);
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param, acc);
  }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(`Omie: ${data.faultstring}`);
  return data as T;
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`Erro ao criar bucket: ${error.message}`);
    }
  }
}

async function downloadAndStore(url: string, storagePath: string, label: string): Promise<{ url: string; size: number } | null> {
  try {
    console.log(`[test-pdf] Baixando ${label}: ${url.substring(0, 100)}...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[test-pdf] Falha ao baixar ${label}: HTTP ${res.status}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      console.warn(`[test-pdf] ${label}: arquivo muito pequeno (${buffer.length} bytes), ignorando`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "application/pdf";

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`[test-pdf] Erro upload ${label}:`, error.message);
      return null;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    console.log(`[test-pdf] ${label} salvo: ${pub.publicUrl} (${buffer.length} bytes)`);
    return { url: pub.publicUrl, size: buffer.length };
  } catch (e) {
    console.error(`[test-pdf] Erro ${label}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ============ BUSCAR PDF DA OS (NFS-e via StatusOS) ============
async function buscarPdfOS(codOS: number, numOS: string, empresa: string, acc: OmieAccount) {
  const logs: string[] = [];

  try {
    // StatusOS retorna ListaRpsNfse com URLs de NFS-e
    const r: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: codOS }, acc);

    const cancelada = r?.cCancelada === "S";
    const faturada = r?.cFaturada === "S";
    logs.push(`StatusOS ok — faturada=${faturada}, cancelada=${cancelada}`);

    const nfseList: any[] = r?.ListaRpsNfse || [];
    logs.push(`ListaRpsNfse: ${nfseList.length} NFS-e encontradas`);

    if (nfseList.length > 0) {
      const nfse = nfseList[0];
      const numNFSe = nfse.nNfse || "";
      logs.push(`NFS-e #${numNFSe} — danfe=${nfse.danfe ? "sim" : "nao"}, xml=${nfse.xml_distr ? "sim" : "nao"}`);

      // danfe da NFS-e (pode ser URL do portal da prefeitura)
      if (nfse.danfe) {
        const result = await downloadAndStore(
          nfse.danfe,
          `${empresa}/os_${numOS}/nfse_${numNFSe}.pdf`,
          `NFS-e OS ${numOS}`
        );
        if (result) {
          return { ...result, numNF: numNFSe, nfseUrl: nfse.danfe, logs };
        }
        // Se falhou o download (pode ser redirect para prefeitura), guardar a URL direto
        logs.push("Download falhou, salvando URL da NFS-e diretamente");
        return { url: nfse.danfe, numNF: numNFSe, size: 0, isLink: true, logs };
      }

      // cUrlNfse como alternativa
      if (nfse.cUrlNfse) {
        return { url: nfse.cUrlNfse, numNF: numNFSe, size: 0, isLink: true, logs };
      }
    }

    // Se não tem NFS-e, tentar pegar recibo/PDF da OS
    if (r?.cUrlPdfRecibo) {
      logs.push(`URL recibo encontrada: ${r.cUrlPdfRecibo}`);
      const result = await downloadAndStore(
        r.cUrlPdfRecibo,
        `${empresa}/os_${numOS}/recibo_${numOS}.pdf`,
        `Recibo OS ${numOS}`
      );
      if (result) return { ...result, numNF: "", tipo: "recibo", logs };
    }

    logs.push("Nenhuma NFS-e encontrada nesta OS");
    return { url: null, numNF: "", logs };
  } catch (e) {
    logs.push(`StatusOS falhou: ${e instanceof Error ? e.message : e}`);
    return { url: null, numNF: "", logs };
  }
}

// ============ BUSCAR PDF DO PV (DANFE via StatusPedido) ============
async function buscarPdfPV(codPedido: number, numPedido: string, empresa: string, acc: OmieAccount) {
  const logs: string[] = [];

  try {
    // StatusPedido retorna ListaNfe com URLs do DANFE
    const r: any = await omieCall("/produtos/pedido/", "StatusPedido", {
      codigo_pedido: codPedido,
    }, acc);

    const faturada = r?.faturada === "S";
    const cancelada = r?.cancelada === "S";
    logs.push(`StatusPedido ok — faturada=${faturada}, cancelada=${cancelada}`);

    const nfeList: any[] = r?.ListaNfe || [];
    logs.push(`ListaNfe: ${nfeList.length} NF-e encontradas`);

    for (const nfe of nfeList) {
      const numNFe = nfe.numero_nfe || "";
      logs.push(`NF-e #${numNFe} — danfe=${nfe.danfe ? "sim" : "nao"}, xml=${nfe.xml_distr ? "sim" : "nao"}`);

      if (nfe.danfe) {
        const result = await downloadAndStore(
          nfe.danfe,
          `${empresa}/pv_${numPedido}/danfe_${numNFe || numPedido}.pdf`,
          `DANFE PV ${numPedido}`
        );
        if (result) {
          return { ...result, numNF: numNFe, chaveNFe: nfe.chave_nfe || "", logs };
        }
        logs.push("Download do DANFE falhou");
      }
    }

    if (nfeList.length === 0) {
      logs.push("Nenhuma NF-e encontrada neste PV");
    }

    return { url: null, numNF: nfeList[0]?.numero_nfe || "", logs };
  } catch (e) {
    logs.push(`StatusPedido falhou: ${e instanceof Error ? e.message : e}`);
    return { url: null, numNF: "", logs };
  }
}

// ============ ROUTE ============
export async function GET(req: NextRequest) {
  const codCli = req.nextUrl.searchParams.get("codCli");
  const empresa = req.nextUrl.searchParams.get("empresa");

  if (!codCli || !empresa) {
    return NextResponse.json({
      error: "Passe ?codCli=XXX&empresa=Nova Tratores (ou Castro Pecas)",
      uso: "GET /api/clientes/test-pdf?codCli=123456&empresa=Nova Tratores",
    }, { status: 400 });
  }

  try {
    await ensureBucket();

    const acc = getAccount(empresa);
    const resultados: any[] = [];

    // Buscar OS desse cliente no Supabase
    const { data: ordens } = await supabase
      .from("portal_nt_clientes_os")
      .select("num_os, cod_os, empresa, faturada, num_nf, link_nf, status, valor_total, num_pedido_cli, cancelada")
      .eq("cod_cli", codCli)
      .eq("empresa", empresa)
      .order("data_previsao", { ascending: false })
      .limit(10);

    console.log(`[test-pdf] Cliente ${codCli} (${empresa}): ${ordens?.length || 0} OS encontradas`);

    // Testar com OS faturadas e não canceladas
    const osValidas = (ordens || []).filter(o => o.faturada && !o.cancelada);
    const osParaTestar = osValidas.length > 0 ? osValidas.slice(0, 3) : (ordens || []).filter(o => o.faturada).slice(0, 3);

    for (const os of osParaTestar) {
      console.log(`[test-pdf] Testando OS ${os.num_os} (cod_os=${os.cod_os})...`);
      const pdfResult = await buscarPdfOS(os.cod_os, os.num_os, empresa.replace(/ /g, "_"), acc);

      // Se conseguiu URL, atualizar no banco
      if (pdfResult.url) {
        await supabase.from("portal_nt_clientes_os").update({
          link_nf: pdfResult.url,
          num_nf: pdfResult.numNF || os.num_nf,
        }).eq("num_os", os.num_os).eq("empresa", empresa);
      }

      resultados.push({
        tipo: "OS",
        num_os: os.num_os,
        cod_os: os.cod_os,
        faturada: os.faturada,
        pdf_encontrado: !!pdfResult.url,
        pdf_url: pdfResult.url || null,
        num_nf: pdfResult.numNF,
        logs: pdfResult.logs,
      });

      await new Promise((r) => setTimeout(r, 500));
    }

    // Buscar PVs desse cliente (cross-empresa)
    const { data: pedidos } = await supabase
      .from("portal_nt_clientes_pv")
      .select("num_pedido, cod_pedido, empresa, faturado, numero_nf, link_nf, valor_total, cancelado")
      .eq("cod_cli", codCli)
      .order("data_previsao", { ascending: false })
      .limit(10);

    const pvValidos = (pedidos || []).filter(p => p.faturado && !p.cancelado);
    const pvParaTestar = pvValidos.length > 0 ? pvValidos.slice(0, 3) : (pedidos || []).filter(p => p.faturado).slice(0, 3);

    for (const pv of pvParaTestar) {
      const pvAcc = getAccount(pv.empresa);
      console.log(`[test-pdf] Testando PV ${pv.num_pedido} (cod=${pv.cod_pedido}, empresa=${pv.empresa})...`);
      const pdfResult = await buscarPdfPV(pv.cod_pedido, pv.num_pedido, pv.empresa.replace(/ /g, "_"), pvAcc);

      if (pdfResult.url) {
        await supabase.from("portal_nt_clientes_pv").update({
          link_nf: pdfResult.url,
          numero_nf: pdfResult.numNF || pv.numero_nf,
        }).eq("num_pedido", pv.num_pedido).eq("empresa", pv.empresa);
      }

      resultados.push({
        tipo: "PV",
        num_pedido: pv.num_pedido,
        cod_pedido: pv.cod_pedido,
        empresa_pv: pv.empresa,
        faturado: pv.faturado,
        pdf_encontrado: !!pdfResult.url,
        pdf_url: pdfResult.url || null,
        num_nf: pdfResult.numNF,
        logs: pdfResult.logs,
      });

      await new Promise((r) => setTimeout(r, 500));
    }

    const resumo = {
      cliente: codCli,
      empresa,
      total_os: ordens?.length || 0,
      total_pv: pedidos?.length || 0,
      os_testadas: osParaTestar.length,
      pv_testados: pvParaTestar.length,
      pdfs_encontrados: resultados.filter(r => r.pdf_encontrado).length,
    };

    return NextResponse.json({ resumo, resultados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[test-pdf]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
