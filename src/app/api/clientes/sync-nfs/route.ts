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

const BUCKET = "clientes-docs";

async function downloadAndStore(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    const ct = res.headers.get("content-type") || "application/pdf";
    // Só guarda PDF de verdade. NFS-e Nacional devolve a URL de um portal (SPA em HTML);
    // baixar no servidor traz só o formulário em branco. Retorna null pra guardar a URL.
    const ehPdf = buffer.slice(0, 5).toString("latin1").startsWith("%PDF") || ct.toLowerCase().includes("application/pdf");
    if (!ehPdf) return null;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (error) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const limite = parseInt(req.nextUrl.searchParams.get("limite") || "2000");

  try {
    const resultado: Record<string, { os_processadas: number; os_com_nf: number; pv_processados: number; pv_com_nf: number }> = {};

    for (const acc of ACCS) {
      let osComNF = 0, pvComNF = 0;
      const empKey = acc.name.replace(/ /g, "_");

      // OS faturadas sem link_nf
      const { data: osSemNF } = await supabase.from("portal_nt_clientes_os")
        .select("num_os, cod_os")
        .eq("empresa", acc.name).eq("faturada", true).eq("cancelada", false)
        .or("link_nf.is.null,link_nf.eq.")
        .limit(limite);

      const osTotal = osSemNF?.length || 0;
      console.log(`[sync-nfs] ${acc.name}: ${osTotal} OS sem NF`);

      for (const os of osSemNF || []) {
        try {
          const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: os.cod_os }, acc);
          const nfseList: any[] = st?.ListaRpsNfse || [];
          if (nfseList.length > 0) {
            const nfse = nfseList[0];
            const numNFSe = nfse.nNfse || "";
            const danfeUrl = nfse.danfe || nfse.cUrlNfse || "";
            if (numNFSe || danfeUrl) {
              let finalUrl = danfeUrl;
              if (danfeUrl) {
                const stored = await downloadAndStore(danfeUrl, `${empKey}/os_${os.num_os}/nfse_${numNFSe || os.num_os}.pdf`);
                if (stored) finalUrl = stored;
              }
              const updates: Record<string, string> = {};
              if (numNFSe) updates.num_nf = numNFSe;
              if (finalUrl) updates.link_nf = finalUrl;
              await supabase.from("portal_nt_clientes_os").update(updates).eq("num_os", os.num_os).eq("empresa", acc.name);
              osComNF++;
            }
          }
          await new Promise(r => setTimeout(r, 250));
        } catch { /* ignore */ }
      }

      // PV faturados sem link_nf
      const { data: pvSemNF } = await supabase.from("portal_nt_clientes_pv")
        .select("num_pedido, cod_pedido")
        .eq("empresa", acc.name).eq("faturado", true).eq("cancelado", false)
        .or("link_nf.is.null,link_nf.eq.")
        .limit(limite);

      const pvTotal = pvSemNF?.length || 0;
      console.log(`[sync-nfs] ${acc.name}: ${pvTotal} PV sem NF`);

      for (const pv of pvSemNF || []) {
        try {
          const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: pv.cod_pedido }, acc);
          const nfeList: any[] = st?.ListaNfe || [];
          if (nfeList.length > 0) {
            const nfe = nfeList[0];
            const numNFe = nfe.numero_nfe || "";
            const danfeUrl = nfe.danfe || "";
            if (numNFe || danfeUrl) {
              let finalUrl = danfeUrl;
              if (danfeUrl) {
                const stored = await downloadAndStore(danfeUrl, `${empKey}/pv_${pv.num_pedido}/danfe_${numNFe || pv.num_pedido}.pdf`);
                if (stored) finalUrl = stored;
              }
              const updates: Record<string, string> = {};
              if (numNFe) updates.numero_nf = numNFe;
              if (finalUrl) updates.link_nf = finalUrl;
              await supabase.from("portal_nt_clientes_pv").update(updates).eq("num_pedido", pv.num_pedido).eq("empresa", acc.name);
              pvComNF++;
            }
          }
          await new Promise(r => setTimeout(r, 250));
        } catch { /* ignore */ }
      }

      resultado[acc.name] = { os_processadas: osTotal, os_com_nf: osComNF, pv_processados: pvTotal, pv_com_nf: pvComNF };
      console.log(`[sync-nfs] ${acc.name}: OS ${osComNF}/${osTotal}, PV ${pvComNF}/${pvTotal}`);
    }

    return NextResponse.json({ sucesso: true, resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
