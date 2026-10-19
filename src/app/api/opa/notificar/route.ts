import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Dispara uma notificação no sino pra TODO MUNDO QUE TEM ACESSO AO OPA
// (todos os usuários do portal — Opa é acessível a todos). Exclui quem criou.
// O Opa não tem módulo (menu sempre visível, como /sat): basta estar logado.
export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "nao autenticado" }, { status: 401 });
  try {
    const { opa_id, titulo, descricao } = await req.json();
    // Quem criou vem do login, nunca do corpo.
    const criado_por_id = auth.userId;
    if (!titulo) return NextResponse.json({ error: "titulo obrigatório" }, { status: 400 });

    // Quem tem acesso ao Opa = todos os usuários do portal (uma linha por usuário em portal_permissoes)
    const { data: users } = await supabase.from("portal_permissoes").select("user_id");
    const ids = [...new Set((users || []).map((u) => u.user_id).filter(Boolean))]
      .filter((id) => id !== criado_por_id);

    if (ids.length === 0) return NextResponse.json({ ok: true, enviadas: 0 });

    const rows = ids.map((user_id) => ({
      user_id,
      tipo: "opa",
      titulo: `Novo Opa: ${titulo}`,
      descricao: descricao || null,
      link: "/opa",
      icone: "🚨",
    }));

    const { error } = await supabase.from("portal_notificacoes").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, enviadas: rows.length, opa_id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "erro" }, { status: 500 });
  }
}
