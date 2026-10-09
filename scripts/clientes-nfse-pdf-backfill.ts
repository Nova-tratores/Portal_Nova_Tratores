// Corrige de uma vez a NFS-e das OS da Pasta Clientes que ficaram SEM o PDF no
// portal: link de consulta do nfse.gov.br (captcha), página da prefeitura
// (connect.omie) ou sem link. Busca o PDF no Omie (ListarNFSEs → ObterNFSe),
// guarda no storage e grava link_nf (+ num_nf se faltar).
//
//   npx tsx --env-file=.env.local scripts/clientes-nfse-pdf-backfill.ts            (simula)
//   npx tsx --env-file=.env.local scripts/clientes-nfse-pdf-backfill.ts --gravar   (grava)
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "../src/lib/omie/contas";
import { OR_OS_SEM_PDF_NFSE, baixarPdf, guardarPdfNfse } from "../src/lib/clientes/nfse-omie";

const GRAVAR = process.argv.includes("--gravar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EMPRESAS = ["Nova Tratores", "Castro Pecas"];
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

type Acc = { key: string; secret: string };
async function omie(ep: string, call: string, param: Record<string, unknown>, acc: Acc, t = 1): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`https://app.omie.com.br/api/v1${ep}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429 && t < 4) { await espera(60000); return omie(ep, call, param, acc, t + 1); }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(String(data.faultstring));
  return data;
}

(async () => {
  console.log(GRAVAR ? "== GRAVANDO ==" : "== SIMULAÇÃO (use --gravar para gravar) ==");
  for (const empresa of EMPRESAS) {
    const acc = contaOmie(empresa) as Acc;
    // OS alvo (paginado — o PostgREST devolve no máx. 1000 por vez)
    const alvo: { num_os: string; cod_os: number; num_nf: string | null; link_nf: string | null }[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("portal_nt_clientes_os")
        .select("num_os, cod_os, num_nf, link_nf")
        .eq("empresa", empresa).eq("faturada", true).eq("cancelada", false)
        .or(OR_OS_SEM_PDF_NFSE).range(de, de + 999);
      if (error) throw new Error(error.message);
      alvo.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    // todas as NFS-e da conta: cod_os → nota (uma passada só no ListarNFSEs)
    const porOS = new Map<number, { numero: string; nIdNf: number }>();
    for (let pag = 1, tot = 1; pag <= tot; pag++) {
      const l = await omie("/servicos/nfse/", "ListarNFSEs", { nPagina: pag, nRegPorPagina: 500 }, acc);
      tot = Number(l?.nTotPaginas || 1);
      for (const n of l?.nfseEncontradas || []) {
        const cod = Number(n?.OrdemServico?.nCodigoOS || 0);
        if (!cod || String(n?.Cabecalho?.cStatusNFSe || "") === "C") continue;
        porOS.set(cod, { numero: String(n?.Cabecalho?.nNumeroNFSe || ""), nIdNf: Number(n?.Cabecalho?.nCodNF || 0) });
      }
      await espera(400);
    }

    const tipo = (l: string | null) => !l ? "sem link" : /nfse\.gov\.br/i.test(l) ? "gov.br" : "prefeitura";
    const resumo: Record<string, { alvo: number; comNota: number; corrigidas: number; semPdf: number; erro: number }> = {};
    const comNota = alvo.filter(o => porOS.has(Number(o.cod_os)));
    for (const o of alvo) {
      const t = tipo(o.link_nf);
      resumo[t] = resumo[t] || { alvo: 0, comNota: 0, corrigidas: 0, semPdf: 0, erro: 0 };
      resumo[t].alvo++;
      if (porOS.has(Number(o.cod_os))) resumo[t].comNota++;
    }

    if (GRAVAR) {
      for (const o of comNota) {
        const t = tipo(o.link_nf);
        const nf = porOS.get(Number(o.cod_os))!;
        try {
          const doc = nf.nIdNf ? await omie("/servicos/osdocs/", "ObterNFSe", { nIdNf: nf.nIdNf }, acc) : null;
          const pdf = doc?.cPdfNFSe ? await baixarPdf(String(doc.cPdfNFSe)) : null;
          if (!pdf) { resumo[t].semPdf++; continue; }
          const numero = nf.numero.replace(/^0+/, "") || null;
          const link = await guardarPdfNfse(supabase, empresa, o.num_os, numero, pdf);
          if (!link) { resumo[t].erro++; continue; }
          const upd: Record<string, string> = { link_nf: link };
          if (!o.num_nf && nf.numero) upd.num_nf = nf.numero;
          const { error } = await supabase.from("portal_nt_clientes_os").update(upd).eq("empresa", empresa).eq("cod_os", o.cod_os);
          if (error) resumo[t].erro++; else resumo[t].corrigidas++;
        } catch (e) {
          resumo[t].erro++;
          console.warn(`  OS ${o.num_os}: ${e instanceof Error ? e.message : e}`);
        }
        await espera(350);
      }
    }
    console.log(`\n${empresa}: ${alvo.length} OS sem PDF no portal · ${porOS.size} NFS-e no Omie`);
    console.table(resumo);
  }
})().catch(e => { console.error(e); process.exit(1); });
