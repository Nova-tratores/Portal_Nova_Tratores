import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/auth/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  try {
    // Só admin pode criar usuário (antes era um endpoint público de provisionamento).
    const auth = await exigirAdmin(req);
    if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

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

    let userId = authData?.user?.id ?? null;

    if (authError) {
      if (!authError.message?.includes("already been registered")) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
      // O e-mail JÁ tem conta de login (órfã — caso real: contas criadas e
      // nunca cadastradas). Recupera o id pelo generateLink (não envia nada)
      // e reaproveita a conta, aplicando a senha que o admin digitou.
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      userId = linkData?.user?.id ?? null;
      if (!userId) {
        return NextResponse.json(
          { error: `Este e-mail já tem conta de login, mas não consegui localizá-la (${linkErr?.message || "sem detalhe"}).` },
          { status: 400 },
        );
      }
      await supabase.auth.admin.updateUserById(userId, {
        password: senha || "nova123",
        email_confirm: true,
      });
    }

    if (!userId) {
      // NUNCA inserir cadastro sem id (era o "null value in column id")
      return NextResponse.json({ error: "O auth não devolveu o id do usuário — tente novamente." }, { status: 500 });
    }

    // Cadastro (upsert: conta reaproveitada pode já ter linha)
    const { error: dbError } = await supabase
      .from("financeiro_usu")
      .upsert([{ id: userId, nome, email, funcao, ativo: true }], { onConflict: "id" });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    // Permissões (atualiza se já existir linha do user)
    if (modulos_permitidos) {
      const { data: permExistente } = await supabase
        .from("portal_permissoes")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (permExistente) {
        await supabase
          .from("portal_permissoes")
          .update({ modulos_permitidos: modulos_permitidos || [] })
          .eq("user_id", userId);
      } else {
        await supabase.from("portal_permissoes").insert([{
          user_id: userId,
          is_admin: false,
          categoria: '',
          modulos_permitidos: modulos_permitidos || [],
          mecanico_role: null,
          mecanico_tecnico_nome: null,
        }]);
      }
    }

    return NextResponse.json({ ok: true, auth_user_id: userId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
