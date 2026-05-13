import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { nome, email, funcao } = await req.json();

    if (!nome || !email) {
      return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });
    }

    // Criar usuário no Supabase Auth com senha padrão
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: "nova123",
      email_confirm: true,
    });

    if (authError) {
      // Se usuário já existe no auth, continua para inserir na tabela
      if (!authError.message?.includes("already been registered")) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }

    // Inserir na tabela financeiro_usu
    const { error: dbError } = await supabase
      .from("financeiro_usu")
      .insert([{ nome, email, funcao }]);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, auth_user_id: authData?.user?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
