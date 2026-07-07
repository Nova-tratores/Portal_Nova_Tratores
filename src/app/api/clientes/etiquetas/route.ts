import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";

// GET — listar etiquetas disponíveis, ou etiquetas+descricao de um cliente, ou mapa completo
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cnpj = searchParams.get("cnpj");
  const modo = searchParams.get("modo");

  // Mapa completo: retorna todas as etiquetas, vínculos, e nomes (para propagar cores)
  if (modo === "mapa") {
    const [{ data: etiquetas }, { data: mapa }] = await Promise.all([
      supabase.from("cliente_etiquetas").select("*").order("nome"),
      supabase.from("cliente_etiqueta_map").select("cnpj_cpf, etiqueta_id"),
    ]);
    const cnpjs = [...new Set((mapa || []).map((m: any) => m.cnpj_cpf))];
    let clientes: any[] = [];
    if (cnpjs.length > 0) {
      const { data } = await supabase
        .from("portal_nt_clientes_PRINCIPAL")
        .select("cnpj_cpf, nome_fantasia, razao_social")
        .in("cnpj_cpf", cnpjs);
      clientes = data || [];
    }
    return NextResponse.json({ etiquetas: etiquetas || [], mapa: mapa || [], clientes: clientes || [] });
  }

  // Etiquetas + descrição de um cliente específico
  if (cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const [{ data: vinculos }, { data: extras }] = await Promise.all([
      supabase
        .from("cliente_etiqueta_map")
        .select("etiqueta_id, cliente_etiquetas(id, nome, cor)")
        .eq("cnpj_cpf", cnpjLimpo),
      supabase.from("cliente_extras").select("descricao").eq("cnpj_cpf", cnpjLimpo).maybeSingle(),
    ]);
    const etiquetas = (vinculos || []).map((v: any) => v.cliente_etiquetas).filter(Boolean);
    return NextResponse.json({ etiquetas, descricao: extras?.descricao || "" });
  }

  // Lista todas as etiquetas disponíveis
  const { data } = await supabase.from("cliente_etiquetas").select("*").order("nome");
  return NextResponse.json({ etiquetas: data || [] });
}

// POST — criar nova etiqueta
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nome, cor } = body;
  if (!nome) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("cliente_etiquetas")
    .insert({ nome: nome.toUpperCase(), cor: cor || "#3b82f6" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — atualizar etiqueta, vincular/desvincular cliente, ou salvar descrição
export async function PATCH(req: NextRequest) {
  const body = await req.json();

  // Salvar descrição do cliente
  if (body.modo === "descricao") {
    const { cnpj_cpf, descricao } = body;
    if (!cnpj_cpf) return NextResponse.json({ error: "cnpj_cpf obrigatório" }, { status: 400 });
    const cnpjLimpo = cnpj_cpf.replace(/\D/g, "");
    const { error } = await supabase
      .from("cliente_extras")
      .upsert({ cnpj_cpf: cnpjLimpo, descricao: descricao || "" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Vincular etiqueta a cliente
  if (body.modo === "vincular") {
    const { cnpj_cpf, etiqueta_id } = body;
    const cnpjLimpo = cnpj_cpf.replace(/\D/g, "");
    const { error } = await supabase
      .from("cliente_etiqueta_map")
      .upsert({ cnpj_cpf: cnpjLimpo, etiqueta_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Desvincular etiqueta de cliente
  if (body.modo === "desvincular") {
    const { cnpj_cpf, etiqueta_id } = body;
    const cnpjLimpo = cnpj_cpf.replace(/\D/g, "");
    const { error } = await supabase
      .from("cliente_etiqueta_map")
      .delete()
      .eq("cnpj_cpf", cnpjLimpo)
      .eq("etiqueta_id", etiqueta_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Atualizar etiqueta (nome/cor)
  if (body.id) {
    const { id, nome, cor } = body;
    const updates: Record<string, string> = {};
    if (nome) updates.nome = nome.toUpperCase();
    if (cor) updates.cor = cor;
    const { error } = await supabase.from("cliente_etiquetas").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "modo inválido" }, { status: 400 });
}

// DELETE — excluir etiqueta (cascade remove vínculos)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await supabase.from("cliente_etiquetas").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
