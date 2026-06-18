import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { titulo, descricao, link, userId, alvo } = await req.json();
  // alvo: "financeiro" | "posvendas" | undefined (todos com acesso)

  if (!titulo) {
    return NextResponse.json({ error: "titulo obrigatório" }, { status: 400 });
  }

  // Buscar permissões + função do usuário
  const { data: permissoes } = await supabase
    .from("portal_permissoes")
    .select("user_id, is_admin, modulos_permitidos");

  if (!permissoes || permissoes.length === 0) {
    return NextResponse.json({ notificados: 0 });
  }

  // IDs de quem tem acesso ao financeiro
  let destinatariosIds = permissoes
    .filter((p) => {
      if (p.user_id === userId) return false;
      return p.is_admin || (p.modulos_permitidos || []).includes("financeiro");
    })
    .map((p) => p.user_id);

  // Se tem alvo específico, filtrar por função
  if (alvo && destinatariosIds.length > 0) {
    const { data: usuarios } = await supabase
      .from("financeiro_usu")
      .select("id, funcao")
      .eq("ativo", true)
      .in("id", destinatariosIds);

    if (usuarios) {
      if (alvo === "financeiro") {
        // Notificar apenas quem tem função "Financeiro"
        const idsFinanceiro = usuarios.filter((u) => u.funcao === "Financeiro").map((u) => u.id);
        destinatariosIds = destinatariosIds.filter((id) => idsFinanceiro.includes(id));
      } else if (alvo === "posvendas") {
        // Notificar quem NÃO é Financeiro (Pós-Vendas e outros)
        const idsFinanceiro = usuarios.filter((u) => u.funcao === "Financeiro").map((u) => u.id);
        destinatariosIds = destinatariosIds.filter((id) => !idsFinanceiro.includes(id));
      }
    }
  }

  if (destinatariosIds.length === 0) {
    return NextResponse.json({ notificados: 0 });
  }

  await supabase.from("portal_notificacoes").insert(
    destinatariosIds.map((uid) => ({
      user_id: uid,
      tipo: "financeiro",
      titulo,
      descricao: descricao || null,
      link: link || null,
    }))
  );

  return NextResponse.json({ notificados: destinatariosIds.length });
}
