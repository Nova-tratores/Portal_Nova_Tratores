import type { SupabaseClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
import { chaveOS, contaOmieDaEmpresa, numeroNfse } from "./numero-nf";
import { baixarPdf, guardarPdfNfse, linkNoPortal, numeroNfsePeloStatusOS, pdfNfseNoOmie } from "./nfse-omie";
import { explicarErroOmie, explicarNfeSemDanfe, falha, type FalhaNota } from "./buscar-nota-erros";

// Botão "Buscar no Omie" do cartão do serviço (pasta do cliente): traz AGORA o
// PDF da nota que ainda não está na pasta — NFS-e da OS ou NF-e (DANFE) do
// pedido de peças —, guarda no storage e grava o link, igual aos syncs. Cada
// falha volta com uma frase clara + o que fazer (buscar-nota-erros.ts).

export type ResultadoNota = { ok: true; numero: string | null; link: string; jaEstava?: boolean } | FalhaNota;

const OMIE_BASE = "https://app.omie.com.br/api/v1";
const BUCKET = "clientes-docs";

/** NFS-e da OS. */
export async function buscarNfseDaOS(supabase: SupabaseClient, empresa: string, codOS: number): Promise<ResultadoNota> {
  const { data: os, error } = await supabase
    .from("portal_nt_clientes_os")
    .select("num_os, cod_os, num_nf, link_nf, faturada, cancelada, servico_interno")
    .eq("empresa", empresa).eq("cod_os", codOS).maybeSingle();
  if (error) return falha("Não consegui ler a OS no portal.", "Recarregue a página e tente de novo.", error.message);
  if (!os) return falha("Esta OS não está na pasta do cliente.", "Recarregue a página (pode ter sido apagada ou trocada de cliente).");
  if (linkNoPortal(os.link_nf)) return { ok: true, numero: numeroNfse(os.num_nf), link: os.link_nf, jaEstava: true };
  if (os.cancelada) return falha("A OS está cancelada — não tem nota de serviço.", "Nada a fazer.");
  if (os.servico_interno) return falha("Serviço interno — não emite nota.", "Nada a fazer.");
  if (!os.faturada) return falha("A OS ainda não foi faturada no Omie, então não existe nota.", "Fature a OS no Omie e depois clique em buscar.");

  const acc = contaOmie(empresa);
  try {
    let numero = numeroNfse(os.num_nf);
    if (!numero) {
      const { data: c } = await supabase.from("os_nfse").select("nfse_num")
        .eq("conta_omie", contaOmieDaEmpresa(empresa)).eq("num_os", chaveOS(os.num_os)).eq("tem_nota", true).maybeSingle();
      numero = numeroNfse(c?.nfse_num);
    }
    if (!numero) numero = await numeroNfsePeloStatusOS(acc, codOS);
    if (!numero) {
      return falha("O Omie não tem NFS-e emitida para esta OS.",
        "Ela pode ter sido faturada só com recibo. Se a nota foi emitida por fora (prefeitura), anexe o PDF à mão.");
    }
    const achado = await pdfNfseNoOmie(acc, codOS, numero);
    if (!achado) return falha(`Não achei no Omie a NFS-e ${numero} ligada a esta OS.`, "Confira no Omie se a nota está vinculada à OS. Se foi emitida por fora, anexe o PDF à mão.");
    if (!achado.urlPdf) return falha(`A NFS-e ${numero} existe, mas o Omie ainda não gerou o PDF.`, "Isso é comum logo depois do faturamento. Tente de novo em alguns minutos.");
    const pdf = await baixarPdf(achado.urlPdf);
    if (!pdf) return falha("O Omie mandou o link da nota, mas o arquivo não veio (não é um PDF).", "Tente de novo em alguns minutos.");
    const link = await guardarPdfNfse(supabase, empresa, os.num_os, numero, pdf);
    if (!link) return falha("Achei a nota no Omie, mas não consegui guardar o PDF na pasta.", "Tente de novo. Se continuar, avise o T.I.");
    const { error: e2 } = await supabase.from("portal_nt_clientes_os")
      .update({ link_nf: link, ...(os.num_nf ? {} : { num_nf: numero }) })
      .eq("empresa", empresa).eq("cod_os", codOS);
    if (e2) return falha("O PDF foi guardado, mas não consegui gravar na OS.", "Tente de novo.", e2.message);
    return { ok: true, numero, link };
  } catch (e) {
    return explicarErroOmie(e instanceof Error ? e.message : String(e), "NFS-e");
  }
}

async function omie(call: string, param: Record<string, unknown>, acc: { key: string; secret: string }) {
  const res = await fetch(`${OMIE_BASE}/produtos/pedido/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) throw new Error("429 Too Many Requests");
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) throw new Error(String(data.faultstring));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data;
}

/** NF-e (DANFE) do pedido de peças. */
export async function buscarNfeDoPedido(supabase: SupabaseClient, empresa: string, numPedido: string): Promise<ResultadoNota> {
  const { data: pv, error } = await supabase
    .from("portal_nt_clientes_pv")
    .select("num_pedido, cod_pedido, numero_nf, link_nf, faturado, cancelado")
    .eq("empresa", empresa).eq("num_pedido", numPedido).maybeSingle();
  if (error) return falha("Não consegui ler o pedido no portal.", "Recarregue a página e tente de novo.", error.message);
  if (!pv) return falha(`O pedido ${numPedido} não está na pasta do cliente.`, "Recarregue a página.");
  if (linkNoPortal(pv.link_nf)) return { ok: true, numero: pv.numero_nf || null, link: pv.link_nf, jaEstava: true };
  if (pv.cancelado) return falha("O pedido de peças está cancelado — não tem nota.", "Nada a fazer.");
  if (!pv.cod_pedido) return falha("Este pedido não tem o código do Omie no portal.", "Rode a sincronização da pasta e tente de novo.");

  const acc = contaOmie(empresa);
  try {
    const st = await omie("StatusPedido", { codigo_pedido: pv.cod_pedido }, acc);
    const lista: { numero_nfe?: string; danfe?: string; status_nfe?: string; mensagens?: { cDescricao?: string }[] }[] = st?.ListaNfe || [];
    if (!lista.length) {
      // o que o OMIE diz vale mais que o espelho da pasta (que pode estar velho)
      if (String(st?.cancelada || "").toUpperCase() === "S") {
        return falha(`O pedido ${numPedido} está CANCELADO no Omie — não tem nota.`, "A pasta ainda mostra como ativo; a próxima sincronização corrige. Nada a buscar.");
      }
      if (String(st?.faturada || "").toUpperCase() === "N") {
        return falha(`O pedido ${numPedido} ainda não foi faturado no Omie, então não existe nota.`, "Fature o pedido no Omie e depois clique em buscar.");
      }
      return falha("O Omie não tem NF-e emitida para este pedido.", "Confira no Omie se a NF-e foi emitida. Se foi emitida por fora, anexe o PDF à mão.");
    }
    // a que TEM danfe primeiro (rejeitada e reemitida: a 1ª fica sem)
    const nfe = lista.find((n) => n?.danfe && String(n.danfe).trim()) || lista[lista.length - 1];
    const numero = String(nfe.numero_nfe || "").trim() || null;
    if (!nfe.danfe) {
      const motivo = String(nfe?.mensagens?.[0]?.cDescricao || "").trim();
      await supabase.from("portal_nt_clientes_pv").update({ nf_status: nfe.status_nfe || null, nf_motivo: motivo || null, ...(numero ? { numero_nf: numero } : {}) })
        .eq("empresa", empresa).eq("num_pedido", numPedido);
      return explicarNfeSemDanfe(String(nfe.status_nfe || ""), motivo);
    }
    const pdf = await baixarPdf(String(nfe.danfe));
    if (!pdf) return falha("O Omie mandou o link da DANFE, mas o arquivo não veio (não é um PDF).", "Tente de novo em alguns minutos.");
    const path = `${empresa.replace(/ /g, "_")}/pv_${numPedido}/danfe_${numero || numPedido}.pdf`;
    const { error: up } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (up) return falha("Achei a nota no Omie, mas não consegui guardar o PDF na pasta.", "Tente de novo. Se continuar, avise o T.I.", up.message);
    const link = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await supabase.from("portal_nt_clientes_pv")
      .update({ link_nf: link, faturado: true, nf_status: null, nf_motivo: null, ...(numero ? { numero_nf: numero } : {}) })
      .eq("empresa", empresa).eq("num_pedido", numPedido);
    if (e2) return falha("O PDF foi guardado, mas não consegui gravar no pedido.", "Tente de novo.", e2.message);
    return { ok: true, numero, link };
  } catch (e) {
    return explicarErroOmie(e instanceof Error ? e.message : String(e), "NF-e");
  }
}
