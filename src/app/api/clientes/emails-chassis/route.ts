import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(req: NextRequest) {
  const chassis = req.nextUrl.searchParams.get("chassis");
  if (!chassis) return NextResponse.json({ error: "Passe ?chassis=XXXXX" }, { status: 400 });

  try {
    const { data: emails } = await supabase
      .from("projeto_emails")
      .select("*")
      .eq("chassis", chassis)
      .neq("uid", 0)
      .order("data", { ascending: false });

    return NextResponse.json({
      chassis,
      total: emails?.length || 0,
      emails: (emails || []).map(e => ({
        ...e,
        anexos: typeof e.anexos === "string" ? JSON.parse(e.anexos) : (e.anexos || []),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
