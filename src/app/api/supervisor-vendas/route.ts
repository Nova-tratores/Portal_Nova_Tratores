import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function startOfDay() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString() }
function startOfWeek() { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0,0,0,0); return d.toISOString() }
function startOfMonth() { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString() }

export async function GET(req: NextRequest) {
  const acao = req.nextUrl.searchParams.get("acao") || "kpis";

  try {
    if (acao === "kpis") {
      const hoje = startOfDay(), semana = startOfWeek(), mes = startOfMonth();
      const [{ data: visitas }, { data: negocios }] = await Promise.all([
        supabase.from("vw_visitas_detalhadas").select("*").order("data_visita", { ascending: false }),
        supabase.from("vw_negocios_detalhados").select("*").order("created_at", { ascending: false }),
      ]);
      const v = visitas || [], n = negocios || [];
      return NextResponse.json({
        visitasHoje: v.filter(x => x.data_visita >= hoje).length,
        visitasSemana: v.filter(x => x.data_visita >= semana).length,
        visitasMes: v.filter(x => x.data_visita >= mes).length,
        visitasRetroativas: v.filter(x => x.retroativa).length,
        posVendasPendentes: v.filter(x => x.acionar_pos_vendas && !x.pos_vendas_resolvido).length,
        pipeline: n.filter(x => x.status !== "fechado_perdido").reduce((s: number, x: any) => s + (x.valor || 0), 0),
        negociosFechadosMes: n.filter(x => x.status === "fechado_ganho" && x.updated_at >= mes).length,
        totalVisitas: v.length,
        totalNegocios: n.length,
      });
    }

    if (acao === "vendedores") {
      const semana = startOfWeek();
      const [{ data: vends }, { data: visitas }, { data: negocios }] = await Promise.all([
        supabase.from("vendedores").select("*").eq("ativo", true),
        supabase.from("vw_visitas_detalhadas").select("*"),
        supabase.from("vw_negocios_detalhados").select("*"),
      ]);
      const result = (vends || []).map((vd: any) => {
        const vv = (visitas || []).filter((x: any) => x.vendedor_id === vd.id);
        const nn = (negocios || []).filter((x: any) => x.vendedor_id === vd.id);
        const pipeline = nn.filter((x: any) => x.status !== "fechado_perdido").reduce((s: number, x: any) => s + (x.valor || 0), 0);
        const ultima = vv.length > 0 ? vv.sort((a: any, b: any) => b.data_visita.localeCompare(a.data_visita))[0].data_visita : null;
        return {
          id: vd.id, nome: vd.nome,
          visitasSemana: vv.filter((x: any) => x.data_visita >= semana).length,
          totalVisitas: vv.length, pipeline, ultimaVisita: ultima,
          retroativas: vv.filter((x: any) => x.retroativa).length,
        };
      });
      return NextResponse.json(result);
    }

    if (acao === "visitas") {
      const vendedorId = req.nextUrl.searchParams.get("vendedor_id");
      const tipo = req.nextUrl.searchParams.get("tipo");
      const dateFrom = req.nextUrl.searchParams.get("from");
      const dateTo = req.nextUrl.searchParams.get("to");
      const posVendas = req.nextUrl.searchParams.get("pos_vendas");
      let query = supabase.from("vw_visitas_detalhadas").select("*");
      if (vendedorId) query = query.eq("vendedor_id", vendedorId);
      if (tipo) query = query.eq("tipo", tipo);
      if (dateFrom) query = query.gte("data_visita", dateFrom);
      if (dateTo) query = query.lte("data_visita", dateTo);
      if (posVendas === "true") query = query.eq("acionar_pos_vendas", true);
      query = query.order("data_visita", { ascending: false }).limit(500);
      const { data } = await query;
      return NextResponse.json(data || []);
    }

    if (acao === "alertas") {
      const [{ data: visitas }, { data: vends }] = await Promise.all([
        supabase.from("vw_visitas_detalhadas").select("*"),
        supabase.from("vendedores").select("*").eq("ativo", true),
      ]);
      const alertas: any[] = [];
      // Sem GPS
      for (const v of (visitas || [])) {
        if (v.tipo === "presencial" && !v.latitude && !v.longitude) {
          alertas.push({ tipo: "sem_gps", severidade: "alta", vendedor: v.vendedor_nome, data: v.data_visita, descricao: `Visita presencial sem GPS` });
        }
        if (v.retroativa) {
          alertas.push({ tipo: "retroativa", severidade: "media", vendedor: v.vendedor_nome, data: v.data_visita, descricao: `Visita retroativa: ${(v.resumo || "").substring(0, 80)}` });
        }
      }
      // Inativos
      const semana = startOfWeek();
      for (const vd of (vends || [])) {
        const vv = (visitas || []).filter((x: any) => x.vendedor_id === vd.id);
        const ultima = vv.length > 0 ? vv.sort((a: any, b: any) => b.data_visita.localeCompare(a.data_visita))[0].data_visita : null;
        const dias = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000) : 999;
        if (dias >= 3) {
          alertas.push({
            tipo: "inativo", severidade: dias > 7 || !ultima ? "alta" : "media",
            vendedor: vd.nome, data: ultima,
            descricao: ultima ? `${dias} dias sem visita` : "Nunca registrou visita",
          });
        }
      }
      return NextResponse.json(alertas);
    }

    if (acao === "pos_vendas_resolver") {
      const id = req.nextUrl.searchParams.get("id");
      const resolvido = req.nextUrl.searchParams.get("resolvido") === "true";
      if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
      await supabase.from("visitas").update({ pos_vendas_resolvido: resolvido }).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "acao desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
