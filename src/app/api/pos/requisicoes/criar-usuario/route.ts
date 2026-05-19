import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  try {
    const { nome, email, funcao, senha, modulos_permitidos } = await req.json();

    if (!nome || !email) {
      return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });
    }

    // Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha || "nova123",
      email_confirm: true,
    });

    if (authError) {
      // Se usuário já existe no auth, continua para inserir na tabela
      if (!authError.message?.includes("already been registered")) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }

    const userId = authData?.user?.id;

    // Inserir na tabela financeiro_usu
    const insertData: any = { nome, email, funcao };
    if (userId) insertData.id = userId;

    const { error: dbError } = await supabase
      .from("financeiro_usu")
      .insert([insertData]);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    // Criar permissões se fornecidas
    if (userId && modulos_permitidos) {
      await supabase.from("portal_permissoes").insert([{
        user_id: userId,
        is_admin: false,
        categoria: '',
        modulos_permitidos: modulos_permitidos || [],
        mecanico_role: null,
        mecanico_tecnico_nome: null,
      }]);
    }

    return NextResponse.json({ ok: true, auth_user_id: userId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
