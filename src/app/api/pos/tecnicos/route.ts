import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_TECNICOS, TBL_OS } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const contarServicos = req.nextUrl.searchParams.get("contarServicos");
  const osAtual = req.nextUrl.searchParams.get("osAtual") || "";

  if (contarServicos) {
    const { data: ordens } = await supabase
      .from(TBL_OS)
      .select("Id_Ordem")
      .eq("Os_Tecnico", contarServicos)
      .in("Status", [
        "Execução",
        "Execução (Realizando Diagnóstico)",
        "Execução aguardando peças (em transporte)",
      ]);
    const count = (ordens || []).filter(o => o.Id_Ordem !== osAtual).length;
    return NextResponse.json({ servicosEmExecucao: count });
  }

  const { data } = await supabase.from(TBL_TECNICOS).select("*");
  // ?perfil=1 → nome + e-mail (o filtro do POS casa com a conta do portal p/ foto e "inativado")
  if (req.nextUrl.searchParams.get("perfil")) {
    // inativo = conta do portal (financeiro_usu) com ativo=false, casada pelo e-mail
    const { data: usus } = await supabase.from("financeiro_usu").select("email, ativo");
    const ativoPorEmail = new Map((usus || []).map((u) => [String(u.email || "").trim().toLowerCase(), u.ativo !== false]));
    const lista = (data || [])
      .map((t) => {
        const email = String(t.UsuEmail || "").trim().toLowerCase();
        return { nome: String(t.UsuNome || "Técnico").trim(), email, inativo: ativoPorEmail.has(email) ? !ativoPorEmail.get(email) : false };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json(lista);
  }
  const nomes = (data || []).map((t) => t.UsuNome || "Técnico").sort();
  return NextResponse.json(nomes);
}
