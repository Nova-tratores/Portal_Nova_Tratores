import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_LOGS } from "@/lib/ppv/constants";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json([]);

  try {
    const logs = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_LOGS}?id_ppv=eq.${id}&order=id.desc`
    );
    return NextResponse.json(logs || []);
  } catch (e) {
    console.error("Erro logs:", e);
    return NextResponse.json([]);
  }
}
