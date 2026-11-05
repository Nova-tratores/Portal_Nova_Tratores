import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabase } from "@/lib/pos/supabase";

const TBL = "resumo_diario_tecnico";

/** GET — buscar resumo de um técnico em uma data */
// Usado pelo BlocoVisaoGeral (Painel Mecânicos, hoje aposentado): Mecânicos ou POS.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "mecanicos" }, { modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  const tecnico = searchParams.get("tecnico");

  if (!data || !tecnico) {
    return NextResponse.json({ erro: "data e tecnico obrigatórios" }, { status: 400 });
  }

  const { data: row } = await supabase
    .from(TBL)
    .select("*")
    .eq("data", data)
    .eq("tecnico_nome", tecnico)
    .maybeSingle();

  return NextResponse.json(row || null);
}

/** POST — salvar/atualizar resumo diário (upsert) */
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "mecanicos" }, { modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const dados = await req.json();
  const { data, tecnico_nome, horas_dirigindo, km_percorrido, horas_no_cliente, resumo } = dados;

  if (!data || !tecnico_nome) {
    return NextResponse.json({ erro: "data e tecnico_nome obrigatórios" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from(TBL)
    .upsert({
      data,
      tecnico_nome,
      horas_dirigindo: parseFloat(horas_dirigindo || 0),
      km_percorrido: parseFloat(km_percorrido || 0),
      horas_no_cliente: parseFloat(horas_no_cliente || 0),
      resumo: resumo || "",
      updated_at: new Date().toISOString(),
    }, { onConflict: "data,tecnico_nome" })
    .select()
    .single();

  if (error) {
    console.error("[resumo-diario] Erro:", error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json(row);
}
