import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";
import { numeroNfse, contaOmieDaEmpresa, chaveOS } from "@/lib/clientes/numero-nf";
import { linkNoPortal, baixarPdf, pdfNfseNoOmie, guardarPdfNfse, numeroNfsePeloStatusOS } from "@/lib/clientes/nfse-omie";

// PDF da NFS-e de uma OS, direto do Omie, para o botão "Ver a nota" da pasta.
// Se a OS já tem o PDF no storage, devolve ele; senão acha a NFS-e da OS no
// Omie, pega o PDF (cPdfNFSe), GUARDA na pasta e grava o link na OS — da
// próxima vez abre direto. Mesma regra dos syncs (lib/clientes/nfse-omie).
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function pdfResposta(buf: Buffer, nome: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome.replace(/[^\w.\-]+/g, "_")}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

function falha(msg: string, status = 404) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const empresa = (sp.get("empresa") || "").trim();
  const codOS = Number(sp.get("cod_os") || 0);
  if (!empresa || !codOS) return falha("Informe empresa e cod_os", 400);

  const { data: os } = await supabase
    .from("portal_nt_clientes_os")
    .select("num_os, cod_os, num_nf, link_nf, faturada")
    .eq("empresa", empresa).eq("cod_os", codOS).maybeSingle();
  if (!os) return falha("OS não encontrada na pasta");
  const nome = `NF-servico-OS-${os.num_os}`;

  // 1) já guardado no storage do portal
  if (linkNoPortal(os.link_nf)) {
    const buf = await baixarPdf(os.link_nf);
    if (buf) return pdfResposta(buf, nome);
  }
  if (!os.faturada) return falha("A OS ainda não foi faturada — não há nota.");

  const acc = contaOmie(empresa);
  try {
    // 2) número da nota: OS → cache do dashboard → StatusOS no Omie
    let numero = numeroNfse(sp.get("num_nf")) || numeroNfse(os.num_nf);
    if (!numero) {
      const { data: c } = await supabase.from("os_nfse").select("nfse_num")
        .eq("conta_omie", contaOmieDaEmpresa(empresa)).eq("num_os", chaveOS(os.num_os)).eq("tem_nota", true).maybeSingle();
      numero = numeroNfse(c?.nfse_num);
    }
    if (!numero) numero = await numeroNfsePeloStatusOS(acc, codOS);
    if (!numero) return falha("O Omie não tem NFS-e emitida para esta OS (pode ter sido faturada só com recibo).");

    // 3) a NFS-e desta OS e o PDF
    const achado = await pdfNfseNoOmie(acc, codOS, numero);
    if (!achado) return falha(`Não achei no Omie a NFS-e ${numero} ligada a esta OS.`);
    if (!achado.urlPdf) return falha("O Omie ainda não gerou o PDF desta NFS-e. Tente de novo em alguns minutos.");
    const buf = await baixarPdf(achado.urlPdf);
    if (!buf) return falha("O Omie devolveu o link, mas o PDF não veio.", 502);

    // 4) guarda na pasta do cliente e grava na OS (falhar aqui não impede de mostrar)
    try {
      const link = await guardarPdfNfse(supabase, empresa, os.num_os, numero, buf);
      if (link) {
        await supabase.from("portal_nt_clientes_os")
          .update({ link_nf: link, ...(os.num_nf ? {} : { num_nf: numero }) })
          .eq("empresa", empresa).eq("cod_os", codOS);
      }
    } catch { /* fica pra próxima */ }

    return pdfResposta(buf, nome);
  } catch (e: unknown) {
    return falha(`Erro ao buscar a nota no Omie: ${e instanceof Error ? e.message : "erro"}`, 502);
  }
}
