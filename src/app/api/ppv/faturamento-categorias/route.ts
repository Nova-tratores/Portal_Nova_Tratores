// /api/ppv/faturamento-categorias — categorias de faturamento do PPV (dropdown
// da NF-e), gerenciáveis no portal e espelhadas do Omie.
//   GET  ?empresa=Nova Tratores[&all=1]      -> lista (só ativas por padrão)
//   POST { action:'salvar', codigo, empresa, descricao, ativo, ordem }
//   POST { action:'excluir', codigo, empresa }
//   POST { action:'sincronizar', empresa }   -> puxa categorias de receita do Omie
// EXIGE login + módulo PPV. Escrita só aqui (service role); RLS bloqueia o cliente.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { listarCategoriasReceita, OMIE_ACCOUNTS } from "@/lib/financeiro/omie-contapagar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TBL = "ppv_faturamento_categorias";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const empresa = req.nextUrl.searchParams.get("empresa") || "";
  const all = req.nextUrl.searchParams.get("all") === "1";
  let q = supabase.from(TBL).select("codigo, empresa, descricao, ativo, ordem").order("ordem").order("codigo");
  if (empresa) q = q.eq("empresa", empresa);
  if (!all) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorias: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const empresa = String(body?.empresa || "").trim();

  if (action === "salvar") {
    const codigo = String(body?.codigo || "").trim();
    if (!codigo || !empresa) return NextResponse.json({ error: "Código e empresa são obrigatórios." }, { status: 400 });
    const row = {
      codigo, empresa,
      descricao: String(body?.descricao || "").trim() || null,
      ativo: body?.ativo === false ? false : true,
      ordem: Number.isFinite(Number(body?.ordem)) ? Number(body.ordem) : 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from(TBL).upsert(row, { onConflict: "codigo,empresa" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "excluir") {
    const codigo = String(body?.codigo || "").trim();
    if (!codigo || !empresa) return NextResponse.json({ error: "Código e empresa são obrigatórios." }, { status: 400 });
    const { error } = await supabase.from(TBL).delete().eq("codigo", codigo).eq("empresa", empresa);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "sincronizar") {
    if (!empresa) return NextResponse.json({ error: "Empresa obrigatória." }, { status: 400 });
    const acc = OMIE_ACCOUNTS.find((a) => a.name.toLowerCase() === empresa.toLowerCase());
    if (!acc) return NextResponse.json({ error: `Conta Omie "${empresa}" não configurada.` }, { status: 400 });
    let categorias;
    try {
      categorias = await listarCategoriasReceita(acc);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Omie." }, { status: 502 });
    }
    // Upsert só código+descrição: preserva ativo/ordem que o usuário ajustou.
    const rows = categorias.map((c) => ({
      codigo: c.codigo, empresa, descricao: c.descricao, updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await supabase.from(TBL).upsert(rows, { onConflict: "codigo,empresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, total: rows.length });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
