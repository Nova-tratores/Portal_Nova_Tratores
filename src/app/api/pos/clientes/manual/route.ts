import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_CLIENTES_MANUAIS } from "@/lib/pos/constants";

export async function POST(req: NextRequest) {
  const dados = await req.json();
  const { error } = await supabase.from(TBL_CLIENTES_MANUAIS).insert({
    Cli_Nome: dados.nome,
    Cli_Cpf_Cnpj: dados.cpf,
    Cli_Email: dados.email,
    Cli_Fone: dados.telefone,
    Cli_Endereco: dados.endereco,
    Cli_Cidade: dados.cidade,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
