import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protegerRota } from "@/lib/ajustes/permissao-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function sanitizeFileName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "");
}

// O bucket "equipamentos" é público: só aceita imagem.
function arquivoNaoImagem(file: File | null): boolean {
  return !!file && file.size > 0 && !String(file.type || "").startsWith("image/");
}

// Tela /propostas: TratorModal = pode('propostas','criar'); TratorEditModal = pode('propostas','editar').
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "propostas", acao: "criar" }]);
  if (g.resposta) return g.resposta;
  try {
    const fd = await req.formData();

    const fields = [
      "marca", "modelo", "motor", "transmissao_diant", "bomb_inje",
      "bomb_hidra", "embreagem", "capacit_comb", "cambio", "reversor",
      "trasmissao_tras", "oleo_motor", "oleo_trasmissao", "diant_min_max",
      "tras_min_max", "obs", "ano", "finame/ncm",
    ];

    const row: Record<string, string> = {};
    for (const key of fields) {
      const val = fd.get(key) as string | null;
      if (val) row[key] = val;
    }

    if (!row.marca || !row.modelo) {
      return NextResponse.json({ error: "Marca e modelo são obrigatórios" }, { status: 400 });
    }

    const file = fd.get("file") as File | null;
    if (arquivoNaoImagem(file)) {
      return NextResponse.json({ error: "O arquivo precisa ser uma imagem" }, { status: 400 });
    }
    if (file && file.size > 0) {
      const cleanName = sanitizeFileName(file.name);
      const filePath = `equipamentos/${Date.now()}-${cleanName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("equipamentos")
        .upload(filePath, buffer, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("equipamentos").getPublicUrl(filePath);
      row.imagem = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("cad_trator")
      .insert([row])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[propostas/trator POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "propostas", acao: "editar" }]);
  if (g.resposta) return g.resposta;
  try {
    const fd = await req.formData();
    const id = fd.get("id") as string;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const fields = [
      "marca", "modelo", "motor", "transmissao_diant", "bomb_inje",
      "bomb_hidra", "embreagem", "capacit_comb", "cambio", "reversor",
      "trasmissao_tras", "oleo_motor", "oleo_trasmissao", "diant_min_max",
      "tras_min_max", "obs", "ano", "finame/ncm",
    ];

    const row: Record<string, string> = {};
    for (const key of fields) {
      const val = fd.get(key) as string | null;
      if (val !== null) row[key] = val;
    }

    const file = fd.get("file") as File | null;
    if (arquivoNaoImagem(file)) {
      return NextResponse.json({ error: "O arquivo precisa ser uma imagem" }, { status: 400 });
    }
    if (file && file.size > 0) {
      const cleanName = sanitizeFileName(file.name);
      const filePath = `equipamentos/${Date.now()}-${cleanName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("equipamentos")
        .upload(filePath, buffer, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("equipamentos").getPublicUrl(filePath);
      row.imagem = urlData.publicUrl;
    }

    const { error } = await supabase.from("cad_trator").update(row).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[propostas/trator PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
