import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { randomUUID } from "crypto";

// POST /api/carrinhos/:id/share  -> gera (ou reaproveita) o token público e devolve o link.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { data: cart } = await supabase.from("carrinhos").select("share_token").eq("id", id).maybeSingle();
    let token = cart?.share_token as string | null;
    if (!token) {
      token = randomUUID().replace(/-/g, "");
      const { error } = await supabase.from("carrinhos").update({ share_token: token }).eq("id", id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
