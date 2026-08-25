import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Galeria de figurinhas do NovaZap (ChatWoot) — compartilhada por todo
// mundo. Os arquivos vivem no bucket público `anexos`, pasta figurinhas/.
// GET lista, POST salva (base64), DELETE remove.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);

const BUCKET = "anexos";
const PASTA = "figurinhas";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB por figurinha

const CHATWOOT_ORIGIN =
  process.env.CHATWOOT_URL || "https://chatwoot-production-e3ef.up.railway.app";
const CORS = {
  "Access-Control-Allow-Origin": CHATWOOT_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PASTA, { limit: 500, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);

    const figurinhas = (data || [])
      .filter(f => f.name && !f.name.startsWith("."))
      .map(f => {
        const caminho = `${PASTA}/${f.name}`;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
        return { caminho, url: pub.publicUrl, nome: f.name };
      });

    return NextResponse.json({ figurinhas }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const base64 = String(body.base64 || "");
    const tipo = String(body.tipo || "image/webp");
    if (!base64) {
      return NextResponse.json({ error: "sem imagem" }, { status: 400, headers: CORS });
    }
    if (!/^image\/(webp|png|jpe?g)$/.test(tipo)) {
      return NextResponse.json({ error: "tipo inválido" }, { status: 400, headers: CORS });
    }

    const buf = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "imagem vazia ou maior que 2MB" },
        { status: 400, headers: CORS }
      );
    }

    const ext = tipo === "image/png" ? "png" : tipo.startsWith("image/jp") ? "jpg" : "webp";
    const caminho = `${PASTA}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, buf, { contentType: tipo, upsert: false });
    if (error) throw new Error(error.message);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
    return NextResponse.json(
      { ok: true, caminho, url: pub.publicUrl },
      { headers: CORS }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caminho = req.nextUrl.searchParams.get("caminho") || "";
    // só deixa apagar dentro da pasta de figurinhas
    if (!caminho.startsWith(`${PASTA}/`) || caminho.includes("..")) {
      return NextResponse.json({ error: "caminho inválido" }, { status: 400, headers: CORS });
    }
    const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
