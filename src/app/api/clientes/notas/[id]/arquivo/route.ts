// PDF/XML de uma nota do cache para a Pasta Clientes (módulo clientes). Nota de entrada
// continua exigindo a permissão de Recebimentos (valor de compra). Sem arquivo guardado,
// busca no Omie na hora e guarda (mesma regra do /api/financeiro/notas/[id]/arquivo).
import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { COLS, guardarNota, lerArquivo, migracaoFaltando } from "@/lib/notas/cache-docs";
import { nomeArquivo, podeVerEntrada, type LinhaDoc } from "@/lib/notas/cache-regras";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tipo = req.nextUrl.searchParams.get("tipo") === "xml" ? "xml" : "pdf";
  const guarda = await protegerRota(req, [{ modulo: "clientes" }]);
  if (guarda.resposta) return guarda.resposta;
  const idNum = parseInt((await params).id, 10);
  if (!idNum) return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin.from("notas_fiscais_docs").select(COLS).eq("id", idNum).maybeSingle();
    if (error) throw new Error(error.message);
    let l = data as unknown as LinhaDoc | null;
    if (!l) return NextResponse.json({ erro: "nota não encontrada" }, { status: 404 });
    if (l.tipo === "entrada" && !podeVerEntrada(guarda.user.isAdmin, guarda.user.modulos)) {
      return NextResponse.json({ erro: "Nota de entrada: precisa da permissão de Recebimentos." }, { status: 403 });
    }
    let path = tipo === "pdf" ? l.pdf_path : l.xml_path;
    if (!path) {
      const r = await guardarNota(l);
      if (r.bloqueio || r.omieFora) return NextResponse.json({ erro: "Omie indisponível agora e esta nota ainda não estava guardada. Tente em alguns minutos." }, { status: 503 });
      const { data: d2 } = await supabaseAdmin.from("notas_fiscais_docs").select(COLS).eq("id", idNum).maybeSingle();
      l = (d2 as unknown as LinhaDoc) || l;
      path = tipo === "pdf" ? l.pdf_path : l.xml_path;
      if (!path) return NextResponse.json({ erro: r.erro || `O Omie não devolveu o ${tipo.toUpperCase()} desta nota.` }, { status: 404 });
    }
    const buf = await lerArquivo(path);
    if (!buf) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": tipo === "pdf" ? "application/pdf" : "application/xml; charset=utf-8",
        "Content-Disposition": `${tipo === "xml" ? "attachment" : "inline"}; filename="${nomeArquivo(l, tipo)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (migracaoFaltando(msg)) return NextResponse.json({ erro: "Cache de notas ainda não instalado no banco." }, { status: 503 });
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
