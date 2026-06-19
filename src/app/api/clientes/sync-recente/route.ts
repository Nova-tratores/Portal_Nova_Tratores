import { NextResponse } from "next/server";
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
  if (data?.faultstring) {
    if (data.faultstring.includes("existem registros")) return {};
    throw new Error(data.faultstring);
  }
  return data;
}

function parseData(d: string): string | null {
  if (!d) return null;
  const [dia, mes, ano] = d.split("/");
  return dia && mes && ano ? `${ano}-${mes}-${dia}` : null;
}

const ETAPA_OS: Record<string, string> = { "10": "Em Aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada" };
const BUCKET = "clientes-docs";

async function downloadNF(url: string, path: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return url;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: res.headers.get("content-type") || "application/pdf", upsert: true });
    if (error) return url;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch { return url; }
}

// GET /api/clientes/sync-recente — busca OS e PV alterados nos ultimos 60 minutos
export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const agora = new Date();
    const umHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
    const dataHoje = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const anoAtual = String(agora.getFullYear());

    const resultado: Record<string, { os_novas: number; pv_novos: number; nfs: number }> = {};
    // OS faturadas vistas neste ciclo → geram card no financeiro (cirúrgico, via sync-os?codOS).
    const osFaturadasCod = new Set<number>();
    let houvePVFaturado = false;

    for (const acc of ACCS) {
      let osNovas = 0, pvNovos = 0, nfs = 0;
      const empKey = acc.name.replace(/ /g, "_");

      // Buscar OS do dia atual (pega criadas e alteradas hoje)
      try {
        let pag = 1, totPag = 1;
        while (pag <= totPag) {
          const r: any = await omieCall("/servicos/os/", "ListarOS", {
            pagina: pag, registros_por_pagina: 200,
            filtrar_por_data_de: dataHoje, filtrar_por_data_ate: dataHoje,
            filtrar_apenas_inclusao: "N",
          }, acc);
          if (pag === 1) totPag = r?.total_de_paginas || 1;

          for (const os of r?.osCadastro || []) {
            const cab = os.Cabecalho;
            const info = os.InfoCadastro;
            const adicional = os.InformacoesAdicionais;
            const servs = os.ServicosPrestados || [];

            let status = ETAPA_OS[cab.cEtapa] || cab.cEtapa;
            if (info.cCancelada === "S") status = "Cancelada";

            await supabase.from("portal_nt_clientes_os").upsert({
              num_os: cab.cNumOS, cod_os: cab.nCodOS, empresa: acc.name,
              cod_cli: cab.nCodCli, etapa: cab.cEtapa,
              data_previsao: parseData(cab.dDtPrevisao),
              data_inclusao: parseData(info.dDtInc),
              data_faturamento: parseData(info.dDtFat || "") || null,
              valor_total: cab.nValorTotal, status,
              cancelada: info.cCancelada === "S", faturada: info.cFaturada === "S",
              num_pedido_cli: cab.cNumPedCli || adicional?.cNumPedido || "",
              vendedor: "", cod_vendedor: cab.nCodVend,
              cidade: adicional?.cCidPrestServ || "",
              contrato: adicional?.cNumContrato || "",
              descricao: servs.find((s: any) => s.cDescServ)?.cDescServ || "",
              servicos: JSON.stringify(servs.map((s: any) => ({ cod: s.nCodServico, qtd: s.nQtde, valor: s.nValUnit, desc: s.cDescServ || "" }))),
              obs: os.Observacoes?.cObsOS || "",
              updated_at: new Date().toISOString(),
            }, { onConflict: "num_os,empresa" });
            osNovas++;
            if (info.cFaturada === "S" && info.cCancelada !== "S") osFaturadasCod.add(cab.nCodOS);
          }
          pag++;
          if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) {
        console.warn(`[sync-recente] OS ${acc.name}:`, e instanceof Error ? e.message : e);
      }

      // Buscar PV do dia atual
      try {
        let pag = 1, totPag = 1;
        while (pag <= totPag) {
          const r: any = await omieCall("/produtos/pedido/", "ListarPedidos", {
            pagina: pag, registros_por_pagina: 200,
            filtrar_por_data_de: dataHoje, filtrar_por_data_ate: dataHoje,
          }, acc);
          if (pag === 1) totPag = r?.total_de_paginas || 1;

          for (const pv of r?.pedido_venda_produto || []) {
            const cab = pv.cabecalho;
            const info = pv.infoCadastro || {};
            const itens = (pv.det || []).map((d: any) => ({
              codigo: d.produto?.codigo || "", descricao: d.produto?.descricao || "",
              quantidade: d.produto?.quantidade || 0, valor_unitario: d.produto?.valor_unitario || 0,
              valor_total: d.produto?.valor_total || 0,
            }));

            await supabase.from("portal_nt_clientes_pv").upsert({
              num_pedido: cab.numero_pedido, cod_pedido: cab.codigo_pedido, empresa: acc.name,
              cod_cli: cab.codigo_cliente, data_previsao: parseData(cab.data_previsao),
              data_inclusao: parseData(info.dInc),
              etapa: cab.etapa, valor_total: pv.total_pedido?.valor_total_pedido || 0,
              cancelado: info.cancelado === "S", faturado: info.faturado === "S",
              numero_nf: pv.frete?.numero_nota_fiscal || "",
              itens: JSON.stringify(itens), observacoes: pv.observacoes?.obs_venda || "",
              updated_at: new Date().toISOString(),
            }, { onConflict: "num_pedido,empresa" });
            pvNovos++;
            if (info.faturado === "S" && info.cancelado !== "S") houvePVFaturado = true;
          }
          pag++;
          if (pag <= totPag) await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) {
        console.warn(`[sync-recente] PV ${acc.name}:`, e instanceof Error ? e.message : e);
      }

      // Buscar NFs para OS/PV faturados recentes sem link_nf
      const { data: osSemNF } = await supabase.from("portal_nt_clientes_os")
        .select("num_os, cod_os").eq("empresa", acc.name)
        .eq("faturada", true).eq("cancelada", false)
        .or("link_nf.is.null,link_nf.eq.").limit(50);

      for (const os of osSemNF || []) {
        try {
          const st: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: os.cod_os }, acc);
          const nfseList: any[] = st?.ListaRpsNfse || [];
          if (nfseList.length > 0) {
            const nfse = nfseList[0];
            const num = nfse.nNfse || "";
            const url = nfse.danfe || nfse.cUrlNfse || "";
            if (num || url) {
              let finalUrl = url;
              if (url) finalUrl = await downloadNF(url, `${empKey}/os_${os.num_os}/nfse_${num || os.num_os}.pdf`);
              const upd: Record<string, string> = {};
              if (num) upd.num_nf = num;
              if (finalUrl) upd.link_nf = finalUrl;
              await supabase.from("portal_nt_clientes_os").update(upd).eq("num_os", os.num_os).eq("empresa", acc.name);
              nfs++;
            }
          }
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }

      const { data: pvSemNF } = await supabase.from("portal_nt_clientes_pv")
        .select("num_pedido, cod_pedido").eq("empresa", acc.name)
        .eq("faturado", true).eq("cancelado", false)
        .or("link_nf.is.null,link_nf.eq.").limit(50);

      for (const pv of pvSemNF || []) {
        try {
          const st: any = await omieCall("/produtos/pedido/", "StatusPedido", { codigo_pedido: pv.cod_pedido }, acc);
          const nfeList: any[] = st?.ListaNfe || [];
          if (nfeList.length > 0) {
            const nfe = nfeList[0];
            const num = nfe.numero_nfe || "";
            const url = nfe.danfe || "";
            if (num || url) {
              let finalUrl = url;
              if (url) finalUrl = await downloadNF(url, `${empKey}/pv_${pv.num_pedido}/danfe_${num || pv.num_pedido}.pdf`);
              const upd: Record<string, string> = {};
              if (num) upd.numero_nf = num;
              if (finalUrl) upd.link_nf = finalUrl;
              await supabase.from("portal_nt_clientes_pv").update(upd).eq("num_pedido", pv.num_pedido).eq("empresa", acc.name);
              nfs++;
            }
          }
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }

      resultado[acc.name] = { os_novas: osNovas, pv_novos: pvNovos, nfs };
      console.log(`[sync-recente] ${acc.name}: ${osNovas} OS, ${pvNovos} PV, ${nfs} NFs`);
    }

    // ---- Cria os cards do financeiro das OS/PV faturadas vistas agora ----
    // Cirúrgico: só estas OS (sync-os?codOS) + peças do dia. sync-os/sync-pecas são
    // idempotentes (não duplicam) e respeitam o corte de data. É o que mantém a pasta
    // e o financeiro juntos mesmo sem o webhook do Omie (que não alcança o localhost).
    let cardsDisparados = 0;
    for (const cod of osFaturadasCod) {
      try { await fetch(`${origin}/api/financeiro/sync-os?codOS=${cod}`, { method: "POST" }); cardsDisparados++; } catch {}
    }
    if (houvePVFaturado) {
      try { await fetch(`${origin}/api/financeiro/sync-pecas?dias=1`, { method: "POST" }); } catch {}
    }

    return NextResponse.json({ sucesso: true, resultado, cards_financeiro_disparados: cardsDisparados, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
