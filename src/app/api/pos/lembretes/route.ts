import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LEMBRETES } from "@/lib/pos/constants";

// GET /api/pos/lembretes — lista todos ou filtra por chave de cliente / cnpj
export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente");
  const nome = req.nextUrl.searchParams.get("nome");
  const cnpj = req.nextUrl.searchParams.get("cnpj");
  const todos = req.nextUrl.searchParams.get("todos"); // inclui concluidos
  // Lembretes ligados à OS / à requisição / por tipo ('manual' | 'cobranca_requisicao') (José, 26/10/2026)
  const idOrdem = req.nextUrl.searchParams.get("id_ordem");
  const tipo = req.nextUrl.searchParams.get("tipo");
  const requisicaoId = req.nextUrl.searchParams.get("requisicao_id");

  if (idOrdem || tipo || requisicaoId) {
    let q = supabase.from(TBL_LEMBRETES).select("*").order("created_at", { ascending: false });
    if (idOrdem) q = q.eq("id_ordem", idOrdem.trim());
    if (tipo) q = q.eq("tipo", tipo.trim());
    if (requisicaoId) q = q.eq("requisicao_id", Number(requisicaoId));
    if (!todos) q = q.eq("ativo", true).eq("concluido", false);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (cnpj) {
    const { data, error } = await supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .ilike("cliente_cnpj_cpf", `%${cnpj.replace(/\D/g, "")}%`)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (cliente) {
    // Aceita várias chaves separadas por vírgula (cliente juntado das duas
    // contas Omie): lembrete gravado em QUALQUER uma delas aparece
    const chaves = cliente.split(",").map((c) => c.trim()).filter(Boolean);
    let q = supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .filter("cliente_chaves", chaves.length > 1 ? "ov" : "cs", `{${chaves.map((c) => `"${c.replace(/"/g, "")}"`).join(",")}}`)
      .order("created_at", { ascending: false });

    if (!todos) q = q.eq("ativo", true).eq("concluido", false);

    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (nome) {
    let q = supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .ilike("cliente_nomes", `%${nome}%`)
      .order("created_at", { ascending: false });

    if (!todos) q = q.eq("ativo", true).eq("concluido", false);

    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  // Lista todos
  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST /api/pos/lembretes — criar lembrete
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cliente_chaves, cliente_nomes, lembrete, criado_por, cliente_cnpj_cpf } = body;

  if (!cliente_chaves?.length || !lembrete?.trim()) {
    return NextResponse.json({ erro: "Selecione ao menos um cliente e preencha o lembrete." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .insert({
      cliente_chaves,
      cliente_nomes,
      cliente_cnpj_cpf: cliente_cnpj_cpf || "",
      lembrete: lembrete.trim(),
      criado_por: criado_por || "Sistema",
      ativo: true,
      concluido: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // opcionais (sql/requisicoes-cobranca.sql); só vão quando informados (José, 26/10/2026)
      ...(body.id_ordem ? { id_ordem: String(body.id_ordem).trim() } : {}),
      ...(body.lembrar_em ? { lembrar_em: body.lembrar_em } : {}),
      ...(body.responsavel ? { responsavel: String(body.responsavel).trim() } : {}),
      // valor a cobrar / crédito do cliente: oferecido ao abrir a próxima OS (José, 27/10/2026)
      ...(Number(body.valor) > 0 && (body.valor_tipo === "cobrar" || body.valor_tipo === "credito")
        ? { valor: Math.round(Number(body.valor) * 100) / 100, valor_tipo: body.valor_tipo } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
