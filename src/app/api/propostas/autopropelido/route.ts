import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function sanitizeFileName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "");
}

const FIELDS = [
  "marca", "modelo", "ano", "finame/ncm",
  "motor", "transmissao", "tanque_pulv", "tecnologia", "telemetria",
  "barra_pulv", "num_secoes", "espac_bicos", "vao_livre", "bitola", "tanque_comb",
];

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();

    const row: Record<string, string> = {};
    for (const key of FIELDS) {
      const val = fd.get(key) as string | null;
      if (val) row[key] = val;
    }

    const file = fd.get("file") as File | null;
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

    if (!row.marca || !row.modelo) {
      return NextResponse.json({ error: "Marca e modelo são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("cad_autopropelido")
      .insert([row])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[propostas/autopropelido POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const fd = await req.formData();
    const id = fd.get("id") as string;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const row: Record<string, string> = {};
    for (const key of FIELDS) {
      const val = fd.get(key) as string | null;
      if (val !== null) row[key] = val;
    }

    const file = fd.get("file") as File | null;
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

    const { error } = await supabase.from("cad_autopropelido").update(row).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[propostas/autopropelido PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
