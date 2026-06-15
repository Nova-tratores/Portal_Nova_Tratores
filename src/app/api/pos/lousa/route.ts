import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TBL_LOUSA, TBL_LOUSA_CONFIG, TBL_OS, TBL_CLIENTES } from "@/lib/pos/constants";

// GET — buscar entradas da semana + verificar OS abertas + pedidos PPV
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio"); // YYYY-MM-DD (segunda)
  const fim = searchParams.get("fim");       // YYYY-MM-DD (sábado)
  const modo = searchParams.get("modo");

  if (modo === "clientes") {
    const q = searchParams.get("q") || "";
    const { data } = await supabase
      .from(TBL_CLIENTES)
      .select("cnpj_cpf, nome_fantasia, razao_social, cidade")
      .or(`nome_fantasia.ilike.%${q}%,razao_social.ilike.%${q}%,cnpj_cpf.ilike.%${q}%`)
      .limit(20);
    return NextResponse.json(data || []);
  }

  if (modo === "usuarios") {
    const { data } = await supabase
      .from("financeiro_usu")
      .select("id, nome, funcao")
      .eq("ativo", true)
      .order("nome");
    return NextResponse.json(data || []);
  }

  if (modo === "config") {
    const { data } = await supabase.from(TBL_LOUSA_CONFIG).select("*").eq("id", 1).maybeSingle();
    return NextResponse.json(data || { notificar_user_id: null, notificar_user_nome: null });
  }

  if (!inicio || !fim) {
    return NextResponse.json({ error: "inicio e fim obrigatórios" }, { status: 400 });
  }

  const { data: entradas, error } = await supabase
    .from(TBL_LOUSA)
    .select("*")
    .gte("data", inicio)
    .lte("data", fim)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entradas || entradas.length === 0) return NextResponse.json([]);

  // Pegar CNPJs únicos para verificar OS abertas
  const cnpjs = [...new Set(entradas.map((e) => e.cliente_cnpj).filter(Boolean))];

  const osAbertas: Record<string, { id_ordem: string; status: string; temPPV: boolean }[]> = {};

  if (cnpjs.length > 0) {
    // Coluna correta na Ordem_Servico é "Cnpj_Cliente"; PPV vem do campo ID_PPV da própria OS
    const { data: ordens } = await supabase
      .from(TBL_OS)
      .select("Id_Ordem, Cnpj_Cliente, Status, ID_PPV")
      .in("Cnpj_Cliente", cnpjs)
      .not("Status", "in", '("Concluída","Concluida","Cancelada","cancelada")');

    (ordens || []).forEach((o: any) => {
      const cnpj = o.Cnpj_Cliente;
      if (!cnpj) return;
      if (!osAbertas[cnpj]) osAbertas[cnpj] = [];
      osAbertas[cnpj].push({ id_ordem: String(o.Id_Ordem), status: o.Status, temPPV: !!o.ID_PPV });
    });
  }

  // Enriquecer cada entrada
  const resultado = entradas.map((e) => {
    const cnpj = e.cliente_cnpj;
    const ordensCliente = cnpj ? osAbertas[cnpj] || [] : [];
    const temOsAberta = ordensCliente.length > 0;
    const temPedidoPPV = ordensCliente.some((o) => o.temPPV);
    return {
      ...e,
      temOsAberta,
      ordensAbertas: ordensCliente.map(({ id_ordem, status }) => ({ id_ordem, status })),
      temPedidoPPV,
    };
  });

  return NextResponse.json(resultado);
}

// POST — criar entrada
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, cliente_cnpj, cliente_nome, descricao, criado_por_id, criado_por_nome, cor, tecnico_nome, periodo, tipo, tecnico_acompanhante } = body;
  const tipoFinal = tipo || "servico";

  // Cliente só é obrigatório para serviço; faltou/feriado/saida não precisam
  if (!data || !criado_por_id || !criado_por_nome || (tipoFinal === "servico" && !cliente_nome)) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const { data: novo, error } = await supabase
    .from(TBL_LOUSA)
    .insert({ data, tipo: tipoFinal, cliente_cnpj: cliente_cnpj || null, cliente_nome, descricao: descricao || null, criado_por_id, criado_por_nome, cor: cor || "#3b82f6", tecnico_nome: tecnico_nome || null, periodo: periodo || "manha", tecnico_acompanhante: tecnico_acompanhante || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(novo);
}

// PATCH — atualizar entrada ou config
export async function PATCH(req: NextRequest) {
  const body = await req.json();

  if (body.modo === "config") {
    const { notificar_user_id, notificar_user_nome } = body;
    const { error } = await supabase
      .from(TBL_LOUSA_CONFIG)
      .upsert({ id: 1, notificar_user_id, notificar_user_nome, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  campos.updated_at = new Date().toISOString();
  const { data: atualizado, error } = await supabase
    .from(TBL_LOUSA)
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(atualizado);
}

// DELETE — remover entrada
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from(TBL_LOUSA).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
