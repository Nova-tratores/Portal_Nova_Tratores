// /api/ppv/anexos — mídias + comentários de um PPV.
//   GET  ?id=PPV-xxxx                         -> lista (mais recentes primeiro)
//   POST multipart {id, autor, file}          -> anexa mídia (bucket requisicoes)
//   POST json {id, comentario, autor}         -> adiciona comentário
//   DELETE ?anexoId=123                        -> remove um anexo/comentário
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TBL = "ppv_anexos";
const BUCKET = "requisicoes";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Passe ?id=" }, { status: 400 });
  const { data, error } = await supabase.from(TBL).select("*").eq("id_pedido", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ anexos: data || [] });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const id = String(fd.get("id") || "");
      const autor = String(fd.get("autor") || "");
      const idTarefa = fd.get("id_tarefa") ? Number(fd.get("id_tarefa")) : null;
      const file = fd.get("file") as File | null;
      if (!id || !file) return NextResponse.json({ error: "id e file são obrigatórios" }, { status: 400 });
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `ppv/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, { upsert: true, contentType: file.type });
      if (upErr) return NextResponse.json({ error: `Falha no upload: ${upErr.message}` }, { status: 500 });
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from(TBL).insert({ id_pedido: id, tipo: "midia", url, nome_arquivo: file.name, autor, id_tarefa: idTarefa });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, url });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    const comentario = String(body?.comentario || "").trim();
    const autor = String(body?.autor || "");
    const idTarefa = body?.id_tarefa ? Number(body.id_tarefa) : null;
    if (!id || !comentario) return NextResponse.json({ error: "id e comentário são obrigatórios" }, { status: 400 });
    const { error } = await supabase.from(TBL).insert({ id_pedido: id, tipo: "comentario", comentario, autor, id_tarefa: idTarefa });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const anexoId = req.nextUrl.searchParams.get("anexoId") || "";
  if (!anexoId) return NextResponse.json({ error: "Passe ?anexoId=" }, { status: 400 });
  const { error } = await supabase.from(TBL).delete().eq("id", anexoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
