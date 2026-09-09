// GET /api/pos/ordens/[id]/emails — histórico dos e-mails de peças da OS
// (aprovação + separação, tabela pos_emails) pro card do POS.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id: idOs } = await params;
  try {
    const { data, error } = await supabase
      .from("pos_emails")
      .select("id, tipo, para, assunto, data_servico, enviado_em")
      .eq("id_ordem", idOs)
      .order("id", { ascending: false });
    if (error) return NextResponse.json({ emails: [], aviso: "Rode a migration sql/pos-emails-pecas.sql" });
    return NextResponse.json({ emails: data || [] });
  } catch {
    return NextResponse.json({ emails: [] });
  }
}
