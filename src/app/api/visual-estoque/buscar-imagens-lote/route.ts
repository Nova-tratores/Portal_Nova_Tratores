import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { buscarImagensBing } from "@/lib/visual-estoque/bing";

export const runtime = "nodejs";
export const maxDuration = 60;

// Busca imagens no Bing para máquinas sem imagem e salva. Porta
// /api/buscar-imagens-lote. Diferente do legado (que processava todas com
// sleep 1500ms), aqui limitamos a quantidade por chamada (`limite`, default 15)
// para caber na janela serverless. O front pode chamar em loop até zerar.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limite = Math.max(1, Math.min(40, Number(body?.limite) || 15));

    const { data: produtos } = await supabaseVE
      .from("produtos")
      .select("codigo_produto, descricao, familia_nome, imagem_url, estoque, inativo")
      .eq("inativo", false)
      .gt("estoque", 0)
      .neq("familia_nome", "Peças");

    const semImagem = (produtos || []).filter((p: any) => !p.imagem_url).slice(0, limite);
    if (semImagem.length === 0) {
      return NextResponse.json({ ok: true, total: 0, restantes: 0, mensagem: "Todas as máquinas já têm imagem" });
    }

    let salvos = 0;
    for (const p of semImagem) {
      try {
        const imagens = await buscarImagensBing(p.descricao, 1);
        if (imagens.length > 0) {
          await supabaseVE.from("produtos").update({ imagem_url: imagens[0] }).eq("codigo_produto", p.codigo_produto);
          salvos++;
        }
        await new Promise((r) => setTimeout(r, 800));
      } catch {
        // ignora falha individual (Bing pode bloquear) e segue
      }
    }

    // Quantos ainda faltam (excluindo os que acabamos de processar).
    const restantes = (produtos || []).filter((p: any) => !p.imagem_url).length - salvos;
    return NextResponse.json({ ok: true, total: salvos, processados: semImagem.length, restantes: Math.max(0, restantes) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
