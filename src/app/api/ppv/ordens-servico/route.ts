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
  "Execução (Realizando Diagnóstico)",
  "Execução aguardando peças (em transporte)",
  "Aguardando outros",
  "Executada",
  "Relatório Concluído",
  "Executada aguardando comercial",
];

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";
  const abertas = req.nextUrl.searchParams.get("abertas") === "1";
  const id = req.nextUrl.searchParams.get("id");

  // Detalhe de UMA OS (pra auto-preencher o PPV ao vincular): cliente, documento,
  // técnico, projeto e a "Solicitação do cliente" (texto dentro do Serv_Solicitado).
  if (id) {
    try {
      const url = `${TBL_OS}?Id_Ordem=eq.${encodeURIComponent(id)}&select=Id_Ordem,Os_Cliente,Cnpj_Cliente,Os_Tecnico,Projeto,Serv_Solicitado&limit=1`;
      const res = await supabaseFetch<Record<string, unknown>[]>(url);
      const row = res[0];
      if (!row) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
      const serv = String(row.Serv_Solicitado || "");
      // Pega o que vem depois de "Solicitação do cliente:" até "Serviço Realizado:" (ou o fim).
      const m = serv.match(/Solicita[çc][ãa]o do cliente:\s*([\s\S]*?)(?:\n\s*Servi[çc]o Realizado:|$)/i);
      const solicitacao = (m ? m[1] : "").trim();
      return NextResponse.json({
        id: String(row.Id_Ordem),
        cliente: String(row.Os_Cliente || ""),
        documento: String(row.Cnpj_Cliente || ""),
        tecnico: String(row.Os_Tecnico || ""),
        projeto: String(row.Projeto || ""),
        solicitacao,
      });
    } catch (e) {
      console.error("Erro detalhe OS:", e);
      return NextResponse.json({ error: "erro" }, { status: 500 });
    }
  }

  try {
    let url: string;

    if (abertas) {
      // Buscar todas as OS abertas (não concluídas/canceladas)
      // Usa in.() com valores entre aspas duplas para suportar status que contêm parênteses
      // (ex: "Execução (Realizando Diagnóstico)") que quebrariam o or=() do PostgREST
      const statusList = STATUS_ABERTOS.map((s) => `"${s}"`).join(",");
      url = `${TBL_OS}?Status=in.(${encodeURIComponent(statusList)})&select=Id_Ordem,Os_Cliente,Status,Serv_Solicitado&order=Id_Ordem.desc&limit=200`;
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
