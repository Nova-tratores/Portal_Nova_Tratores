import { NextResponse } from "next/server";
import { cronogramaAdmin } from "@/lib/cronograma/supabase-server";

// Lista os projetos do cronograma para o PPV escolher (alternativa a puxar o da OS).
export async function GET() {
  try {
    const { data, error } = await cronogramaAdmin()
      .schema("cronograma")
      .from("projetos")
      .select("id, nome, status, os_ref, tipo")
      .order("status", { ascending: true }) // ativos primeiro (ativo < concluido alfabeticamente? não — ordenamos no cliente)
      .order("nome", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // ativos no topo, depois o resto
    const ordem: Record<string, number> = { ativo: 0, pausado: 1, concluido: 2, cancelado: 3 };
    const lista = (data || []).sort((a: any, b: any) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9) || String(a.nome).localeCompare(String(b.nome), "pt"));
    return NextResponse.json(lista);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
