import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

/** POST — cria um novo caminho (tecnico_caminhos) vinculado à agenda */
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "mecanicos" }, { modulo: "painel-mecanicos" }]);
  if (g.resposta) return g.resposta;
  const { tecnico_nome, destino, cidade, motivo } = await req.json();

  if (!tecnico_nome || !destino) {
    return NextResponse.json({ erro: "tecnico_nome e destino obrigatórios" }, { status: 400 });
  }

  // Verificar se já tem um caminho em_transito ativo para esse técnico
  const { data: ativo } = await supabase
    .from("tecnico_caminhos")
    .select("id")
    .eq("tecnico_nome", tecnico_nome)
    .eq("status", "em_transito")
    .limit(1);

  // Se já tem um ativo, não cria outro
  if (ativo && ativo.length > 0) {
    return NextResponse.json({ ok: true, existente: true, id: ativo[0].id });
  }

  const { data, error } = await supabase
    .from("tecnico_caminhos")
    .insert({
      tecnico_nome,
      destino: destino || "",
      cidade: cidade || "",
      motivo: motivo || "",
      status: "em_transito",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
