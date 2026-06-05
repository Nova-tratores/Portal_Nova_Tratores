import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function sanitizeFileName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const marca = fd.get("marca") as string;
    const modelo = fd.get("modelo") as string;
    const descricao = fd.get("descricao") as string || "";
    const finame = fd.get("finame") as string || "";
    const configuracao = fd.get("configuracao") as string || "";
    const ano = fd.get("ano") as string || new Date().getFullYear().toString();
    const file = fd.get("file") as File | null;

    if (!marca || !modelo) {
      return NextResponse.json({ error: "Marca e modelo são obrigatórios" }, { status: 400 });
    }

    let imagem = "";
    if (file && file.size > 0) {
      const cleanName = sanitizeFileName(file.name);
      const filePath = `equipamentos/${Date.now()}-${cleanName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("equipamentos")
        .upload(filePath, buffer, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("equipamentos").getPublicUrl(filePath);
      imagem = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("Equipamentos")
      .insert([{ marca, modelo, descricao, finame, configuracao, ano, imagem }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("[propostas/equipamento POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const fd = await req.formData();
    const id = fd.get("id") as string;
    const file = fd.get("file") as File | null;

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    let imagem = (fd.get("imagem") as string) || undefined;
    if (file && file.size > 0) {
      const cleanName = sanitizeFileName(file.name);
      const filePath = `equipamentos/${Date.now()}-${cleanName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("equipamentos")
        .upload(filePath, buffer, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("equipamentos").getPublicUrl(filePath);
      imagem = urlData.publicUrl;
    }

    const campos: Record<string, string> = {};
    for (const key of ["marca", "modelo", "descricao", "finame", "configuracao", "ano"]) {
      const val = fd.get(key) as string | null;
      if (val !== null) campos[key] = val;
    }
    if (imagem !== undefined) campos.imagem = imagem;

    const { error } = await supabase
      .from("Equipamentos")
      .update(campos)
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[propostas/equipamento PATCH]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
