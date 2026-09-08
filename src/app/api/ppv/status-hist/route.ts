import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoModulo } from "@/lib/ajustes/permissao-server";
import { supabaseFetch } from "@/lib/ppv/supabase";

// Histórico de mudanças de fase de UM pedido (tabela pedidos_status_hist,
// preenchida pelo trigger tg_ppv_status_hist — migration sql/ppv-status-hist.sql).
// Leitura via service role; a tabela tem RLS sem policy. Quem trocou a fase
// continua no logs_ppv (o trigger não conhece o usuário).
export const dynamic = "force-dynamic";

interface LinhaHist {
  id: number;
  id_pedido: string;
  status_de: string | null;
  status_para: string;
  dias_na_fase: number | null;
  manual_override: boolean | null;
  criado_em: string;
}

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, "ppv");
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
  }
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!/^[A-Za-z]{2,4}-?\d{1,8}$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    const linhas = await supabaseFetch<LinhaHist[]>(
      `pedidos_status_hist?select=id,id_pedido,status_de,status_para,dias_na_fase,manual_override,criado_em&id_pedido=eq.${encodeURIComponent(id)}&order=criado_em.asc,id.asc`,
    );
    return NextResponse.json({ id, historico: linhas || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    // Tabela ainda não criada → devolve vazio com aviso, não 500 (a tela segue).
    if (/does not exist|schema cache|PGRST/i.test(msg)) return NextResponse.json({ id, historico: [], migrationFaltando: true });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
