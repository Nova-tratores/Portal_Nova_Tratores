import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_OS } from "@/lib/ppv/constants";
import type { OSBusca } from "@/lib/ppv/types";

// Status considerados "abertos" (não finalizados)
const STATUS_ABERTOS = [
  "Orçamento",
  "Orçamento enviado para o cliente e aguardando",
  "Aguardando ordem Técnico",
  "Execução",
  "Execução Procurando peças",
  "Execução aguardando peças (em transporte)",
  "Aguardando outros",
  "Executada",
  "Executada aguardando cliente",
  "Executada aguardando comercial",
];

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";
  const abertas = req.nextUrl.searchParams.get("abertas") === "1";

  try {
    let url: string;

    if (abertas) {
      // Buscar todas as OS abertas (não concluídas/canceladas)
      const statusFilter = STATUS_ABERTOS.map((s) => `Status.eq.${encodeURIComponent(s)}`).join(",");
      url = `${TBL_OS}?or=(${statusFilter})&select=Id_Ordem,Os_Cliente,Status,Serv_Solicitado&order=Id_Ordem.desc&limit=200`;
    } else if (termo.trim()) {
      const query = termo.trim().replace(/ /g, "%");
      url = `${TBL_OS}?or=(Id_Ordem.ilike.*${query}*,Os_Cliente.ilike.*${query}*,Serv_Solicitado.ilike.*${query}*)&select=Id_Ordem,Os_Cliente,Status,Serv_Solicitado&limit=30&order=Id_Ordem.desc`;
    } else {
      return NextResponse.json([]);
    }

    const res = await supabaseFetch<Record<string, unknown>[]>(url);
    const resultados: OSBusca[] = res.map((row) => ({
      id: String(row.Id_Ordem),
      cliente: String(row.Os_Cliente || "Sem Cliente"),
      status: String(row.Status || "N/A"),
      servSolicitado: String(row.Serv_Solicitado || "-"),
    }));
    return NextResponse.json(resultados);
  } catch (e) {
    console.error("Erro busca OS:", e);
    return NextResponse.json([]);
  }
}
